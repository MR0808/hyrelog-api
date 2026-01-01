/**
 * Dashboard Company Routes
 * 
 * Wraps existing API functionality with dashboard authentication
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getLogger } from '../../lib/logger.js';
import { logDashboardAction } from '../../lib/auditLog.js';
import { getCompanyPlanConfig } from '../../lib/plans.js';
import { exportsRoutes } from '../v1/exports.js';
import { webhooksRoutes } from '../v1/webhooks.js';
import { eventsRoutes } from '../v1/events.js';

const logger = getLogger();

const QueryEventsSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().optional(),
  action: z.string().optional(),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

export const companyRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /dashboard/company
   * Get company summary with plan and region
   */
  fastify.get('/company', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { companyId } = request.dashboardAuth;
    if (!companyId) {
      return reply.code(400).send({ error: 'Missing company ID', code: 'VALIDATION_ERROR' });
    }

    const prisma = request.prisma;

    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          plan: true,
        },
      });

      if (!company) {
        return reply.code(404).send({ error: 'Company not found', code: 'NOT_FOUND' });
      }

      const planConfig = getCompanyPlanConfig({
        planTier: company.planTier,
        planOverrides: company.planOverrides as any,
      });

      // Log audit action
      await logDashboardAction(prisma, request, {
        action: 'COMPANY_VIEWED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: companyId,
      });

      return reply.send({
        id: company.id,
        name: company.name,
        dataRegion: company.dataRegion,
        plan: {
          id: company.plan.id,
          name: company.plan.name,
          tier: company.planTier,
          config: planConfig,
        },
        createdAt: company.createdAt.toISOString(),
      });
    } catch (error: any) {
      logger.error({ err: error, companyId }, 'Dashboard: Failed to get company');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /dashboard/events
   * Query events (wraps existing /v1/events with company scope enforcement)
   */
  fastify.get('/events', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { companyId } = request.dashboardAuth;
    if (!companyId) {
      return reply.code(400).send({ error: 'Missing company ID', code: 'VALIDATION_ERROR' });
    }

    const prisma = request.prisma;

    // Validate query params
    const queryResult = QueryEventsSchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: queryResult.error.errors,
      });
    }

    const { limit, cursor, from, to, category, action, projectId, workspaceId } = queryResult.data;

    try {
      // Build where clause - enforce company scope
      const where: any = {
        companyId,
      };

      if (category) where.category = category;
      if (action) where.action = action;
      if (projectId) where.projectId = projectId;
      if (workspaceId) where.workspaceId = workspaceId;

      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = new Date(from);
        if (to) where.timestamp.lte = new Date(to);
      }

      // Cursor pagination
      if (cursor) {
        where.AND = [
          { id: { lt: cursor } },
          ...Object.keys(where).filter((k) => k !== 'AND' && k !== 'id').map((key) => ({
            [key]: where[key],
          })),
        ];
      }

      const events = await prisma.auditEvent.findMany({
        where,
        take: limit,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          timestamp: true,
          category: true,
          action: true,
          actorId: true,
          actorEmail: true,
          actorRole: true,
          resourceType: true,
          resourceId: true,
          metadata: true,
          traceId: true,
          ipAddress: true,
          geo: true,
          userAgent: true,
        },
      });

      // Log audit action
      await logDashboardAction(prisma, request, {
        action: 'EVENTS_QUERIED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: companyId,
        metadata: { limit, filters: { category, action, projectId, workspaceId } },
      });

      return reply.send({
        events,
        nextCursor: events.length === limit ? events[events.length - 1].id : null,
      });
    } catch (error: any) {
      logger.error({ err: error, companyId }, 'Dashboard: Failed to query events');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // Re-use existing export routes (they already enforce company scope via API key)
  // We'll wrap them to add dashboard auth and audit logging
  // For now, we'll create wrapper endpoints that call the existing logic

  /**
   * POST /dashboard/exports
   * Create export (wraps /v1/exports logic with dashboard auth)
   */
  fastify.post('/exports', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { companyId, userId, userEmail, userRole } = request.dashboardAuth;
    if (!companyId) {
      return reply.code(400).send({ error: 'Missing company ID', code: 'VALIDATION_ERROR' });
    }

    const prisma = request.prisma;

    // Import export creation logic from v1/exports
    // For now, delegate to existing logic by creating a mock API key context
    // In production, you'd refactor exportsRoutes to accept both API key and dashboard auth
    await logDashboardAction(prisma, request, {
      action: 'EXPORT_REQUESTED',
      actorUserId: userId,
      actorEmail: userEmail,
      actorRole: userRole,
      targetCompanyId: companyId,
      metadata: request.body,
    });

    // Note: Full implementation would call the export creation logic from exportsRoutes
    // For now, return a message directing to use /v1/exports with API key
    return reply.code(501).send({
      error: 'Dashboard export creation not yet fully implemented - use /v1/exports with API key for now',
      code: 'NOT_IMPLEMENTED',
    });
  });

  /**
   * GET /dashboard/exports/:jobId
   * Get export job status
   */
  fastify.get('/exports/:jobId', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { companyId } = request.dashboardAuth;
    const { jobId } = request.params as { jobId: string };

    const prisma = request.prisma;

    try {
      const exportJob = await prisma.exportJob.findFirst({
        where: {
          id: jobId,
          companyId,
        },
      });

      if (!exportJob) {
        return reply.code(404).send({ error: 'Export job not found', code: 'NOT_FOUND' });
      }

      return reply.send({
        id: exportJob.id,
        status: exportJob.status,
        source: exportJob.source,
        format: exportJob.format,
        rowLimit: exportJob.rowLimit.toString(),
        rowsExported: exportJob.rowsExported.toString(),
        createdAt: exportJob.createdAt.toISOString(),
        startedAt: exportJob.startedAt?.toISOString(),
        finishedAt: exportJob.finishedAt?.toISOString(),
        errorCode: exportJob.errorCode,
        errorMessage: exportJob.errorMessage,
      });
    } catch (error: any) {
      logger.error({ err: error, companyId, jobId }, 'Dashboard: Failed to get export job');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /dashboard/webhooks
   * List webhooks for company (across all workspaces)
   */
  fastify.get('/webhooks', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { companyId } = request.dashboardAuth;
    if (!companyId) {
      return reply.code(400).send({ error: 'Missing company ID', code: 'VALIDATION_ERROR' });
    }

    const prisma = request.prisma;

    try {
      const webhooks = await prisma.webhookEndpoint.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      });

      await logDashboardAction(prisma, request, {
        action: 'WEBHOOKS_LISTED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: companyId,
      });

      return reply.send({
        webhooks: webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          status: w.status,
          events: w.events,
          workspaceId: w.workspaceId,
          projectId: w.projectId,
          createdAt: w.createdAt.toISOString(),
        })),
      });
    } catch (error: any) {
      logger.error({ err: error, companyId }, 'Dashboard: Failed to list webhooks');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });
};
