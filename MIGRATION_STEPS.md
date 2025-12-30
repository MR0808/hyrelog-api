# Migration Steps for Phase 2.x

You need to run migrations before seeding or using the API with Phase 2.x features.

## Quick Migration Steps

### Step 1: Create Migration

```powershell
# Set DATABASE_URL for one region (we'll create migration once, then apply to all)
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54321/hyrelog_us"
npm run prisma:migrate --workspace=services/api
```

When prompted, name the migration: `add_plan_tiers_and_billing`

### Step 2: Apply Migrations to All Regions

```powershell
npm run prisma:migrate:all
```

This will apply the migration to all 4 databases (US, EU, UK, AU).

### Step 3: Regenerate Prisma Client

```powershell
npm run prisma:generate
```

This updates the TypeScript types to match the new schema.

### Step 4: Verify Migration

You can verify the migration worked by checking the database:

```powershell
# Using Prisma Studio
npm run prisma:studio
```

Or check directly:
```powershell
# Connect to US database
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54321/hyrelog_us"
npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' AND column_name IN ('planTier', 'billingStatus', 'stripeCustomerId');"
```

## What the Migration Adds

The migration adds:
- `PlanTier` enum: FREE, STARTER, GROWTH, ENTERPRISE
- `BillingStatus` enum: ACTIVE, TRIALING, PAST_DUE, CANCELED
- To `companies` table:
  - `planTier` (default: FREE)
  - `billingStatus` (default: ACTIVE)
  - `stripeCustomerId` (nullable, unique)
  - `stripeSubscriptionId` (nullable, unique)
  - `stripePriceId` (nullable)
  - `trialEndsAt` (nullable)
  - `planOverrides` (JSON, nullable)

## Troubleshooting

### Error: "Migration already exists"

If you see this, the migration was already created. Just run:
```powershell
npm run prisma:migrate:all
```

### Error: "Table does not exist"

Make sure Docker containers are running:
```powershell
npm run docker:up
docker ps  # Should show 5 containers
```

### Error: "Connection refused"

Check that Postgres containers are running:
```powershell
docker logs hyrelog-postgres-us
```

## After Migration

Once migrations are complete, you can:
1. Seed the database: `npm run seed`
2. Start the API: `npm run dev`
3. Test with Postman

