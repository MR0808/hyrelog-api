/**
 * Central Plan Engine
 * 
 * This is the ONLY place plan rules and configurations live.
 * All plan-related logic should flow through this module.
 * 
 * Supports:
 * - Base plan configurations (FREE, STARTER, GROWTH, ENTERPRISE)
 * - Custom enterprise plans via planOverrides (JSON field on Company)
 * - Runtime plan limit changes (edit PLAN_CONFIGS and restart server)
 */

import type { Company, PlanTier } from '../../node_modules/.prisma/client/index.js';

// Re-export PlanTier for convenience
export type { PlanTier };

/**
 * Plan configuration interface
 * Defines features and limits for each plan tier
 */
export interface PlanConfig {
  webhooksEnabled: boolean;
  maxWebhooks: number;
  streamingExportsEnabled: boolean;
  maxExportRows: number;
  hotRetentionDays: number;
  archiveRetentionDays?: number;
  coldArchiveAfterDays?: number;
  allowCustomCategories: boolean;
}

/**
 * Plan configurations for each tier
 */
const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  FREE: {
    webhooksEnabled: false,
    maxWebhooks: 0,
    streamingExportsEnabled: false,
    maxExportRows: 10_000,
    hotRetentionDays: 7,
    allowCustomCategories: false,
  },
  STARTER: {
    webhooksEnabled: false,
    maxWebhooks: 0,
    streamingExportsEnabled: true, // Active data only (Phase 3)
    maxExportRows: 250_000,
    hotRetentionDays: 30,
    archiveRetentionDays: 180,
    allowCustomCategories: true,
  },
  GROWTH: {
    webhooksEnabled: true,
    maxWebhooks: 3,
    streamingExportsEnabled: true,
    maxExportRows: 1_000_000,
    hotRetentionDays: 90,
    archiveRetentionDays: 365,
    coldArchiveAfterDays: 365,
    allowCustomCategories: true,
  },
  ENTERPRISE: {
    webhooksEnabled: true,
    maxWebhooks: 20,
    streamingExportsEnabled: true,
    maxExportRows: Number.MAX_SAFE_INTEGER, // Effectively unlimited
    hotRetentionDays: 180,
    archiveRetentionDays: 2555, // ~7 years
    coldArchiveAfterDays: 365, // Configurable via planOverrides
    allowCustomCategories: true,
  },
};

/**
 * Get plan configuration for a plan tier
 * Optionally merges with planOverrides from Company model
 */
export function getPlanConfig(planTier: PlanTier, planOverrides?: any): PlanConfig {
  const baseConfig = PLAN_CONFIGS[planTier];
  
  // If no overrides, return base config
  if (!planOverrides || typeof planOverrides !== 'object') {
    return baseConfig;
  }
  
  // Merge base config with overrides (shallow merge)
  return {
    ...baseConfig,
    ...planOverrides,
  };
}

/**
 * Get plan configuration from a Company object
 * Automatically applies planOverrides if present
 */
export function getCompanyPlanConfig(company: Pick<Company, 'planTier' | 'planOverrides'>): PlanConfig {
  return getPlanConfig(company.planTier, company.planOverrides as any);
}

/**
 * Check if a plan tier has a specific feature enabled
 */
export function hasFeature(planTier: PlanTier, featureName: keyof PlanConfig, planOverrides?: any): boolean {
  const config = getPlanConfig(planTier, planOverrides);
  return config[featureName] === true;
}

/**
 * Check if a company has a specific feature enabled
 * Automatically applies planOverrides if present
 */
export function companyHasFeature(company: Pick<Company, 'planTier' | 'planOverrides'>, featureName: keyof PlanConfig): boolean {
  const config = getCompanyPlanConfig(company);
  return config[featureName] === true;
}

/**
 * Get a limit value for a plan tier
 */
export function getLimit(planTier: PlanTier, limitName: keyof PlanConfig, planOverrides?: any): number {
  const config = getPlanConfig(planTier, planOverrides);
  const value = config[limitName];
  if (typeof value !== 'number') {
    throw new Error(`Limit ${limitName} is not a number for plan ${planTier}`);
  }
  return value;
}

/**
 * Get a limit value from a Company object
 * Automatically applies planOverrides if present
 */
export function getCompanyLimit(company: Pick<Company, 'planTier' | 'planOverrides'>, limitName: keyof PlanConfig): number {
  return getLimit(company.planTier, limitName, company.planOverrides as any);
}

/**
 * Require a feature to be enabled for a plan tier
 * Throws PlanRestrictionError if feature is not enabled
 */
export class PlanRestrictionError extends Error {
  constructor(
    public readonly planTier: PlanTier,
    public readonly featureName: string,
    public readonly requiredPlan?: PlanTier
  ) {
    const requiredPlanMsg = requiredPlan
      ? ` Requires ${requiredPlan} plan or higher.`
      : '';
    super(`Feature '${featureName}' is not available for ${planTier} plan.${requiredPlanMsg}`);
    this.name = 'PlanRestrictionError';
  }
}

export function requireFeature(
  planTier: PlanTier,
  featureName: keyof PlanConfig,
  requiredPlan?: PlanTier,
  planOverrides?: any
): void {
  if (!hasFeature(planTier, featureName, planOverrides)) {
    throw new PlanRestrictionError(planTier, featureName as string, requiredPlan);
  }
}

/**
 * Require a feature from a Company object
 * Automatically applies planOverrides if present
 */
export function requireCompanyFeature(company: Pick<Company, 'planTier' | 'planOverrides'>, featureName: keyof PlanConfig, requiredPlan?: PlanTier): void {
  if (!companyHasFeature(company, featureName)) {
    throw new PlanRestrictionError(company.planTier, featureName as string, requiredPlan);
  }
}

/**
 * Require a limit to not be exceeded
 * Throws PlanRestrictionError if limit is exceeded
 */
export function requireLimit(
  planTier: PlanTier,
  limitName: keyof PlanConfig,
  currentValue: number,
  requiredPlan?: PlanTier,
  planOverrides?: any
): void {
  const limit = getLimit(planTier, limitName, planOverrides);
  // Use > instead of >= to allow creating up to the limit
  // e.g., if limit is 3, allow creating when currentValue is 0, 1, or 2
  // but block when currentValue would be 3 or more
  if (currentValue > limit) {
    const requiredPlanMsg = requiredPlan
      ? ` Requires ${requiredPlan} plan or higher.`
      : '';
    throw new PlanRestrictionError(
      planTier,
      `${limitName} limit exceeded (${currentValue}/${limit})`,
      requiredPlan
    );
  }
}

/**
 * Require a limit from a Company object
 * Automatically applies planOverrides if present
 */
export function requireCompanyLimit(company: Pick<Company, 'planTier' | 'planOverrides'>, limitName: keyof PlanConfig, currentValue: number, requiredPlan?: PlanTier): void {
  const limit = getCompanyLimit(company, limitName);
  if (currentValue > limit) {
    const requiredPlanMsg = requiredPlan
      ? ` Requires ${requiredPlan} plan or higher.`
      : '';
    throw new PlanRestrictionError(
      company.planTier,
      `${limitName} limit exceeded (${currentValue}/${limit})`,
      requiredPlan
    );
  }
}

/**
 * Get human-readable plan name
 */
export function getPlanName(planTier: PlanTier): string {
  return planTier.charAt(0) + planTier.slice(1).toLowerCase();
}

/**
 * Check if a plan tier is a paid plan
 */
export function isPaidPlan(planTier: PlanTier): boolean {
  return planTier !== 'FREE';
}

