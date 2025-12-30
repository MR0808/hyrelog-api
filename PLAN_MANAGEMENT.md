# Plan Management Guide

This guide explains how to manage plans, their capabilities, and create custom enterprise plans in HyreLog.

## Table of Contents

1. [Understanding Plans](#understanding-plans)
2. [Base Plan Configurations](#base-plan-configurations)
3. [Changing Base Plan Limits](#changing-base-plan-limits)
4. [Creating Custom Enterprise Plans](#creating-custom-enterprise-plans)
5. [Managing Plans via Database](#managing-plans-via-database)
6. [Managing Plans via API (Future)](#managing-plans-via-api-future)

---

## Understanding Plans

HyreLog uses a **centralized plan engine** (`services/api/src/lib/plans.ts`) that defines:

- **Base Plans**: FREE, STARTER, GROWTH, ENTERPRISE with fixed configurations
- **Plan Overrides**: Custom configurations stored in `Company.planOverrides` (JSON field)
- **Merged Configuration**: Base plan + overrides = effective plan for a company

### How It Works

1. **Base Plan**: Every company has a `planTier` (FREE, STARTER, GROWTH, or ENTERPRISE)
2. **Plan Overrides** (optional): Enterprise companies can have custom limits stored in `planOverrides` JSON
3. **Effective Plan**: The system merges base plan + overrides to determine actual limits

**Example:**
- Company has `planTier = ENTERPRISE` (base: 20 webhooks)
- Company has `planOverrides = { "maxWebhooks": 50 }`
- **Effective limit**: 50 webhooks (override takes precedence)

---

## Base Plan Configurations

Current base plan limits are defined in `services/api/src/lib/plans.ts`:

### FREE
```typescript
{
  webhooksEnabled: false,
  maxWebhooks: 0,
  streamingExportsEnabled: false,
  maxExportRows: 10_000,
  hotRetentionDays: 7,
  allowCustomCategories: false,
}
```

### STARTER
```typescript
{
  webhooksEnabled: false,
  maxWebhooks: 0,
  streamingExportsEnabled: true,
  maxExportRows: 250_000,
  hotRetentionDays: 30,
  archiveRetentionDays: 180,
  allowCustomCategories: true,
}
```

### GROWTH
```typescript
{
  webhooksEnabled: true,
  maxWebhooks: 3,
  streamingExportsEnabled: true,
  maxExportRows: 1_000_000,
  hotRetentionDays: 90,
  archiveRetentionDays: 365,
  coldArchiveAfterDays: 365,
  allowCustomCategories: true,
}
```

### ENTERPRISE
```typescript
{
  webhooksEnabled: true,
  maxWebhooks: 20,
  streamingExportsEnabled: true,
  maxExportRows: Number.MAX_SAFE_INTEGER, // Effectively unlimited
  hotRetentionDays: 180,
  archiveRetentionDays: 2555, // ~7 years
  coldArchiveAfterDays: 365,
  allowCustomCategories: true,
}
```

---

## Changing Base Plan Limits

To change the limits for all companies on a plan tier:

1. **Edit `services/api/src/lib/plans.ts`**
   ```typescript
   const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
     GROWTH: {
       webhooksEnabled: true,
       maxWebhooks: 5, // Changed from 3 to 5
       // ... rest of config
     },
   };
   ```

2. **Restart the API server**
   ```powershell
   # Stop current server (Ctrl+C) and restart:
   npm run dev
   ```

**⚠️ Important:** This affects ALL companies on that plan tier immediately. Use with caution in production.

---

## Creating Custom Enterprise Plans

For enterprise customers who need custom limits, use the `planOverrides` JSON field on the `Company` model.

### Method 1: Via Prisma Studio (Recommended for Testing)

1. **Open Prisma Studio:**
   ```powershell
   npm run prisma:studio:us
   ```

2. **Navigate to `companies` table**

3. **Find your company** and click to edit

4. **Set `planTier` to `ENTERPRISE`** (if not already)

5. **Set `planOverrides`** to a JSON object with custom limits:
   ```json
   {
     "maxWebhooks": 50,
     "maxExportRows": 5000000,
     "hotRetentionDays": 365
   }
   ```

6. **Save** - Changes take effect immediately (no restart needed)

### Method 2: Via SQL (Direct Database Access)

```sql
-- Update company with custom webhook limit
UPDATE companies
SET "planOverrides" = '{"maxWebhooks": 50, "maxExportRows": 5000000}'::jsonb
WHERE id = 'your-company-id';
```

### Method 3: Via Prisma Client (Script)

Create a script `scripts/update-company-plan.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateCompanyPlan() {
  const companyId = 'your-company-id';
  
  await prisma.company.update({
    where: { id: companyId },
    data: {
      planTier: 'ENTERPRISE',
      planOverrides: {
        maxWebhooks: 50,
        maxExportRows: 5_000_000,
        hotRetentionDays: 365,
      },
    },
  });
  
  console.log('Company plan updated!');
}

updateCompanyPlan()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run it:
```powershell
tsx scripts/update-company-plan.ts
```

---

## Managing Plans via Database

### View Current Plan Configuration

**Via Prisma Studio:**
1. Open `npm run prisma:studio:us`
2. Go to `companies` table
3. View `planTier` and `planOverrides` columns

**Via SQL:**
```sql
SELECT 
  id,
  name,
  "planTier",
  "planOverrides"
FROM companies;
```

### Change a Company's Plan Tier

**Via Prisma Studio:**
1. Edit the company record
2. Change `planTier` dropdown (FREE, STARTER, GROWTH, ENTERPRISE)
3. Save

**Via SQL:**
```sql
UPDATE companies
SET "planTier" = 'GROWTH'
WHERE id = 'your-company-id';
```

### Add/Update Plan Overrides

**Via Prisma Studio:**
1. Edit the company record
2. In `planOverrides` field, enter JSON:
   ```json
   {
     "maxWebhooks": 50,
     "maxExportRows": 10000000
   }
   ```
3. Save

**Via SQL:**
```sql
UPDATE companies
SET "planOverrides" = '{"maxWebhooks": 50}'::jsonb
WHERE id = 'your-company-id';
```

### Remove Plan Overrides

**Via Prisma Studio:**
1. Edit the company record
2. Clear the `planOverrides` field (set to `null`)
3. Save

**Via SQL:**
```sql
UPDATE companies
SET "planOverrides" = NULL
WHERE id = 'your-company-id';
```

---

## Plan Overrides Reference

### Available Override Fields

All fields from `PlanConfig` can be overridden:

```typescript
{
  webhooksEnabled?: boolean;        // Enable/disable webhooks
  maxWebhooks?: number;             // Max webhook endpoints
  streamingExportsEnabled?: boolean; // Enable/disable streaming exports
  maxExportRows?: number;           // Max rows per export
  hotRetentionDays?: number;        // Days to keep in hot storage
  archiveRetentionDays?: number;    // Days to keep in archive
  coldArchiveAfterDays?: number;    // Days before moving to cold storage
  allowCustomCategories?: boolean;   // Allow custom event categories
}
```

### Example Overrides

**Custom Webhook Limit:**
```json
{
  "maxWebhooks": 100
}
```

**Extended Retention:**
```json
{
  "hotRetentionDays": 730,
  "archiveRetentionDays": 3650
}
```

**Unlimited Exports:**
```json
{
  "maxExportRows": 999999999
}
```

**Full Custom Enterprise Plan:**
```json
{
  "maxWebhooks": 50,
  "maxExportRows": 10000000,
  "hotRetentionDays": 365,
  "archiveRetentionDays": 2555,
  "coldArchiveAfterDays": 730,
  "allowCustomCategories": true
}
```

---

## How Overrides Work

1. **Base Plan First**: System loads base plan configuration
2. **Merge Overrides**: Overrides are shallow-merged on top
3. **Override Wins**: If a field exists in overrides, it replaces the base value
4. **Missing Fields**: If a field is missing in overrides, base plan value is used

**Example:**
- Base ENTERPRISE: `{ maxWebhooks: 20, maxExportRows: 999999999 }`
- Overrides: `{ maxWebhooks: 50 }`
- **Result**: `{ maxWebhooks: 50, maxExportRows: 999999999 }`

---

## Best Practices

### 1. **Use ENTERPRISE for Custom Plans**
- Always set `planTier = ENTERPRISE` when using `planOverrides`
- This ensures all enterprise features are enabled

### 2. **Document Custom Plans**
- Keep a record of which companies have custom overrides
- Document the business reason for custom limits

### 3. **Test Changes**
- Test plan changes in development/staging first
- Verify limits are enforced correctly

### 4. **Monitor Usage**
- Check if companies are approaching their limits
- Proactively reach out before limits are hit

### 5. **Version Control**
- Keep `plans.ts` in version control
- Document why base plan limits were changed

---

## Troubleshooting

### Plan Changes Not Taking Effect

1. **Check if server was restarted** (for base plan changes)
2. **Verify `planOverrides` JSON is valid** (check for syntax errors)
3. **Check company's `planTier`** (must match expected tier)
4. **Review API logs** for plan restriction errors

### Invalid JSON in planOverrides

If `planOverrides` contains invalid JSON:
- Prisma Studio will show an error
- SQL will fail with a JSON parsing error
- Fix by setting `planOverrides = NULL` and re-entering valid JSON

### Limits Not Enforced

1. **Verify plan engine is being used** (check imports in route handlers)
2. **Check if overrides are being loaded** (company object must include `planOverrides`)
3. **Review logs** for plan restriction errors

---

## Future: API Endpoints for Plan Management

Currently, plan management is done via database. Future API endpoints could include:

- `GET /internal/companies/:id/plan` - View current plan configuration
- `PATCH /internal/companies/:id/plan` - Update plan tier or overrides
- `GET /internal/plans` - List all base plan configurations

**Note:** These would be internal/admin endpoints, not customer-facing.

---

## Summary

- **Base Plans**: Defined in `plans.ts`, affect all companies on that tier
- **Custom Plans**: Use `planOverrides` JSON field for enterprise customers
- **Changes**: Base plans require server restart, overrides take effect immediately
- **Management**: Use Prisma Studio, SQL, or scripts to manage plans
- **Best Practice**: Always use ENTERPRISE tier when applying custom overrides

