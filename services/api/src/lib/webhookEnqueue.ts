import { getLogger } from './logger.js';
import { hasFeature } from './plans.js';
import type { PrismaClient } from '../../node_modules/.prisma/client/index.js';

const logger = getLogger();

/**
 * Enqueue webhook jobs after successful event ingestion
 * 
 * This function is called after an event is successfully created.
 * It finds matching webhook endpoints and creates WebhookJob records.
 * 
 * Non-blocking: failures are logged but don't affect event ingestion.
 */
export async function enqueueWebhookJobs(
  prisma: PrismaClient,
  eventId: string,
  companyId: string,
  workspaceId: string,
  projectId: string | null,
  traceId: string
): Promise<void> {
  try {
    // Get company to check plan tier
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        planTier: true,
      },
    });

    if (!company) {
      logger.warn({ traceId, companyId }, 'Company not found for webhook enqueue');
      return;
    }

    // PLAN GATING: Check if webhooks are enabled for this plan
    if (!hasFeature(company.planTier, 'webhooksEnabled')) {
      // Plan doesn't support webhooks - skip enqueue (non-blocking)
      logger.debug(
        { traceId, companyId, planTier: company.planTier },
        'Skipping webhook enqueue - plan does not support webhooks'
      );
      return;
    }

    // Find active webhook endpoints matching workspace and optionally project
    const where: any = {
      companyId,
      workspaceId,
      status: 'ACTIVE',
      events: {
        has: 'AUDIT_EVENT_CREATED',
      },
    };

    // If event has a projectId, match webhooks with that projectId or no projectId (workspace-level)
    // If event has no projectId, only match webhooks with no projectId (workspace-level)
    if (projectId) {
      where.OR = [
        { projectId: null }, // Workspace-level webhook
        { projectId }, // Project-specific webhook
      ];
    } else {
      where.projectId = null; // Only workspace-level webhooks
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where,
      select: {
        id: true,
      },
    });

    if (webhooks.length === 0) {
      // No matching webhooks - nothing to enqueue
      return;
    }

    // Check for existing webhook jobs to prevent duplicates
    const existingJobs = await prisma.webhookJob.findMany({
      where: {
        eventId,
        webhookId: { in: webhooks.map((w) => w.id) },
      },
      select: {
        id: true,
        webhookId: true,
      },
    });

    const existingWebhookIds = new Set(existingJobs.map((j) => j.webhookId));

    // Only create jobs for webhooks that don't already have a job for this event
    const newJobs = webhooks
      .filter((webhook) => !existingWebhookIds.has(webhook.id))
      .map((webhook) => ({
        webhookId: webhook.id,
        eventId,
        companyId,
        workspaceId,
        projectId,
        attempt: 1,
        status: 'PENDING' as const,
        nextAttemptAt: new Date(), // Immediate attempt
      }));

    if (newJobs.length > 0) {
      await prisma.webhookJob.createMany({
        data: newJobs,
      });

      logger.info(
        {
          traceId,
          eventId,
          companyId,
          workspaceId,
          projectId,
          newJobCount: newJobs.length,
          skippedCount: existingJobs.length,
        },
        'Enqueued webhook jobs for event'
      );
    } else {
      logger.debug(
        {
          traceId,
          eventId,
          companyId,
          workspaceId,
          projectId,
          existingJobCount: existingJobs.length,
        },
        'Skipped webhook job creation - jobs already exist for this event'
      );
    }

    logger.info(
      {
        traceId,
        eventId,
        companyId,
        workspaceId,
        projectId,
        webhookCount: webhooks.length,
      },
      'Enqueued webhook jobs for event'
    );
  } catch (error: any) {
    // Log error but don't throw - event ingestion should succeed even if webhook enqueue fails
    logger.warn(
      {
        err: error,
        traceId,
        eventId,
        companyId,
        workspaceId,
        projectId,
      },
      'Failed to enqueue webhook jobs (non-blocking)'
    );
  }
}

