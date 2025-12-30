# Plan Architecture: Database-Driven Plans

## Overview

HyreLog uses a **database-driven plan system** that supports both standard plans (FREE, STARTER, GROWTH, ENTERPRISE) and custom plans created by the admin dashboard. This architecture is designed to be future-proof and admin-dashboard-ready.

---

## Architecture Design

### Core Concept

**Plans are stored in the database**, not hardcoded in code. This allows:
- ✅ Admin dashboard to create/edit plans without code changes
- ✅ Sales team to create custom plans for enterprise customers
- ✅ Runtime plan limit changes without server restarts
- ✅ Standard plans are just pre-seeded database records

### Database Schema

```
Plan (plans table)
├── id (UUID)
├── name (e.g., "Free", "Starter", "Growth", "Enterprise", "Acme Corp Custom")
├── planTier (FREE, STARTER, GROWTH, ENTERPRISE) - for standard plans
├── planType (STANDARD or CUSTOM)
├── Configuration fields (webhooksEnabled, maxWebhooks, etc.)
└── Metadata (description, isActive, isDefault)

Company (companies table)
├── planId → references Plan.id
├── planTier (DEPRECATED - kept for backward compatibility)
└── planOverrides (JSON) - per-company tweaks
```

### Plan Resolution Order

When checking a company's plan limits:

1. **Base Plan**: Load from `Plan` table (via `company.planId`)
2. **Plan Overrides**: Apply `company.planOverrides` (if present)
3. **Result**: Merged configuration

**Example:**
- Plan "Enterprise" has `maxWebhooks: 20`
- Company has `planOverrides: { "maxWebhooks": 50 }`
- **Effective limit**: 50 webhooks

---

## Plan Types

### Standard Plans

Standard plans are pre-seeded database records with:
- `planType = STANDARD`
- `planTier = FREE | STARTER | GROWTH | ENTERPRISE`
- Pre-defined configurations

**Standard plans are managed via:**
- Initial database seed
- Admin dashboard (can edit limits)
- Cannot be deleted (only disabled)

### Custom Plans

Custom plans are created by the admin dashboard:
- `planType = CUSTOM`
- `planTier = ENTERPRISE` (typically)
- Custom configurations per customer needs

**Custom plans are managed via:**
- Admin dashboard (create/edit/delete)
- Sales team can create for enterprise customers
- Can be deleted if no companies are using them

---

## Migration Strategy

### Phase 1: Schema Update (Current)

1. Add `Plan` model to schema
2. Add `planId` to `Company` model
3. Keep `planTier` for backward compatibility
4. Create migration

### Phase 2: Seed Standard Plans

1. Create seed script to insert standard plans
2. Assign existing companies to appropriate plans
3. Set `planId` based on current `planTier`

### Phase 3: Update Plan Engine

1. Refactor `plans.ts` to load from database
2. Add caching for performance
3. Fallback to hardcoded configs if plan not found

### Phase 4: Admin Dashboard (Future)

1. CRUD endpoints for plans
2. UI to create/edit plans
3. UI to assign plans to companies

---

## Benefits

### 1. **Admin Dashboard Ready**
- Plans can be managed via UI
- No code changes needed for plan updates
- Sales team can create custom plans

### 2. **Flexibility**
- Standard plans can be edited
- Custom plans for enterprise customers
- Per-company overrides still supported

### 3. **Future-Proof**
- Easy to add new plan types
- Easy to add new configuration fields
- Supports A/B testing different plan limits

### 4. **Backward Compatible**
- `planTier` field kept for migration period
- Code can fallback to hardcoded configs
- Gradual migration path

---

## Implementation Details

### Plan Model Fields

```prisma
model Plan {
  id                      String   @id @default(uuid())
  name                    String   @unique
  planTier                PlanTier
  planType                PlanType @default(STANDARD)
  
  // Configuration
  webhooksEnabled         Boolean
  maxWebhooks             Int
  streamingExportsEnabled Boolean
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
}
```

### Company Model Changes

```prisma
model Company {
  // NEW: Database-driven plan assignment
  planId       String   // References Plan
  
  // DEPRECATED: Kept for backward compatibility
  planTier     PlanTier @default(FREE)
  
  // Still supported: Per-company overrides
  planOverrides Json?
  
  plan         Plan     @relation(fields: [planId], references: [id])
}
```

---

## Plan Engine Refactoring

### Current (Hardcoded)

```typescript
const PLAN_CONFIGS = {
  GROWTH: { maxWebhooks: 3, ... }
};
```

### New (Database-Driven)

```typescript
async function getPlanConfig(company: Company): Promise<PlanConfig> {
  // 1. Load plan from database
  const plan = await prisma.plan.findUnique({
    where: { id: company.planId }
  });
  
  // 2. Apply planOverrides
  const config = mergeConfig(plan, company.planOverrides);
  
  return config;
}
```

### Caching Strategy

For performance, plans should be cached:

```typescript
// In-memory cache with TTL
const planCache = new Map<string, { config: PlanConfig; expiresAt: number }>();

async function getCachedPlanConfig(planId: string): Promise<PlanConfig> {
  const cached = planCache.get(planId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }
  
  // Load from DB and cache
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  const config = planToConfig(plan);
  planCache.set(planId, {
    config,
    expiresAt: Date.now() + 60000 // 1 minute TTL
  });
  
  return config;
}
```

---

## Admin Dashboard API (Future)

### Endpoints

```
GET    /admin/plans              - List all plans
GET    /admin/plans/:id          - Get plan details
POST   /admin/plans              - Create custom plan
PATCH  /admin/plans/:id          - Update plan
DELETE /admin/plans/:id          - Delete plan (if unused)

GET    /admin/companies/:id/plan  - Get company's plan
PATCH  /admin/companies/:id/plan - Assign plan to company
```

### Example: Create Custom Plan

```json
POST /admin/plans
{
  "name": "Acme Corp Enterprise",
  "planType": "CUSTOM",
  "planTier": "ENTERPRISE",
  "webhooksEnabled": true,
  "maxWebhooks": 50,
  "maxExportRows": 10000000,
  "description": "Custom plan for Acme Corp"
}
```

### Example: Assign Plan to Company

```json
PATCH /admin/companies/{companyId}/plan
{
  "planId": "plan-uuid-here"
}
```

---

## Migration Steps

### 1. Update Schema

```bash
npm run prisma:migrate --workspace=services/api
# Name: add_plan_model
```

### 2. Seed Standard Plans

Create `prisma/seed-plans.ts`:

```typescript
const standardPlans = [
  {
    name: 'Free',
    planTier: 'FREE',
    planType: 'STANDARD',
    webhooksEnabled: false,
    maxWebhooks: 0,
    // ... rest of config
  },
  // ... STARTER, GROWTH, ENTERPRISE
];

await prisma.plan.createMany({ data: standardPlans });
```

### 3. Migrate Existing Companies

```typescript
// Assign companies to plans based on planTier
const companies = await prisma.company.findMany();
for (const company of companies) {
  const plan = await prisma.plan.findFirst({
    where: { planTier: company.planTier, planType: 'STANDARD' }
  });
  
  await prisma.company.update({
    where: { id: company.id },
    data: { planId: plan.id }
  });
}
```

### 4. Update Plan Engine

Refactor `plans.ts` to load from database with caching.

---

## Backward Compatibility

During migration, the system supports both approaches:

1. **If `planId` exists**: Load from database
2. **If `planId` missing**: Fallback to hardcoded configs based on `planTier`
3. **Plan overrides**: Always applied (from `planOverrides` JSON)

This allows gradual migration without breaking existing functionality.

---

## Summary

✅ **Database-driven**: Plans stored in DB, not code  
✅ **Admin-ready**: Can be managed via dashboard  
✅ **Flexible**: Standard + custom plans supported  
✅ **Backward compatible**: Gradual migration path  
✅ **Future-proof**: Easy to extend and modify  

This architecture prepares HyreLog for admin dashboard integration while maintaining flexibility for sales-driven custom plans.

