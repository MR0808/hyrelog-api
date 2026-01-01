/**
 * Plan Helpers for Worker
 * 
 * Provides helpers to load Company with plan and resolve effective plan config.
 * Uses database-driven plans (Company.plan + Company.planOverrides).
 */

import type { PrismaClient } from '../../../api/node_modules/.prisma/client/index.js';
import { getCompanyPlanConfig } from '../../../api/src/lib/plans.js';
import type { PlanConfig } from '../../../api/src/lib/plans.js';

/**
 * Load company with plan relation
 */
export async function loadCompanyWithPlan(
  prisma: PrismaClient,
  companyId: string
): Promise<{
  id: string;
  name: string;
  dataRegion: string;
  planTier: string;
  planId: string;
  planOverrides: any;
  plan: {
    id: string;
    name: string;
    planTier: string;
    webhooksEnabled: boolean;
    maxWebhooks: number;
    streamingExportsEnabled: boolean;
    maxExportRows: bigint;
    hotRetentionDays: number;
    archiveRetentionDays: number | null;
    coldArchiveAfterDays: number | null;
    allowCustomCategories: boolean;
  };
} | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      plan: true,
    },
  });

  if (!company) {
    return null;
  }

  return company as any;
}

/**
 * Get effective plan config for a company
 * Merges plan + planOverrides
 */
export function getEffectivePlanConfig(company: {
  planTier: string;
  planOverrides: any;
}): PlanConfig {
  // Use the plan engine helper which handles merging
  return getCompanyPlanConfig(company as any);
}

