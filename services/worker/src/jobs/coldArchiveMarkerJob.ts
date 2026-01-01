/**
 * Cold Archive Marker Job
 * 
 * Weekly job that marks ArchiveObjects older than coldArchiveAfterDays as isColdArchived=true.
 * This is metadata-only; actual Glacier transition is handled by AWS lifecycle rules.
 * Plan-based: uses Company.plan.coldArchiveAfterDays (with planOverrides applied).
 */

import { getLogger } from '../lib/logger.js';
import { getRegionRouter } from '../lib/regionRouter.js';
import { loadCompanyWithPlan, getEffectivePlanConfig } from '../lib/planHelpers.js';
import type { Region } from '../lib/config.js';

const logger = getLogger();

export const coldArchiveMarkerJob = {
  name: 'cold-archive-marker',
  description: 'Mark old archives for cold storage (metadata only)',

  async processRegion(region: Region): Promise<void> {
    const prisma = getRegionRouter().getPrisma(region);
    const now = new Date();

    logger.info({ region }, 'Cold archive marker job: Starting');

    // Get all companies in this region
    const companies = await prisma.company.findMany({
      where: { dataRegion: region },
      include: {
        plan: true,
      },
    });

    logger.info({ region, companyCount: companies.length }, 'Cold archive marker job: Found companies');

    for (const company of companies) {
      try {
        // Get effective plan config
        const effectiveConfig = getEffectivePlanConfig(company);

        // Skip if coldArchiveAfterDays is not set
        if (!effectiveConfig.coldArchiveAfterDays) {
          continue;
        }

        const coldArchiveAfterDays = effectiveConfig.coldArchiveAfterDays;

        // Calculate cutoff date
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - coldArchiveAfterDays);

        // Find ArchiveObjects to mark
        const archivesToMark = await prisma.archiveObject.findMany({
          where: {
            companyId: company.id,
            region: region,
            createdAt: { lt: cutoffDate },
            isColdArchived: false,
          },
        });

        // Mark each archive individually (to set coldArchiveKey = s3Key)
        for (const archive of archivesToMark) {
          await prisma.archiveObject.update({
            where: { id: archive.id },
            data: {
              isColdArchived: true,
              coldArchiveKey: archive.s3Key, // Use existing s3Key as placeholder
            },
          });
        }

        const result = { count: archivesToMark.length };

        if (result.count > 0) {
          logger.info(
            {
              region,
              companyId: company.id,
              companyName: company.name,
              coldArchiveAfterDays,
              cutoffDate: cutoffDate.toISOString(),
              markedCount: result.count,
            },
            'Cold archive marker job: Marked archives for cold storage'
          );
        }
      } catch (error: any) {
        logger.error(
          { err: error, region, companyId: company.id },
          'Cold archive marker job: Error processing company'
        );
      }
    }

    logger.info({ region }, 'Cold archive marker job: Completed');
  },
};

