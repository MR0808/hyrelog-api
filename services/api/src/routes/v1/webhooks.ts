import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getLogger } from '../../lib/logger.js';
import { getRateLimiter } from '../../lib/rateLimit.js';
import {
  requireIpAllowlistForKeyManagement,
  logKeyManagementOperation,
  getKeyManagementRateLimit,
} from '../../lib/keyManagementSecurity.js';
import {
  generateWebhookSecret,
  hashWebhookSecret,
} from '../../lib/webhookSigning.js';
import {
  encryptWebhookSecret,
} from '../../lib/webhookEncryption.js';
import {
  requireFeature,
  requireLimit,
  getLimit,
  PlanRestrictionError,
} from '../../lib/plans.js';
import { createHash } from 'crypto';

const logger = getLogger();

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(['AUDIT_EVENT_CREATED'])).optional().default(['AUDIT_EVENT_CREATED']),
  projectId: z.string().uuid().nullable().optional(), // Allow null for workspace-wide webhooks
  secretLabel: z.string().optional(),
});

const QueryDeliveriesSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.enum(['PENDING', 'SENDING', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED']).optional(),
});

/**
 * Validate webhook URL
 * - Must be HTTPS in production
 * - Allow http://localhost in development
 */
function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  const urlObj = new URL(url);
  const isLocalhost = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
  const isHttps = urlObj.protocol === 'https:';
  const isHttp = urlObj.protocol === 'http:';

  // In production, must be HTTPS
  if (process.env.NODE_ENV === 'production' && !isHttps) {
    return {
      valid: false,
      error: 'Webhook URLs must use HTTPS in production',
    };
  }

  // Allow http://localhost in development
  if (isLocalhost && isHttp) {
    return { valid: true };
  }

  // Otherwise require HTTPS
  if (!isHttps) {
    return {
      valid: false,
      error: 'Webhook URLs must use HTTPS (http://localhost allowed in development only)',
    };
  }

  return { valid: true };
}

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/workspaces/:workspaceId/webhooks - Create webhook endpoint
  fastify.post('/workspaces/:workspaceId/webhooks', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can manage webhooks
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can manage webhooks',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Require IP allowlist for key management operations
    const ipCheck = requireIpAllowlistForKeyManagement(request, request.apiKey);
    if (!ipCheck.allowed) {
      return reply.code(403).send({
        error: ipCheck.error || 'IP allowlist required for webhook management',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Stricter rate limiting for key management
    const rateLimiter = getRateLimiter();
    const keyMgmtLimit = getKeyManagementRateLimit();
    const rateCheck = rateLimiter.check(
      `key-mgmt:${request.apiKey.id}`,
      'apiKey',
      keyMgmtLimit.perMinute
    );

    if (!rateCheck.allowed) {
      reply.header('X-RateLimit-Limit', keyMgmtLimit.perMinute.toString());
      reply.header('X-RateLimit-Remaining', '0');
      reply.header('X-RateLimit-Reset', rateCheck.resetAt.toISOString());
      reply.header('Retry-After', rateCheck.retryAfter?.toString() || '60');

      return reply.code(429).send({
        error: 'Rate limit exceeded for webhook management operations',
        code: 'RATE_LIMITED',
      });
    }

    const workspaceId = (request.params as any).workspaceId;
    const prisma = request.prisma;

    // Verify workspace belongs to company
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!workspace) {
      return reply.code(404).send({
        error: 'Workspace not found',
        code: 'NOT_FOUND',
      });
    }

    // Validate request body
    const bodyResult = CreateWebhookSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.errors,
      });
    }

    const data = bodyResult.data;

    // Validate webhook URL
    const urlValidation = validateWebhookUrl(data.url);
    if (!urlValidation.valid) {
      return reply.code(400).send({
        error: urlValidation.error || 'Invalid webhook URL',
        code: 'VALIDATION_ERROR',
      });
    }

    // Verify project belongs to workspace if provided
    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: data.projectId,
          workspaceId,
        },
      });

      if (!project) {
        return reply.code(404).send({
          error: 'Project not found or does not belong to workspace',
          code: 'NOT_FOUND',
        });
      }
    }

    // PLAN GATING: Check if webhooks are enabled for this plan
    const company = await prisma.company.findUnique({
      where: { id: request.apiKey.companyId },
      select: { planTier: true },
    });

    if (!company) {
      return reply.code(404).send({
        error: 'Company not found',
        code: 'NOT_FOUND',
      });
    }

    try {
      requireFeature(company.planTier, 'webhooksEnabled', 'GROWTH');
    } catch (error) {
      if (error instanceof PlanRestrictionError) {
        return reply.code(403).send({
          error: 'Webhooks require a Growth plan or higher',
          code: 'PLAN_RESTRICTED',
        });
      }
      throw error;
    }

    // PLAN GATING: Check webhook limit
    const existingWebhooks = await prisma.webhookEndpoint.count({
      where: {
        workspaceId,
        companyId: request.apiKey.companyId,
        status: 'ACTIVE',
      },
    });

    // Check if adding one more webhook would exceed the limit
    const newCount = existingWebhooks + 1;
    try {
      requireLimit(company.planTier, 'maxWebhooks', newCount, 'GROWTH');
    } catch (error) {
      if (error instanceof PlanRestrictionError) {
        const limit = getLimit(company.planTier, 'maxWebhooks');
        return reply.code(403).send({
          error: `Webhook limit exceeded. Current plan allows ${limit} webhooks (you have ${existingWebhooks}, attempting to create ${newCount}).`,
          code: 'PLAN_RESTRICTED',
        });
      }
      throw error;
    }

    // Generate webhook secret
    const plaintextSecret = generateWebhookSecret();
    const hashedSecret = hashWebhookSecret(plaintextSecret);
    const encryptedSecret = encryptWebhookSecret(plaintextSecret);

    // Create webhook endpoint
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        companyId: request.apiKey.companyId,
        workspaceId,
        projectId: data.projectId || null,
        url: data.url,
        secretHashed: hashedSecret,
        secretEncrypted: encryptedSecret,
        events: data.events,
        status: 'ACTIVE',
      },
    });

    // AUDIT: Log webhook creation
    logKeyManagementOperation('create', request, request.apiKey, {
      webhookId: webhook.id,
      workspaceId,
      projectId: data.projectId,
      url: data.url,
    });

    // Return webhook (secret shown only once)
    return reply.code(201).send({
      id: webhook.id,
      url: webhook.url,
      status: webhook.status,
      events: webhook.events,
      projectId: webhook.projectId,
      secret: plaintextSecret, // Shown only once
      createdAt: webhook.createdAt,
    });
  });

  // GET /v1/workspaces/:workspaceId/webhooks - List webhooks
  fastify.get('/workspaces/:workspaceId/webhooks', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can list webhooks
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can list webhooks',
        code: 'FORBIDDEN',
      });
    }

    const workspaceId = (request.params as any).workspaceId;
    const prisma = request.prisma;

    // Verify workspace belongs to company
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!workspace) {
      return reply.code(404).send({
        error: 'Workspace not found',
        code: 'NOT_FOUND',
      });
    }

    // List webhooks
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        workspaceId,
        companyId: request.apiKey.companyId,
      },
      select: {
        id: true,
        url: true,
        status: true,
        events: true,
        projectId: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
        // Do not return secret
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ webhooks });
  });

  // POST /v1/webhooks/:webhookId/disable - Disable webhook
  fastify.post('/webhooks/:webhookId/disable', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can manage webhooks
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can manage webhooks',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Require IP allowlist
    const ipCheck = requireIpAllowlistForKeyManagement(request, request.apiKey);
    if (!ipCheck.allowed) {
      return reply.code(403).send({
        error: ipCheck.error || 'IP allowlist required for webhook management',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Rate limiting
    const rateLimiter = getRateLimiter();
    const keyMgmtLimit = getKeyManagementRateLimit();
    const rateCheck = rateLimiter.check(
      `key-mgmt:${request.apiKey.id}`,
      'apiKey',
      keyMgmtLimit.perMinute
    );

    if (!rateCheck.allowed) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
      });
    }

    const webhookId = (request.params as any).webhookId;
    const prisma = request.prisma;

    // Find webhook
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!webhook) {
      return reply.code(404).send({
        error: 'Webhook not found',
        code: 'NOT_FOUND',
      });
    }

    // Disable webhook
    const updated = await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: { status: 'DISABLED' },
    });

    logKeyManagementOperation('disable', request, request.apiKey, {
      webhookId: webhook.id,
    });

    return reply.send({
      id: updated.id,
      status: updated.status,
    });
  });

  // POST /v1/webhooks/:webhookId/enable - Enable webhook
  fastify.post('/webhooks/:webhookId/enable', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can manage webhooks
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can manage webhooks',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Require IP allowlist
    const ipCheck = requireIpAllowlistForKeyManagement(request, request.apiKey);
    if (!ipCheck.allowed) {
      return reply.code(403).send({
        error: ipCheck.error || 'IP allowlist required for webhook management',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Rate limiting
    const rateLimiter = getRateLimiter();
    const keyMgmtLimit = getKeyManagementRateLimit();
    const rateCheck = rateLimiter.check(
      `key-mgmt:${request.apiKey.id}`,
      'apiKey',
      keyMgmtLimit.perMinute
    );

    if (!rateCheck.allowed) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
      });
    }

    const webhookId = (request.params as any).webhookId;
    const prisma = request.prisma;

    // Find webhook
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!webhook) {
      return reply.code(404).send({
        error: 'Webhook not found',
        code: 'NOT_FOUND',
      });
    }

    // Enable webhook
    const updated = await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: { status: 'ACTIVE' },
    });

    logKeyManagementOperation('enable', request, request.apiKey, {
      webhookId: webhook.id,
    });

    return reply.send({
      id: updated.id,
      status: updated.status,
    });
  });

  // GET /v1/webhooks/:webhookId/deliveries - Get delivery attempts
  fastify.get('/webhooks/:webhookId/deliveries', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can view deliveries
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can view webhook deliveries',
        code: 'FORBIDDEN',
      });
    }

    const webhookId = (request.params as any).webhookId;
    const prisma = request.prisma;

    // Verify webhook belongs to company
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!webhook) {
      return reply.code(404).send({
        error: 'Webhook not found',
        code: 'NOT_FOUND',
      });
    }

    // Validate query parameters
    const queryResult = QueryDeliveriesSchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: queryResult.error.errors,
      });
    }

    const query = queryResult.data;

    // Build where clause
    const where: any = {
      webhookId,
    };

    if (query.status) {
      where.status = query.status;
    }

    // Fetch delivery attempts
    const attempts = await prisma.webhookDeliveryAttempt.findMany({
      where,
      take: query.limit + 1, // Fetch one extra to check if there's more
      orderBy: { createdAt: 'desc' },
    });

    // Check if there's a next page
    const hasMore = attempts.length > query.limit;
    const data = hasMore ? attempts.slice(0, query.limit) : attempts;

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const last = data[data.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        })
      ).toString('base64');
    }

    return reply.send({
      data,
      nextCursor,
    });
  });
};

