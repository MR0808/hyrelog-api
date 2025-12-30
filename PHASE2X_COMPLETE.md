# Phase 2.x: Plan Tiers & Feature Gating - Implementation Complete ✅

## Summary

Phase 2.x adds centralized plan management, feature gating, and Stripe-ready billing metadata. This is **additive** to Phase 2 (webhooks) and does not break existing functionality.

## What Was Implemented

### Database Schema
- ✅ Added `STARTER` to `PlanTier` enum (now: FREE, STARTER, GROWTH, ENTERPRISE)
- ✅ Added `BillingStatus` enum (ACTIVE, TRIALING, PAST_DUE, CANCELED)
- ✅ Added billing fields to `Company` model:
  - `billingStatus` (default: ACTIVE)
  - `stripeCustomerId` (unique, nullable)
  - `stripeSubscriptionId` (unique, nullable)
  - `stripePriceId` (nullable)
  - `trialEndsAt` (nullable)
  - `planOverrides` (Json, nullable) - for enterprise custom entitlements

### Central Plan Engine
- ✅ Created `services/api/src/lib/plans.ts` - **single source of truth** for all plan logic
- ✅ Defined `PlanConfig` interface with all features and limits
- ✅ Implemented plan configurations for all 4 tiers
- ✅ Exported helpers:
  - `getPlanConfig(planTier)` - Get full config for a plan
  - `hasFeature(planTier, featureName)` - Check if feature is enabled
  - `getLimit(planTier, limitName)` - Get limit value
  - `requireFeature(planTier, featureName, requiredPlan?)` - Throw if feature not available
  - `requireLimit(planTier, limitName, currentValue, requiredPlan?)` - Throw if limit exceeded
  - `PlanRestrictionError` - Custom error class for plan restrictions

### Plan Configurations

**FREE:**
- webhooksEnabled: false
- maxWebhooks: 0
- streamingExportsEnabled: false
- maxExportRows: 10,000
- hotRetentionDays: 7
- allowCustomCategories: false

**STARTER:**
- webhooksEnabled: false
- maxWebhooks: 0
- streamingExportsEnabled: true
- maxExportRows: 250,000
- hotRetentionDays: 30
- archiveRetentionDays: 180
- allowCustomCategories: true

**GROWTH:**
- webhooksEnabled: true
- maxWebhooks: 3
- streamingExportsEnabled: true
- maxExportRows: 1,000,000
- hotRetentionDays: 90
- archiveRetentionDays: 365
- coldArchiveAfterDays: 365
- allowCustomCategories: true

**ENTERPRISE:**
- webhooksEnabled: true
- maxWebhooks: 20
- streamingExportsEnabled: true
- maxExportRows: unlimited (Number.MAX_SAFE_INTEGER)
- hotRetentionDays: 180
- archiveRetentionDays: 2555 (~7 years)
- coldArchiveAfterDays: 365 (configurable via planOverrides)
- allowCustomCategories: true

### Plan Enforcement

**Webhook Endpoints:**
- ✅ Reject webhook creation if `plan.webhooksEnabled === false`
- ✅ Enforce `maxWebhooks` limit per workspace
- ✅ Error format: `{ "error": "Webhooks require a Growth plan or higher", "code": "PLAN_RESTRICTED" }`

**Webhook Enqueue:**
- ✅ Check plan allows webhooks before enqueueing
- ✅ Non-blocking: skips enqueue if plan doesn't support webhooks (logs warning)

### Seed Script
- ✅ Updated to support all 4 plan tiers (FREE, STARTER, GROWTH, ENTERPRISE)
- ✅ Billing logic:
  - FREE: `billingStatus=ACTIVE`, no trial
  - Paid tiers: `billingStatus=TRIALING`, `trialEndsAt=now+14days`
- ✅ Clear console output showing plan tier and billing status

### Documentation
- ✅ Updated `README.md` with "Plans & Limits" section
- ✅ Updated `SECURITY.md` with plan enforcement details
- ✅ Added TODO markers for Phase 3 enforcement:
  - Retention cleanup job
  - Export limit enforcement
  - Custom category enforcement

## Setup Commands

### 1. Create Migration

```powershell
# This will create a new migration for the schema changes
npm run prisma:migrate --workspace=services/api
# Name it: add_plan_tiers_and_billing
```

### 2. Run Migrations for All Regions

```powershell
npm run prisma:migrate:all
```

### 3. Regenerate Prisma Client

```powershell
npm run prisma:generate
```

### 4. Seed with Different Plan Tiers

```powershell
# FREE (default)
npm run seed

# STARTER
$env:SEED_PLAN_TIER="STARTER"
npm run seed

# GROWTH
$env:SEED_PLAN_TIER="GROWTH"
npm run seed

# ENTERPRISE
$env:SEED_PLAN_TIER="ENTERPRISE"
npm run seed
```

## Testing Plan Gating

### Test Webhook Creation (Should Fail for FREE/STARTER)

```powershell
# With FREE or STARTER plan
curl -X POST "http://localhost:3000/v1/workspaces/{workspace_id}/webhooks" `
  -H "Authorization: Bearer {company_key}" `
  -H "Content-Type: application/json" `
  -d '{"url": "http://localhost:3001", "events": ["AUDIT_EVENT_CREATED"]}'

# Expected: 403 with "Webhooks require a Growth plan or higher"
```

### Test Webhook Limit (GROWTH plan allows 3)

```powershell
# Create 3 webhooks (should succeed)
# Create 4th webhook (should fail with limit exceeded error)
```

## Files Created/Modified

### New Files
- `services/api/src/lib/plans.ts` - Central plan engine

### Modified Files
- `services/api/prisma/schema.prisma` - Added STARTER tier, BillingStatus enum, billing fields
- `services/api/src/routes/v1/webhooks.ts` - Added plan gating for webhook creation
- `services/api/src/lib/webhookEnqueue.ts` - Updated to use plan engine
- `services/api/prisma/seed.ts` - Updated with all plan tiers and billing logic
- `services/worker/src/jobs/archivalJob.ts` - Added TODO for Phase 3 retention enforcement
- `services/api/src/routes/v1/events.ts` - Added TODO for custom categories
- `services/api/src/lib/keyManagementSecurity.ts` - Added 'enable'/'disable' operations
- `README.md` - Added Plans & Limits section
- `SECURITY.md` - Added plan enforcement section

## Important Notes

1. **Migration Required**: You must create and run a Prisma migration before the code will work:
   ```powershell
   npm run prisma:migrate --workspace=services/api
   npm run prisma:migrate:all
   npm run prisma:generate
   ```

2. **No Breaking Changes**: All existing functionality remains intact. Plan gating is additive.

3. **Stripe Integration**: Schema is ready for Stripe, but no Stripe API calls are implemented yet.

4. **Pricing Not Stored**: Pricing information is not stored in the database (as per requirements).

5. **Plan Enforcement**: All plan checks flow through `plans.ts` - no scattered if-statements.

## Next Steps

1. **Run migrations** to add new fields to database
2. **Regenerate Prisma Client** to get TypeScript types
3. **Test plan gating** by creating companies with different plan tiers
4. **Verify webhook restrictions** work correctly

## Future Phases

- **Phase 3**: Retention enforcement, export limits, custom category enforcement
- **Future**: Stripe billing integration, webhook handling for plan changes

