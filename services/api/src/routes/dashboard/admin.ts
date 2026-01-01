/**
 * Dashboard Admin Routes
 * 
 * Admin-only endpoints for managing companies, plans, and restore requests
 * Requires userRole === 'HYRELOG_ADMIN'
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getLogger } from '../../lib/logger.js';
import { logDashboardAction } from '../../lib/auditLog.js';
import { getRegionRouter } from '../../lib/regionRouter.js';
import {
  initiateRestore,
  checkRestoreStatus,
} from '../../lib/glacierRestore.js';
import { getS3Bucket } from '../../lib/config.js';

const logger = getLogger();
const regionRouter = getRegionRouter();

const AssignPlanSchema = z.object({
  planId: z.string().uuid(),
});

const RejectRestoreSchema = z.object({
  reason: z.string().optional(),
});

/**
 * Check if user is HyreLog admin
 */
function requireHyrelogAdmin(request: any, reply: any): boolean {
  if (!request.dashboardAuth || request.dashboardAuth.userRole !== 'HYRELOG_ADMIN') {
    reply.code(403).send({
      error: 'Admin access required',
      code: 'FORBIDDEN',
    });
    return false;
  }
  return true;
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /dashboard/admin/companies
   * List/search companies
   */
  fastify.get('/admin/companies', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const prisma = request.prisma;
    const query = request.query as { search?: string; limit?: string; cursor?: string };

    try {
      const limit = Math.min(parseInt(query.limit || '50', 10), 200);
      const where: any = {};

      if (query.search) {
        where.name = { contains: query.search, mode: 'insensitive' };
      }

      const companies = await prisma.company.findMany({
        where,
        include: {
          plan: true,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      });

      return reply.send({
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          dataRegion: c.dataRegion,
          planTier: c.planTier,
          plan: {
            id: c.plan.id,
            name: c.plan.name,
          },
          createdAt: c.createdAt.toISOString(),
        })),
        nextCursor: companies.length === limit ? companies[companies.length - 1].id : null,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Admin: Failed to list companies');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /dashboard/admin/plans
   * List all plans
   */
  fastify.get('/admin/plans', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const prisma = request.prisma;

    try {
      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { planTier: 'asc' },
      });

      return reply.send({
        plans: plans.map((p) => ({
          id: p.id,
          name: p.name,
          planTier: p.planTier,
          planType: p.planType,
          description: p.description,
          isDefault: p.isDefault,
        })),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Admin: Failed to list plans');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * POST /dashboard/admin/companies/:id/plan
   * Assign plan to company
   */
  fastify.post('/admin/companies/:id/plan', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const { id: companyId } = request.params as { id: string };
    const prisma = request.prisma;

    // Validate request body
    const bodyResult = AssignPlanSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.errors,
      });
    }

    const { planId } = bodyResult.data;

    try {
      // Verify company exists
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: { plan: true },
      });

      if (!company) {
        return reply.code(404).send({ error: 'Company not found', code: 'NOT_FOUND' });
      }

      // Verify plan exists
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        return reply.code(404).send({ error: 'Plan not found', code: 'NOT_FOUND' });
      }

      // Update company plan
      await prisma.company.update({
        where: { id: companyId },
        data: {
          planId,
          planTier: plan.planTier,
        },
      });

      // Log audit action
      await logDashboardAction(prisma, request, {
        action: 'PLAN_ASSIGNED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: companyId,
        metadata: {
          oldPlanId: company.planId,
          newPlanId: planId,
          planName: plan.name,
        },
      });

      return reply.send({ success: true });
    } catch (error: any) {
      logger.error({ err: error, companyId, planId }, 'Admin: Failed to assign plan');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /dashboard/admin/restore-requests
   * List all restore requests (admin view)
   */
  fastify.get('/admin/restore-requests', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const prisma = request.prisma;
    const query = request.query as { status?: string; limit?: string };

    try {
      const limit = Math.min(parseInt(query.limit || '100', 10), 200);
      const where: any = {};

      if (query.status) {
        where.status = query.status;
      }

      const requests = await prisma.glacierRestoreRequest.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true },
          },
          archive: {
            select: {
              id: true,
              date: true,
              gzSizeBytes: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        take: limit,
      });

      return reply.send({
        requests: requests.map((req) => ({
          id: req.id,
          status: req.status,
          companyId: req.companyId,
          companyName: req.company.name,
          archiveId: req.archiveId,
          tier: req.tier,
          estimatedCostUsd: req.estimatedCostUsd?.toString(),
          requestedAt: req.requestedAt.toISOString(),
          approvedAt: req.approvedAt?.toISOString(),
        })),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Admin: Failed to list restore requests');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * POST /dashboard/admin/restore-requests/:id/approve
   * Approve restore request
   */
  fastify.post('/admin/restore-requests/:id/approve', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const prisma = request.prisma;

    try {
      const restoreRequest = await prisma.glacierRestoreRequest.findUnique({
        where: { id },
        include: {
          archive: true,
          company: true,
        },
      });

      if (!restoreRequest) {
        return reply.code(404).send({ error: 'Restore request not found', code: 'NOT_FOUND' });
      }

      if (restoreRequest.status !== 'PENDING') {
        return reply.code(400).send({
          error: 'Can only approve PENDING restore requests',
          code: 'VALIDATION_ERROR',
        });
      }

      await prisma.glacierRestoreRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: request.dashboardAuth.userId,
        },
      });

      // Log audit action
      await logDashboardAction(prisma, request, {
        action: 'RESTORE_REQUEST_APPROVED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: restoreRequest.companyId,
        metadata: { restoreRequestId: id },
      });

      return reply.send({ success: true });
    } catch (error: any) {
      logger.error({ err: error, id }, 'Admin: Failed to approve restore request');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * POST /dashboard/admin/restore-requests/:id/reject
   * Reject restore request
   */
  fastify.post('/admin/restore-requests/:id/reject', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const prisma = request.prisma;

    // Validate request body
    const bodyResult = RejectRestoreSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.errors,
      });
    }

    const { reason } = bodyResult.data;

    try {
      const restoreRequest = await prisma.glacierRestoreRequest.findUnique({
        where: { id },
      });

      if (!restoreRequest) {
        return reply.code(404).send({ error: 'Restore request not found', code: 'NOT_FOUND' });
      }

      if (restoreRequest.status !== 'PENDING') {
        return reply.code(400).send({
          error: 'Can only reject PENDING restore requests',
          code: 'VALIDATION_ERROR',
        });
      }

      await prisma.glacierRestoreRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          rejectedAt: new Date(),
          rejectedBy: request.dashboardAuth.userId,
          rejectReason: reason || 'Rejected by admin',
        },
      });

      // Log audit action
      await logDashboardAction(prisma, request, {
        action: 'RESTORE_REQUEST_REJECTED',
        actorUserId: request.dashboardAuth.userId,
        actorEmail: request.dashboardAuth.userEmail,
        actorRole: request.dashboardAuth.userRole,
        targetCompanyId: restoreRequest.companyId,
        metadata: { restoreRequestId: id, reason },
      });

      return reply.send({ success: true });
    } catch (error: any) {
      logger.error({ err: error, id }, 'Admin: Failed to reject restore request');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /dashboard/admin/audit-logs
   * Get audit logs (admin view)
   */
  fastify.get('/admin/audit-logs', async (request, reply) => {
    if (!request.dashboardAuth || !request.prisma) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (!requireHyrelogAdmin(request, reply)) return;

    const prisma = request.prisma;
    const query = request.query as { companyId?: string; action?: string; limit?: string; cursor?: string };

    try {
      const limit = Math.min(parseInt(query.limit || '100', 10), 200);
      const where: any = {};

      if (query.companyId) where.targetCompanyId = query.companyId;
      if (query.action) where.action = query.action;

      const logs = await prisma.auditLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      });

      return reply.send({
        logs: logs.map((log) => ({
          id: log.id,
          action: log.action,
          actorUserId: log.actorUserId,
          actorEmail: log.actorEmail,
          actorRole: log.actorRole,
          targetCompanyId: log.targetCompanyId,
          metadata: log.metadata,
          createdAt: log.createdAt.toISOString(),
        })),
        nextCursor: logs.length === limit ? logs[logs.length - 1].id : null,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Admin: Failed to get audit logs');
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });
};
