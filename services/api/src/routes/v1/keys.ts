import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateApiKey, hashApiKey } from '../../lib/apiKey.js';
import { getApiKeyCache } from '../../lib/apiKeyCache.js';
import { getRegionRouter } from '../../lib/regionRouter.js';
import { getLogger } from '../../lib/logger.js';
import { getRateLimiter } from '../../lib/rateLimit.js';
import {
  requireIpAllowlistForKeyManagement,
  logKeyManagementOperation,
  getKeyManagementRateLimit,
} from '../../lib/keyManagementSecurity.js';

const logger = getLogger();

const CreateKeySchema = z.object({
  label: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  ipAllowlist: z.array(z.string()).optional(),
});

export const keysRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/workspaces/:workspaceId/keys - Create workspace key
  // SECURITY: Requires company key with IP allowlist
  fastify.post('/workspaces/:workspaceId/keys', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can create workspace keys
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can create workspace keys',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Require IP allowlist for key management operations
    const ipCheck = requireIpAllowlistForKeyManagement(request, request.apiKey);
    if (!ipCheck.allowed) {
      return reply.code(403).send({
        error: ipCheck.error || 'IP allowlist required for key management',
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
        error: 'Rate limit exceeded for key management operations',
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
    const bodyResult = CreateKeySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.errors,
      });
    }

    const data = bodyResult.data;

    // Generate new key
    const plaintextKey = generateApiKey('WORKSPACE');
    const hashedKey = hashApiKey(plaintextKey);

    // Create API key
    const apiKey = await prisma.apiKey.create({
      data: {
        prefix: plaintextKey.substring(0, 20), // First 20 chars as prefix
        hashedKey,
        scope: 'WORKSPACE',
        status: 'ACTIVE',
        workspaceId,
        companyId: request.apiKey.companyId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        ipAllowlist: data.ipAllowlist || [],
        labels: data.label ? [data.label] : [],
      },
    });

    // AUDIT: Log key creation
    logKeyManagementOperation('create', request, request.apiKey, {
      newKeyId: apiKey.id,
      workspaceId,
      label: data.label,
    });

    // Return key (plaintext shown only once)
    return reply.code(201).send({
      apiKey: plaintextKey,
      id: apiKey.id,
      prefix: apiKey.prefix,
      scope: apiKey.scope,
      workspaceId: apiKey.workspaceId,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    });
  });

  // NOTE: Revoke endpoint removed - key revocation is now dashboard-only
  // This prevents accidental or malicious revocation via API
  // Use the dashboard for key revocation with proper confirmation dialogs

  // POST /v1/keys/:keyId/rotate - Rotate key
  // SECURITY: Requires company key with IP allowlist, stricter rate limiting
  fastify.post('/keys/:keyId/rotate', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Only company keys can rotate keys
    if (request.apiKey.scope !== 'COMPANY') {
      return reply.code(403).send({
        error: 'Only company keys can rotate keys',
        code: 'FORBIDDEN',
      });
    }

    // SECURITY: Require IP allowlist for key management operations
    const ipCheck = requireIpAllowlistForKeyManagement(request, request.apiKey);
    if (!ipCheck.allowed) {
      return reply.code(403).send({
        error: ipCheck.error || 'IP allowlist required for key management',
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
        error: 'Rate limit exceeded for key management operations',
        code: 'RATE_LIMITED',
      });
    }

    const keyId = (request.params as any).keyId;
    const prisma = request.prisma;

    // Find key
    const key = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        companyId: request.apiKey.companyId,
      },
    });

    if (!key) {
      return reply.code(404).send({
        error: 'API key not found',
        code: 'NOT_FOUND',
      });
    }

    // Prevent rotating already revoked keys
    if (key.status === 'REVOKED') {
      return reply.code(400).send({
        error: 'Cannot rotate a revoked key',
        code: 'VALIDATION_ERROR',
      });
    }

    // Generate new key
    const plaintextKey = generateApiKey(key.scope as 'COMPANY' | 'WORKSPACE');
    const hashedKey = hashApiKey(plaintextKey);

    // Create new key
    const newKey = await prisma.apiKey.create({
      data: {
        prefix: plaintextKey.substring(0, 20),
        hashedKey,
        scope: key.scope,
        status: 'ACTIVE',
        companyId: key.companyId,
        workspaceId: key.workspaceId,
        expiresAt: key.expiresAt,
        ipAllowlist: key.ipAllowlist,
        labels: key.labels,
        rotatedFromId: key.id,
      },
    });

    // Update old key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        status: 'REVOKED',
        rotatedToId: newKey.id,
      },
    });

    // Clear cache for old key
    const cache = getApiKeyCache();
    cache.delete(key.hashedKey);

    // AUDIT: Log key rotation
    logKeyManagementOperation('rotate', request, request.apiKey, {
      oldKeyId: key.id,
      newKeyId: newKey.id,
      keyScope: key.scope,
    });

    return reply.send({
      apiKey: plaintextKey,
      id: newKey.id,
      prefix: newKey.prefix,
      scope: newKey.scope,
      rotatedFromId: key.id,
    });
  });

  // GET /v1/keys/status - Get key status
  // Read-only operation, less restrictive
  fastify.get('/keys/status', async (request, reply) => {
    if (!request.apiKey || !request.prisma) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    const prisma = request.prisma;

    // Find key
    const key = await prisma.apiKey.findUnique({
      where: { id: request.apiKey.id },
    });

    if (!key) {
      return reply.code(404).send({
        error: 'API key not found',
        code: 'NOT_FOUND',
      });
    }

    // AUDIT: Log status check (lower priority, but still logged)
    logKeyManagementOperation('status', request, request.apiKey);

    return reply.send({
      id: key.id,
      prefix: key.prefix,
      scope: key.scope,
      status: key.status,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      lastUsedIp: key.lastUsedIp,
      lastUsedEndpoint: key.lastUsedEndpoint,
      // Health score placeholder
      healthScore: key.status === 'ACTIVE' && (!key.expiresAt || key.expiresAt > new Date()) ? 100 : 0,
    });
  });
};
