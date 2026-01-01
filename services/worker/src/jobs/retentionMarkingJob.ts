/**
 * Retention Marking Job
 * 
 * Daily job that marks events older than hotRetentionDays as archivalCandidate=true.
 * Plan-based: uses Company.plan.hotRetentionDays (with planOverrides applied).
 */

import { getLogger } from '../lib/logger.js';
import { getRegionRouter } from '../lib/regionRouter.js';
import { loadCompanyWithPlan, getEffectivePlanConfig } from '../lib/planHelpers.js';

const logger = getLogger();

export const retentionMarkingJob = {
  name: 'retention-marking',
  description: 'Mark events for archival based on plan retention days',

  async processRegion(region: string): Promise<void> {
    const prisma = getRegionRouter().getPrisma(region as any);
    const now = new Date();

    logger.info({ region }, 'Retention marking job: Starting');

    // Get all companies in this region
    const companies = await prisma.company.findMany({
      where: { dataRegion: region as any },
      include: {
        plan: true,
      },
    });

    logger.info({ region, companyCount: companies.length }, 'Retention marking job: Found companies');

    for (const company of companies) {
      try {
        // Get effective plan config (plan + overrides)
        const effectiveConfig = getEffectivePlanConfig(company);
        const hotRetentionDays = effectiveConfig.hotRetentionDays;

        // Calculate cutoff date
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - hotRetentionDays);

        // Mark events older than cutoff as archivalCandidate
        // Only mark events that are not already archived
        const result = await prisma.auditEvent.updateMany({
          where: {
            companyId: company.id,
            timestamp: { lt: cutoffDate },
            archived: false,
            archivalCandidate: false, // Only update if not already marked
          },
          data: {
            archivalCandidate: true,
          },
        });

        if (result.count > 0) {
          logger.info(
            {
              region,
              companyId: company.id,
              companyName: company.name,
              hotRetentionDays,
              cutoffDate: cutoffDate.toISOString(),
              markedCount: result.count,
            },
            'Retention marking job: Marked events for archival'
          );
        }
      } catch (error: any) {
        logger.error(
          { err: error, region, companyId: company.id },
          'Retention marking job: Error processing company'
        );
      }
    }

    logger.info({ region }, 'Retention marking job: Completed');
  },
};

