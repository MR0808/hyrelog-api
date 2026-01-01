/**
 * Archive Verification Job
 * 
 * Daily job that verifies archived files by recomputing SHA-256 and comparing.
 */

import { getLogger } from '../lib/logger.js';
import { getRegionRouter } from '../lib/regionRouter.js';
import { getObjectStream } from '../lib/objectStore.js';
import { createHash } from 'crypto';
import type { Region } from '../lib/config.js';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

const logger = getLogger();

export const archiveVerificationJob = {
  name: 'archive-verification',
  description: 'Verify archived files by SHA-256 checksum',

  async processRegion(region: Region): Promise<void> {
    const prisma = getRegionRouter().getPrisma(region);

    logger.info({ region }, 'Archive verification job: Starting');

    // Get unverified archive objects
    const unverifiedArchives = await prisma.archiveObject.findMany({
      where: {
        region: region,
        verifiedAt: null,
      },
      take: 100, // Process in batches
    });

    logger.info({ region, count: unverifiedArchives.length }, 'Archive verification job: Found unverified archives');

    for (const archive of unverifiedArchives) {
      try {
        // Download gzipped file and compute SHA-256 of the gzipped bytes
        const stream = await getObjectStream(region, archive.s3Key);
        const hash = createHash('sha256');

        // Hash the gzipped stream directly (don't gunzip for hash)
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
          hash.update(chunk);
        }

        const computedSha256 = hash.digest('hex');

        // Compare with stored SHA-256
        if (computedSha256 === archive.sha256) {
          // Verification successful
          await prisma.archiveObject.update({
            where: { id: archive.id },
            data: {
              verifiedAt: new Date(),
              verificationError: null,
            },
          });

          logger.info(
            { region, archiveId: archive.id, s3Key: archive.s3Key },
            'Archive verification job: Archive verified'
          );
        } else {
          // Verification failed
          await prisma.archiveObject.update({
            where: { id: archive.id },
            data: {
              verificationError: `SHA-256 mismatch: expected ${archive.sha256}, got ${computedSha256}`,
            },
          });

          logger.error(
            {
              region,
              archiveId: archive.id,
              s3Key: archive.s3Key,
              expected: archive.sha256,
              computed: computedSha256,
            },
            'Archive verification job: SHA-256 mismatch'
          );
        }
      } catch (error: any) {
        // Record verification error
        await prisma.archiveObject.update({
          where: { id: archive.id },
          data: {
            verificationError: `Verification error: ${error.message}`,
          },
        });

        logger.error(
          { err: error, region, archiveId: archive.id, s3Key: archive.s3Key },
          'Archive verification job: Error verifying archive'
        );
      }
    }

    logger.info({ region }, 'Archive verification job: Completed');
  },
};

