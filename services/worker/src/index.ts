/**
 * HyreLog Worker Service
 * Phase 3: Webhooks + Archival + Retention
 *
 * Processes:
 * - Webhook delivery jobs (Phase 2)
 * - Retention marking (daily)
 * - Archival to S3 (daily)
 * - Archive verification (daily)
 * - Cold archive marking (weekly)
 *
 * Region-aware: processes jobs from all regions.
 */

import { getLogger } from './lib/logger.js';
import { startWebhookWorker } from './jobs/webhookWorker.js';
import { retentionMarkingJob } from './jobs/retentionMarkingJob.js';
import { archivalJob } from './jobs/archivalJob.js';
import { archiveVerificationJob } from './jobs/archiveVerificationJob.js';
import { coldArchiveMarkerJob } from './jobs/coldArchiveMarkerJob.js';
import { restoreInitiatorJob } from './jobs/restoreInitiatorJob.js';
import { restoreStatusCheckerJob } from './jobs/restoreStatusCheckerJob.js';
import { restoreExpirationJob } from './jobs/restoreExpirationJob.js';
import { getRegionRouter } from './lib/regionRouter.js';
import { loadConfig } from './lib/config.js';

const logger = getLogger();
const config = loadConfig();

// Parse CLI arguments
const args = process.argv.slice(2);
const jobName = args[0]; // e.g., "retention-marking", "archival", etc.

async function main() {
  logger.info('Starting HyreLog Worker Service (Phase 3: Webhooks + Archival)');

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    const regionRouter = getRegionRouter();
    await regionRouter.disconnectAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // If specific job name provided, run only that job
  if (jobName) {
    logger.info({ jobName }, 'Running single job');
    await runSingleJob(jobName);
    await shutdown();
    return;
  }

  // Otherwise run all jobs in a loop
  logger.info('Running all jobs in continuous loop');
  
  // Start webhook worker (continuous)
  startWebhookWorker().catch((err) => {
    logger.error({ err }, 'Webhook worker failed');
  });

  // Run archival jobs on schedule
  // For now, run daily jobs every 24 hours, weekly jobs every 7 days
  const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const RESTORE_INITIATOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const RESTORE_STATUS_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  let lastDailyRun = 0;
  let lastWeeklyRun = 0;
  let lastRestoreInitiatorRun = 0;
  let lastRestoreStatusCheckRun = 0;

  setInterval(async () => {
    const now = Date.now();

    // Restore initiator (every 5 minutes)
    if (now - lastRestoreInitiatorRun >= RESTORE_INITIATOR_INTERVAL_MS) {
      lastRestoreInitiatorRun = now;
      logger.info('Running restore initiator job');

      const regions = getRegionRouter().getAllRegions();
      for (const region of regions) {
        try {
          await restoreInitiatorJob.processRegion(region);
        } catch (error: any) {
          logger.error({ err: error, region }, 'Error in restore initiator job');
        }
      }
    }

    // Restore status checker (every 15 minutes)
    if (now - lastRestoreStatusCheckRun >= RESTORE_STATUS_CHECK_INTERVAL_MS) {
      lastRestoreStatusCheckRun = now;
      logger.info('Running restore status checker job');

      const regions = getRegionRouter().getAllRegions();
      for (const region of regions) {
        try {
          await restoreStatusCheckerJob.processRegion(region);
        } catch (error: any) {
          logger.error({ err: error, region }, 'Error in restore status checker job');
        }
      }
    }

    // Daily jobs (retention, archival, verification, restore expiration)
    if (now - lastDailyRun >= DAILY_INTERVAL_MS) {
      lastDailyRun = now;
      logger.info('Running daily archival jobs');

      const regions = getRegionRouter().getAllRegions();
      for (const region of regions) {
        try {
          await retentionMarkingJob.processRegion(region);
          await archivalJob.processRegion(region);
          await archiveVerificationJob.processRegion(region);
          await restoreExpirationJob.processRegion(region);
        } catch (error: any) {
          logger.error({ err: error, region }, 'Error in daily archival jobs');
        }
      }
    }

    // Weekly jobs (cold archive marker)
    if (now - lastWeeklyRun >= WEEKLY_INTERVAL_MS) {
      lastWeeklyRun = now;
      logger.info('Running weekly cold archive marker job');

      const regions = getRegionRouter().getAllRegions();
      for (const region of regions) {
        try {
          await coldArchiveMarkerJob.processRegion(region);
        } catch (error: any) {
          logger.error({ err: error, region }, 'Error in cold archive marker job');
        }
      }
    }
  }, 60 * 1000); // Check every minute (for restore jobs)
}

async function runSingleJob(jobName: string): Promise<void> {
  const regions = getRegionRouter().getAllRegions();

  switch (jobName) {
    case 'retention-marking':
      for (const region of regions) {
        await retentionMarkingJob.processRegion(region);
      }
      break;
    case 'archival':
      for (const region of regions) {
        await archivalJob.processRegion(region);
      }
      break;
    case 'archive-verification':
      for (const region of regions) {
        await archiveVerificationJob.processRegion(region);
      }
      break;
    case 'cold-archive-marker':
      for (const region of regions) {
        await coldArchiveMarkerJob.processRegion(region);
      }
      break;
    case 'restore-initiator':
      for (const region of regions) {
        await restoreInitiatorJob.processRegion(region);
      }
      break;
    case 'restore-status-checker':
      for (const region of regions) {
        await restoreStatusCheckerJob.processRegion(region);
      }
      break;
    case 'restore-expiration':
      for (const region of regions) {
        await restoreExpirationJob.processRegion(region);
      }
      break;
    default:
      logger.error({ jobName }, 'Unknown job name');
      process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker service');
  process.exit(1);
});

