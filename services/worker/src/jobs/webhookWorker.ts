import { getLogger } from '../lib/logger.js';
import { getRegionRouter } from '../lib/regionRouter.js';
import { processWebhookJob } from '../lib/webhookDelivery.js';
import { loadConfig } from '../lib/config.js';

const logger = getLogger();

/**
 * Webhook Worker
 * 
 * Polls for due webhook jobs and processes them with retry backoff.
 * Region-aware: processes jobs from all regions.
 */
export async function processWebhookJobs(): Promise<void> {
  const config = loadConfig();
  const regionRouter = getRegionRouter();
  const regions = regionRouter.getAllRegions();

  const now = new Date();

  for (const region of regions) {
    const prisma = regionRouter.getPrisma(region);

    try {
      // Find due jobs (nextAttemptAt <= now, status PENDING or RETRY_SCHEDULED)
      const dueJobs = await prisma.webhookJob.findMany({
        where: {
          nextAttemptAt: {
            lte: now,
          },
          status: {
            in: ['PENDING', 'RETRY_SCHEDULED'],
          },
        },
        take: 10, // Process up to 10 jobs per region per cycle
        orderBy: {
          nextAttemptAt: 'asc',
        },
      });

      if (dueJobs.length === 0) {
        continue;
      }

      logger.info(
        {
          region,
          jobCount: dueJobs.length,
        },
        'Processing webhook jobs'
      );

      // Process each job
      for (const job of dueJobs) {
        try {
          await processWebhookJob(prisma, job.id);
          logger.debug({ region, jobId: job.id }, 'Webhook job processed');
        } catch (error: any) {
          logger.error(
            {
              err: error,
              region,
              jobId: job.id,
            },
            'Failed to process webhook job'
          );

          // Mark job as failed if processing error
          await prisma.webhookJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
            },
          }).catch((updateError: any) => {
            logger.error(
              { err: updateError, jobId: job.id },
              'Failed to mark job as failed'
            );
          });
        }
      }
    } catch (error: any) {
      logger.error(
        {
          err: error,
          region,
        },
        'Error processing webhook jobs for region'
      );
    }
  }
}

/**
 * Start webhook worker loop
 */
export async function startWebhookWorker(): Promise<void> {
  const config = loadConfig();
  const pollIntervalMs = config.workerPollIntervalSeconds * 1000;

  logger.info(
    {
      pollIntervalSeconds: config.workerPollIntervalSeconds,
    },
    'Starting webhook worker'
  );

  // Main loop
  while (true) {
    try {
      await processWebhookJobs();
    } catch (error: any) {
      logger.error({ err: error }, 'Error in webhook worker loop');
    }

    // Sleep before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
