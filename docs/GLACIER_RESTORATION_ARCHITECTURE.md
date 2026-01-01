# Glacier Restoration Architecture

## Overview

Cold archived objects stored in AWS S3 Glacier require restoration before they can be exported. This document outlines the recommended architecture for handling restoration requests.

## Design Decision: Hybrid Approach

**Recommendation**: Implement a **customer-initiated, admin-approved** restoration workflow.

### Why Not Fully Automated (Customer-Only)?

1. **Cost Control**: Glacier restoration incurs retrieval costs that vary by tier:
   - Expedited: ~$0.03/GB + $0.01/GB/month (1-5 min, requires provisioned capacity)
   - Standard: ~$0.01/GB + $0.004/GB/month (3-5 hours)
   - Bulk: ~$0.0025/GB + $0.004/GB/month (5-12 hours)

2. **Abuse Prevention**: Customers might accidentally request expensive expedited restorations

3. **Billing Complexity**: Need to track and bill restoration costs separately

4. **Time Expectations**: Customers need to understand restoration takes hours, not seconds

### Why Not Admin-Only?

1. **Customer Self-Service**: Customers should be able to request restorations without waiting for support

2. **Transparency**: Customers can see restoration status and estimated completion time

3. **Scalability**: Reduces support burden for routine requests

## Recommended Architecture

### 1. Database Schema Changes

Add a `GlacierRestoreRequest` model:

```prisma
model GlacierRestoreRequest {
  id            String   @id @default(uuid())
  companyId     String
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  region        Region
  archiveId     String   // ArchiveObject.id
  archive       ArchiveObject @relation(fields: [archiveId], references: [id], onDelete: Cascade)
  
  // Request details
  requestedBy   String   // User ID or API key ID
  requestedAt   DateTime @default(now())
  tier          String   // "Expedited" | "Standard" | "Bulk"
  days          Int      @default(7) // How long restored copy should be available
  
  // Status tracking
  status        GlacierRestoreStatus @default(PENDING)
  s3RestoreId   String? // AWS restore request ID
  initiatedAt   DateTime?
  initiatedBy   String?  // Admin user ID
  
  // Completion tracking
  completedAt   DateTime?
  expiresAt     DateTime? // When restored copy expires
  errorMessage  String?
  
  // Metadata
  estimatedCost Decimal?  // In USD
  actualCost    Decimal?  // In USD (after completion)
  
  @@index([companyId, status])
  @@index([archiveId])
  @@index([status, requestedAt])
}

enum GlacierRestoreStatus {
  PENDING        // Customer requested, awaiting admin approval
  APPROVED       // Admin approved, ready to initiate
  INITIATING     // S3 restore request sent
  IN_PROGRESS    // Waiting for S3 to complete restoration
  COMPLETED      // Restored and available
  EXPIRED        // Restored copy expired
  FAILED         // Restoration failed
  CANCELLED      // Cancelled by admin or customer
}
```

### 2. API Endpoints

#### Customer-Facing Endpoints

**POST /v1/restore-requests**
- Create a restoration request for cold archived data
- Requires date range or specific archive IDs
- Customer selects tier (with cost estimates shown)
- Returns request ID and estimated completion time
- Status: `PENDING` (awaiting admin approval)

**GET /v1/restore-requests**
- List customer's restoration requests
- Filter by status, date range
- Shows current status, estimated completion, costs

**GET /v1/restore-requests/:requestId**
- Get details of specific restoration request

**DELETE /v1/restore-requests/:requestId**
- Cancel a pending request (only if status is `PENDING`)

#### Admin-Only Endpoints

**GET /admin/restore-requests**
- List all restoration requests across all companies
- Filter by company, status, date range
- Includes cost information

**POST /admin/restore-requests/:requestId/approve**
- Approve a pending restoration request
- Automatically initiates S3 restore
- Status: `PENDING` → `INITIATING` → `IN_PROGRESS`

**POST /admin/restore-requests/:requestId/reject**
- Reject a restoration request
- Status: `PENDING` → `CANCELLED`
- Optional: Include reason for rejection

**POST /admin/restore-requests/:requestId/cancel**
- Cancel an in-progress restoration (if possible)
- Status: `IN_PROGRESS` → `CANCELLED`

### 3. Worker Job: Restoration Status Checker

**Purpose**: Poll S3 to check if restorations are complete

**Frequency**: Every 15 minutes

**Process**:
1. Find all requests with status `IN_PROGRESS`
2. For each, call `headObject` on S3 to check restore status
3. If restored:
   - Update status to `COMPLETED`
   - Set `completedAt` and `expiresAt`
   - Unmark `isColdArchived` flag on ArchiveObject
   - Send notification to customer
4. If expired:
   - Update status to `EXPIRED`
   - Re-mark `isColdArchived` flag

### 4. Worker Job: Restoration Expiration Checker

**Purpose**: Re-mark archives as cold archived when restored copies expire

**Frequency**: Daily

**Process**:
1. Find all `COMPLETED` requests where `expiresAt < now()`
2. Re-mark ArchiveObjects as `isColdArchived = true`
3. Update request status to `EXPIRED`

### 5. Cost Estimation

Before customer submits request, show estimated costs:

```typescript
function estimateRestoreCost(
  archiveSizeGB: number,
  tier: 'Expedited' | 'Standard' | 'Bulk'
): number {
  const costs = {
    Expedited: 0.03, // $0.03/GB
    Standard: 0.01,  // $0.01/GB
    Bulk: 0.0025,    // $0.0025/GB
  };
  
  return archiveSizeGB * costs[tier];
}
```

### 6. Notification System

Send notifications when:
- Request is approved by admin
- Restoration is initiated
- Restoration completes
- Restoration fails
- Restored copy is about to expire (24h warning)

### 7. Plan-Based Restrictions

- **FREE/STARTER**: No cold archive restoration (archives older than retention are permanently archived)
- **GROWTH**: Standard/Bulk tier only, max 1TB/month
- **ENTERPRISE**: All tiers, unlimited (with cost tracking)

## Implementation Priority

### Phase 1 (MVP)
1. Database schema for `GlacierRestoreRequest`
2. Customer endpoint to create requests
3. Admin endpoint to approve requests
4. Worker job to initiate S3 restorations
5. Worker job to check restoration status

### Phase 2 (Enhanced)
1. Cost estimation and display
2. Notification system
3. Expiration handling
4. Dashboard UI for customers and admins

### Phase 3 (Advanced)
1. Automated approval for low-cost requests
2. Batch restoration requests
3. Cost analytics and reporting
4. Integration with billing system

## Alternative: Fully Automated (Future Consideration)

Once you have:
- Robust cost controls and limits
- Automated billing integration
- Customer education about costs
- Rate limiting and abuse prevention

You could allow customers to directly initiate restorations with:
- Automatic approval for Standard/Bulk tier
- Admin approval required for Expedited tier
- Hard limits on monthly restoration costs per plan

## Example Flow

1. **Customer**: Requests restoration for date range `2024-01-01` to `2024-01-31`
   - System finds 5 cold archived ArchiveObjects
   - Shows cost estimate: $0.50 (Standard tier)
   - Customer submits request

2. **System**: Creates `GlacierRestoreRequest` with status `PENDING`
   - Sends notification to admin dashboard

3. **Admin**: Reviews request in dashboard
   - Sees: 5 archives, 2.5GB total, $0.50 cost, Standard tier
   - Approves request

4. **System**: Initiates S3 restorations
   - For each ArchiveObject, calls `restoreObject` API
   - Updates status to `IN_PROGRESS`
   - Sets `initiatedAt` timestamp

5. **Worker Job** (every 15 min): Checks restoration status
   - After 4 hours, all restorations complete
   - Updates status to `COMPLETED`
   - Unmarks `isColdArchived` flags
   - Sends notification to customer

6. **Customer**: Can now export the restored data
   - Export API includes the previously cold archived data

7. **Worker Job** (daily): After 7 days, restored copies expire
   - Re-marks archives as cold archived
   - Updates request status to `EXPIRED`
