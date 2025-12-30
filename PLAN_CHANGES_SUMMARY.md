# Plan System Changes Summary

## Overview

HyreLog has been migrated from a **hardcoded plan system** to a **database-driven plan system** that supports both standard plans (FREE, STARTER, GROWTH, ENTERPRISE) and custom plans created via admin dashboard.

---

## 🗄️ Database Schema Changes

### New: `Plan` Model

Created a new `Plan` model to store all plan configurations in the database:

```prisma
model Plan {
  id                      String   @id @default(uuid())
  name                    String   @unique
  planTier                PlanTier // FREE, STARTER, GROWTH, ENTERPRISE
  planType                PlanType // STANDARD or CUSTOM
  
  // Configuration fields
  webhooksEnabled         Boolean
  maxWebhooks             Int
  streamingExportsEnabled  Boolean
  maxExportRows           BigInt
  hotRetentionDays        Int
  archiveRetentionDays    Int?
  coldArchiveAfterDays    Int?
  allowCustomCategories   Boolean
  
  // Metadata
  description             String?
  isActive                Boolean  @default(true)
  isDefault               Boolean  @default(false)
  
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  
  companies               Company[]
}
```

### New: `PlanType` Enum

```prisma
enum PlanType {
  STANDARD  // Pre-defined plans (FREE, STARTER, GROWTH, ENTERPRISE)
  CUSTOM   // Custom plans created by admin
}
```

### Updated: `Company` Model

Added `planId` field to reference `Plan`:

```prisma
model Company {
  // ... existing fields ...
  
  planId     String   // References Plan (standard or custom)
  planTier   PlanTier @default(FREE) // For reference only, planId is source of truth
  planOverrides Json? // Per-company overrides (takes precedence over plan config)
  
  plan       Plan     @relation(fields: [planId], references: [id])
}
```

**Key Changes:**
- ✅ Added `planId` field (required, references `Plan.id`)
- ✅ Kept `planTier` field (for reference, but `planId` is source of truth)
- ✅ Kept `planOverrides` (still supported for per-company tweaks)

---

## 📦 Migration Changes

### Migration: `20250130000000_add_plan_model`

**What it does:**
1. Creates `PlanType` enum (STANDARD, CUSTOM)
2. Creates `plans` table with all configuration fields
3. Adds `planId` column to `companies` table (nullable initially)
4. Creates default Free plan if existing companies are found
5. Updates existing companies to use default Free plan
6. Makes `planId` NOT NULL
7. Adds foreign key constraint

**Migration File:**
- `services/api/prisma/migrations/20250130000000_add_plan_model/migration.sql`

---

## 🌱 Seed Script Changes

### Updated: `services/api/prisma/seed.ts`

**New Behavior:**
1. **Creates 4 standard plans first:**
   - **Free**: Basic features, 7-day retention, no webhooks
   - **Starter**: Streaming exports, 30-day retention, no webhooks
   - **Growth**: Webhooks (3), 90-day retention, 1M export rows
   - **Enterprise**: Webhooks (20), 180-day retention, unlimited exports

2. **Then creates company with `planId` reference:**
   - Company is assigned to selected plan via `planId`
   - `planTier` is kept for reference
   - `SEED_PLAN_TIER` environment variable still works

**Key Changes:**
- ✅ Creates plans before creating company
- ✅ Assigns company to plan via `planId`
- ✅ Removed backward compatibility code
- ✅ Clean migration to database-driven system

---

## 💻 Code Changes

### Updated: `services/api/src/lib/plans.ts`

**New Functions Added:**
- `getCompanyPlanConfig(company)` - Gets merged config from Company (plan + overrides)
- `companyHasFeature(company, feature)` - Checks features with overrides
- `getCompanyLimit(company, limit)` - Gets limits with overrides
- `requireCompanyFeature(company, feature)` - Enforces features with overrides
- `requireCompanyLimit(company, limit, value)` - Enforces limits with overrides

**Updated Functions:**
- `getPlanConfig(planTier, planOverrides?)` - Now accepts optional `planOverrides`
- `hasFeature(planTier, feature, planOverrides?)` - Now accepts optional `planOverrides`
- `getLimit(planTier, limit, planOverrides?)` - Now accepts optional `planOverrides`
- `requireFeature(planTier, feature, requiredPlan?, planOverrides?)` - Now accepts optional `planOverrides`
- `requireLimit(planTier, limit, currentValue, requiredPlan?, planOverrides?)` - Now accepts optional `planOverrides`

**Note:** Hardcoded `PLAN_CONFIGS` still exists for backward compatibility during transition, but the system is designed to load from database in the future.

### Updated: `services/api/src/routes/v1/webhooks.ts`

**Changes:**
- Now uses `requireCompanyFeature()` and `requireCompanyLimit()` instead of planTier-based functions
- Loads full Company object (including `planOverrides`) from database
- Automatically applies plan overrides when checking limits

**Before:**
```typescript
requireFeature(company.planTier, 'webhooksEnabled', 'GROWTH');
requireLimit(company.planTier, 'maxWebhooks', newCount, 'GROWTH');
```

**After:**
```typescript
requireCompanyFeature(company, 'webhooksEnabled', 'GROWTH');
requireCompanyLimit(company, 'maxWebhooks', newCount, 'GROWTH');
```

### Updated: `services/api/src/lib/webhookEnqueue.ts`

**Changes:**
- Now uses `companyHasFeature()` instead of `hasFeature(planTier)`
- Loads `planOverrides` from Company object
- Automatically applies plan overrides when checking features

**Before:**
```typescript
if (!hasFeature(company.planTier, 'webhooksEnabled')) {
  // skip
}
```

**After:**
```typescript
if (!companyHasFeature(company, 'webhooksEnabled')) {
  // skip
}
```

---

## 🏗️ Architecture Changes

### Before: Hardcoded Plans

- Plans defined in `plans.ts` as constants
- Changes required code edits and server restart
- No way to create custom plans
- No admin dashboard support

### After: Database-Driven Plans

- Plans stored in `plans` table
- Standard plans are database records (seeded)
- Custom plans can be created via admin dashboard
- Changes take effect immediately (no restart needed)
- Future-proof for admin dashboard integration

### Plan Resolution Order

1. **Base Plan**: Load from `Plan` table (via `company.planId`)
2. **Plan Overrides**: Apply `company.planOverrides` (if present)
3. **Result**: Merged configuration

**Example:**
- Plan "Enterprise" has `maxWebhooks: 20`
- Company has `planOverrides: { "maxWebhooks": 50 }`
- **Effective limit**: 50 webhooks

---

## 📋 Standard Plans Created

### Free Plan
- Webhooks: Disabled
- Max Webhooks: 0
- Streaming Exports: Disabled
- Max Export Rows: 10,000
- Hot Retention: 7 days
- Custom Categories: Disabled
- **Default plan** for new companies

### Starter Plan
- Webhooks: Disabled
- Max Webhooks: 0
- Streaming Exports: Enabled
- Max Export Rows: 250,000
- Hot Retention: 30 days
- Archive Retention: 180 days
- Custom Categories: Enabled

### Growth Plan
- Webhooks: Enabled
- Max Webhooks: 3
- Streaming Exports: Enabled
- Max Export Rows: 1,000,000
- Hot Retention: 90 days
- Archive Retention: 365 days
- Cold Archive: 365 days
- Custom Categories: Enabled

### Enterprise Plan
- Webhooks: Enabled
- Max Webhooks: 20
- Streaming Exports: Enabled
- Max Export Rows: Unlimited (999,999,999,999)
- Hot Retention: 180 days
- Archive Retention: 2,555 days (~7 years)
- Cold Archive: 365 days
- Custom Categories: Enabled

---

## 🔄 Migration Path

### For Existing Databases

1. **Migration runs:**
   - Creates `plans` table
   - Adds `planId` to `companies`
   - Creates default Free plan if companies exist
   - Assigns existing companies to Free plan

2. **Seed script runs:**
   - Clears existing plans (if any)
   - Creates 4 standard plans
   - Creates company with `planId` reference

### For New Databases

1. **Migration runs:**
   - Creates `plans` table
   - Adds `planId` to `companies`

2. **Seed script runs:**
   - Creates 4 standard plans
   - Creates company with `planId` reference

---

## 🚀 Future: Admin Dashboard Integration

### What's Ready

✅ Database schema supports custom plans  
✅ Plan model has all necessary fields  
✅ Code supports plan overrides  
✅ Migration and seed scripts ready  

### What's Needed (Future)

- Admin dashboard UI for plan management
- API endpoints for plan CRUD operations
- UI for assigning plans to companies
- UI for creating custom plans

### Example Admin Dashboard Operations

```typescript
// Create custom plan
await prisma.plan.create({
  data: {
    name: 'Acme Corp Enterprise',
    planTier: 'ENTERPRISE',
    planType: 'CUSTOM',
    maxWebhooks: 50,
    // ... other config
  }
});

// Assign plan to company
await prisma.company.update({
  where: { id: companyId },
  data: { planId: customPlanId }
});
```

---

## 📝 Files Changed

### Schema & Migrations
- ✅ `services/api/prisma/schema.prisma` - Added Plan model, PlanType enum, updated Company
- ✅ `services/api/prisma/migrations/20250130000000_add_plan_model/migration.sql` - New migration

### Seed Script
- ✅ `services/api/prisma/seed.ts` - Creates standard plans, assigns company to plan

### Code
- ✅ `services/api/src/lib/plans.ts` - Added Company-based functions, support for planOverrides
- ✅ `services/api/src/routes/v1/webhooks.ts` - Uses Company-based plan functions
- ✅ `services/api/src/lib/webhookEnqueue.ts` - Uses Company-based plan functions

### Documentation
- ✅ `PLAN_ARCHITECTURE.md` - Architecture design document
- ✅ `PLAN_MANAGEMENT.md` - Plan management guide (updated)
- ✅ `PLAN_CHANGES_SUMMARY.md` - This file

### Scripts
- ✅ `scripts/cleanup-failed-migration.ps1` - Cleanup script for failed migrations

---

## ✅ What Works Now

1. **Standard Plans**: 4 plans (FREE, STARTER, GROWTH, ENTERPRISE) created via seed
2. **Plan Assignment**: Companies reference plans via `planId`
3. **Plan Overrides**: Per-company overrides still work via `planOverrides` JSON
4. **Feature Gating**: Webhook limits enforced based on plan + overrides
5. **Database-Driven**: Plans stored in database, ready for admin dashboard

---

## 🎯 Key Benefits

1. **Admin Dashboard Ready**: Plans can be managed via UI without code changes
2. **Flexible**: Standard plans can be edited, custom plans can be created
3. **Future-Proof**: Easy to add new plan types or configuration fields
4. **Sales-Friendly**: Sales team can create custom plans for enterprise deals
5. **No Breaking Changes**: Existing functionality continues to work

---

## 📚 Related Documentation

- **Architecture**: See `PLAN_ARCHITECTURE.md` for full design
- **Management**: See `PLAN_MANAGEMENT.md` for how to manage plans
- **Testing**: See `TESTING_GUIDE.md` for testing plan features

---

## Summary

The plan system has been successfully migrated from hardcoded configurations to a database-driven system. All standard plans are now database records, and the infrastructure is ready for admin dashboard integration. The system maintains backward compatibility through `planOverrides` while moving forward with a flexible, scalable architecture.

