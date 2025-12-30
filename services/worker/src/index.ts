/**
 * HyreLog Worker Service
 * Phase 2: Webhook delivery worker
 *
 * Processes webhook delivery jobs with retry backoff.
 * Region-aware: processes jobs from all regions.
 */

import { getLogger } from './lib/logger.js';
import { startWebhookWorker } from './jobs/webhookWorker.js';
import { getRegionRouter } from './lib/regionRouter.js';

const logger = getLogger();

async function main() {
  logger.info('Starting HyreLog Worker Service (Phase 2: Webhooks)');

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    const regionRouter = getRegionRouter();
    await regionRouter.disconnectAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start webhook worker
  try {
    await startWebhookWorker();
  } catch (error: any) {
    logger.error({ err: error }, 'Worker service failed');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker service');
  process.exit(1);
});

