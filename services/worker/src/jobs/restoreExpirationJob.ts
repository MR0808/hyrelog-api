/**
 * Restore Expiration Job
 * 
 * Daily job that marks COMPLETED restore requests as EXPIRED when expiresAt < now.
 * Re-marks ArchiveObject as isColdArchived=true and clears restoredUntil.
 */

import { getLogger } from '../lib/logger.js';
import { getRegionRouter } from '../lib/regionRouter.js';
import type { Region } from '../lib/config.js';

const logger = getLogger();

export const restoreExpirationJob = {
  name: 'restore-expiration',
  description: 'Mark expired Glacier restore requests and re-archive objects',

  async processRegion(region: Region): Promise<void> {
    const prisma = getRegionRouter().getPrisma(region);
    const now = new Date();

    logger.info({ region }, 'Restore expiration job: Starting');

    // Find COMPLETED restore requests that have expired
    const expiredRequests = await prisma.glacierRestoreRequest.findMany({
      where: {
        status: 'COMPLETED',
        region,
        expiresAt: {
          lt: now,
        },
      },
      include: {
        archive: true,
      },
    });

    logger.info({ region, count: expiredRequests.length }, 'Restore expiration job: Found expired requests');

    for (const request of expiredRequests) {
      try {
        // Update restore request status
        await prisma.glacierRestoreRequest.update({
          where: { id: request.id },
          data: {
            status: 'EXPIRED',
          },
        });

        // Re-mark ArchiveObject as cold archived
        await prisma.archiveObject.update({
          where: { id: request.archiveId },
          data: {
            isColdArchived: true,
            restoredUntil: null,
          },
        });

        logger.info(
          { region, requestId: request.id, archiveId: request.archiveId },
          'Restore expiration job: Marked restore as expired'
        );
      } catch (error: any) {
        logger.error(
          { err: error, region, requestId: request.id },
          'Restore expiration job: Failed to expire restore'
        );
      }
    }
  },
};
