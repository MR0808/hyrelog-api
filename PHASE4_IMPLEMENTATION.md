# Phase 4.0 Implementation Summary

## Overview

Phase 4.0 adds protected dashboard endpoints with service token authentication, comprehensive audit logging, and Glacier restore workflow support.

## Deliverables

### 1. Prisma Schema Updates ✅

**New Enums:**
- `GlacierRestoreStatus`: PENDING, APPROVED, INITIATING, IN_PROGRESS, COMPLETED, EXPIRED, FAILED, CANCELLED
- `GlacierRestoreTier`: EXPEDITED, STANDARD, BULK

**New Models:**
- `AuditLog`: Logs all dashboard actions
- `GlacierRestoreRequest`: Tracks restore request lifecycle

**Updated Models:**
- `ArchiveObject`: Added `restoredUntil` field
- `Company`: Added relations to `auditLogs` and `restoreRequests`

**Migration File:**
- `20250201000000_add_dashboard_and_glacier_restore/migration.sql`

### 2. Security & Authentication ✅

**Dashboard Auth Plugin** (`services/api/src/plugins/dashboardAuth.ts`):
- Validates `x-dashboard-token` header against `DASHBOARD_SERVICE_TOKEN` env var
- Requires actor headers: `x-user-id`, `x-user-email`, `x-user-role`
- For company-scoped routes: requires `x-company-id`
- Verifies company exists and attaches region-specific Prisma client
- Admin routes require `x-user-role: HYRELOG_ADMIN`

**Config Update:**
- Added `dashboardServiceToken` to config schema (optional)

### 3. Glacier Restore Service ✅

**File:** `services/api/src/lib/glacierRestore.ts`

**Functions:**
- `estimateRestoreCost(bytes, tier, days)`: Calculates USD cost based on AWS pricing
- `estimateCompletionTime(tier)`: Returns estimated completion in minutes
- `getDefaultRestoreDays(tier)`: Returns default restore duration
- `initiateRestore(region, bucket, key, tier, days)`: 
  - Production: Uses AWS SDK `RestoreObjectCommand`
  - Development (MinIO): Simulates restore, returns fake ID
- `checkRestoreStatus(region, bucket, key, restoreId)`:
  - Production: Uses `HeadObjectCommand` to parse Restore header
  - Development: Simulates completion after ~2 minutes

**Cost Constants:**
- EXPEDITED: $0.03/GB + $0.01/GB/month
- STANDARD: $0.01/GB + $0.004/GB/month
- BULK: $0.0025/GB + $0.004/GB/month

### 4. Dashboard Routes ✅

**Company Routes** (`services/api/src/routes/dashboard/company.ts`):
- `GET /dashboard/company` - Get company summary with plan
- `GET /dashboard/events` - Query events (company-scoped)
- `POST /dashboard/exports` - Create export (placeholder - delegates to /v1/exports)
- `GET /dashboard/exports/:jobId` - Get export status
- `GET /dashboard/webhooks` - List webhooks

**Restore Routes** (`services/api/src/routes/dashboard/restore.ts`):
- `POST /dashboard/restore-requests` - Create restore request
- `GET /dashboard/restore-requests` - List restore requests
- `GET /dashboard/restore-requests/:id` - Get restore request details
- `DELETE /dashboard/restore-requests/:id` - Cancel restore request (PENDING only)

**Admin Routes** (`services/api/src/routes/dashboard/admin.ts`):
- `GET /dashboard/admin/companies` - List/search companies
- `GET /dashboard/admin/plans` - List all plans
- `POST /dashboard/admin/companies/:id/plan` - Assign plan to company
- `GET /dashboard/admin/restore-requests` - List all restore requests
- `POST /dashboard/admin/restore-requests/:id/approve` - Approve restore
- `POST /dashboard/admin/restore-requests/:id/reject` - Reject restore
- `GET /dashboard/admin/audit-logs` - Get audit logs

### 5. Worker Jobs ✅

**Restore Initiator Job** (`services/worker/src/jobs/restoreInitiatorJob.ts`):
- Runs every 5 minutes
- Processes `APPROVED` restore requests
- Updates status: `APPROVED` → `INITIATING` → `IN_PROGRESS`
- Calls `initiateRestore()` and stores `s3RestoreId`

**Restore Status Checker Job** (`services/worker/src/jobs/restoreStatusCheckerJob.ts`):
- Runs every 15 minutes
- Checks `IN_PROGRESS` restore requests
- Updates status to `COMPLETED` when ready
- Sets `expiresAt` and updates `ArchiveObject.restoredUntil`
- Marks `ArchiveObject.isColdArchived = false`

**Restore Expiration Job** (`services/worker/src/jobs/restoreExpirationJob.ts`):
- Runs daily
- Finds `COMPLETED` requests where `expiresAt < now`
- Updates status to `EXPIRED`
- Re-marks `ArchiveObject.isColdArchived = true` and clears `restoredUntil`

### 6. Export Integration ✅

**Updated:** `services/api/src/routes/v1/exports.ts`

**Changes:**
- `streamArchivedData()` now checks for cold archived objects
- If cold archived and not restored → throws `RESTORE_REQUIRED` error
- Checks for active restore requests (`COMPLETED` with `expiresAt > now`)
- Returns error with `archiveIds` array requiring restoration
- Download endpoint handles `RESTORE_REQUIRED` error code

### 7. Audit Logging ✅

**Helper:** `services/api/src/lib/auditLog.ts`

**Function:**
- `logDashboardAction(prisma, request, context)`: Logs all dashboard actions
- Captures: action, actor info, target company, IP, userAgent, traceId, metadata
- Non-blocking (doesn't fail requests if logging fails)

**Actions Logged:**
- `COMPANY_VIEWED`
- `EVENTS_QUERIED`
- `EXPORT_REQUESTED`
- `RESTORE_REQUEST_CREATED/CANCELLED/APPROVED/REJECTED`
- `WEBHOOKS_LISTED`
- `PLAN_ASSIGNED`

### 8. Plan Enforcement ✅

**Restore Request Restrictions:**
- FREE/STARTER: Not allowed (returns `PLAN_RESTRICTED`)
- GROWTH: Only STANDARD and BULK tiers
- ENTERPRISE: All tiers (EXPEDITED, STANDARD, BULK)

Uses existing `getCompanyPlanConfig()` from `plans.ts`.

### 9. Documentation ✅

**README.md Updated:**
- Phase 4 section with setup instructions
- Dashboard authentication requirements
- Testing examples with curl
- Glacier restore workflow explanation
- Worker job commands
- Plan restrictions

## Setup Instructions

### 1. Environment Variables

Add to `.env`:
```bash
DASHBOARD_SERVICE_TOKEN=your-secure-token-here
```

Generate token:
```bash
openssl rand -hex 32
```

### 2. Run Migrations

```bash
npm run prisma:migrate:all
npm run prisma:generate
```

### 3. Start Services

**API:**
```bash
npm run dev
```

**Worker (for restore jobs):**
```bash
npm run worker
```

Or run individual jobs:
```bash
npm run worker restore-initiator
npm run worker restore-status-checker
npm run worker restore-expiration
```

## Testing

### Test Dashboard Authentication

```bash
# Should fail without token
curl http://localhost:3000/dashboard/company

# Should succeed with token
curl -X GET "http://localhost:3000/dashboard/company" \
  -H "x-dashboard-token: your-token" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user@example.com" \
  -H "x-user-role: ADMIN" \
  -H "x-company-id: company-uuid"
```

### Test Restore Workflow

1. **Create restore request:**
```bash
curl -X POST "http://localhost:3000/dashboard/restore-requests" \
  -H "x-dashboard-token: your-token" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user@example.com" \
  -H "x-user-role: ADMIN" \
  -H "x-company-id: company-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "archiveId": "archive-uuid",
    "tier": "STANDARD",
    "days": 7
  }'
```

2. **Admin approves:**
```bash
curl -X POST "http://localhost:3000/dashboard/admin/restore-requests/{id}/approve" \
  -H "x-dashboard-token: your-token" \
  -H "x-user-id: admin-user" \
  -H "x-user-email: admin@hyrelog.com" \
  -H "x-user-role: HYRELOG_ADMIN"
```

3. **Worker processes** (runs automatically every 5 minutes, or manually):
```bash
npm run worker restore-initiator
```

4. **Check status** (worker runs every 15 minutes):
```bash
npm run worker restore-status-checker
```

### Test Export with Restore Requirement

1. Create a cold archived ArchiveObject
2. Try to export ARCHIVED data for that date range
3. Should receive `RESTORE_REQUIRED` error with `archiveIds` array

## File Structure

```
services/api/
├── src/
│   ├── lib/
│   │   ├── auditLog.ts          # Audit logging helper
│   │   ├── glacierRestore.ts    # Glacier restore service
│   │   └── config.ts            # Added dashboardServiceToken
│   ├── plugins/
│   │   └── dashboardAuth.ts      # Dashboard authentication plugin
│   └── routes/
│       ├── dashboard/
│       │   ├── index.ts          # Dashboard routes index
│       │   ├── company.ts        # Company-scoped routes
│       │   ├── restore.ts        # Restore request routes
│       │   └── admin.ts          # Admin-only routes
│       └── v1/
│           └── exports.ts        # Updated with restore checks
├── prisma/
│   ├── schema.prisma            # Updated with new models
│   └── migrations/
│       └── 20250201000000_add_dashboard_and_glacier_restore/
│           └── migration.sql

services/worker/
└── src/
    ├── jobs/
    │   ├── restoreInitiatorJob.ts      # Initiate restores
    │   ├── restoreStatusCheckerJob.ts   # Check restore status
    │   └── restoreExpirationJob.ts     # Expire restores
    └── index.ts                         # Updated with new jobs
```

## Known Limitations

1. **Dashboard Export/Webhook Routes**: Some routes (POST /dashboard/exports, POST /dashboard/webhooks) are placeholders that delegate to /v1/exports. Full implementation would require refactoring existing routes to accept both API key and dashboard auth contexts.

2. **Worker Import Paths**: Worker jobs duplicate some glacier restore logic to avoid cross-service dependencies. Consider creating a shared package in the future.

3. **HOT_AND_ARCHIVED Export**: Still has known issue with empty output (documented in `docs/EXPORT_KNOWN_ISSUES.md`).

## Next Steps

1. Run migrations and generate Prisma client
2. Add `DASHBOARD_SERVICE_TOKEN` to `.env`
3. Test dashboard authentication
4. Test restore workflow end-to-end
5. Complete webhook/export dashboard route implementations (if needed)
6. Add integration tests for restore workflow
