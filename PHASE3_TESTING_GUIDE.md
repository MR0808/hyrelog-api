# Phase 3 Testing Guide - Complete Postman Walkthrough

Complete step-by-step guide for testing Phase 3 features using **Postman**. This guide covers exports, retention, and archival with detailed Postman instructions.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Postman](#setup-postman)
3. [Test HOT Exports](#test-hot-exports)
4. [Test CSV Exports](#test-csv-exports)
5. [Test Worker Jobs](#test-worker-jobs)
6. [Test ARCHIVED Exports](#test-archived-exports)
7. [Test HOT_AND_ARCHIVED Exports](#test-hot_and_archived-exports)
8. [Test Plan Restrictions](#test-plan-restrictions)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Docker Containers Running

```powershell
docker compose up -d
```

Verify all containers are running:

- 4 Postgres databases (ports 54321-54324)
- MinIO (port 9000 for API, 9001 for console)

### 2. Environment Variables Set

Check your `.env` file has:

- S3/MinIO credentials (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`)
- All database URLs (`DATABASE_URL_US`, `DATABASE_URL_EU`, etc.)
- `API_KEY_SECRET` set

### 3. Run Migrations

```powershell
npm run prisma:migrate:all
npm run prisma:generate
```

### 4. Create S3 Buckets in MinIO

1. Open MinIO Console: http://localhost:9001
2. Login: `minioadmin` / `minioadmin`
3. Create buckets:
   - `hyrelog-archive-us`
   - `hyrelog-archive-eu`
   - `hyrelog-archive-uk`
   - `hyrelog-archive-au`

**Note:** The API can create buckets automatically, but it's cleaner to create them manually.

### 5. Seed Test Data with STARTER Plan

**Why STARTER?** Exports require STARTER+ plan. FREE plan will be rejected.

```powershell
$env:SEED_PLAN_TIER="STARTER"
npm run seed
```

**Save the output!** You'll need these values for Postman:

```
🔑 API Keys (save these - shown only once!):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPANY KEY (read/export across all workspaces):
hlk_co_abc123...

WORKSPACE KEY (ingest + read within workspace):
hlk_ws_xyz789...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Company Information:
   Company ID: company-uuid-here
   Workspace ID: workspace-uuid-here
   Project ID: project-uuid-here
```

### 6. Start the API Server

```powershell
npm run dev
```

Keep this terminal open. You should see:

```
[INFO] HyreLog API server started
[INFO] Server listening on http://0.0.0.0:3000
```

---

## Setup Postman

### Step 1: Import Collection and Environment

1. **Open Postman**
2. **Import Collection:**
   - Click "Import" button (top left)
   - Select `postman/HyreLog API.postman_collection.json`
   - Click "Import"

3. **Import Environment:**
   - Click "Import" again
   - Select `postman/HyreLog Local.postman_environment.json`
   - Click "Import"

4. **Select Environment:**
   - In the top-right corner, select "HyreLog Local" from the environment dropdown

### Step 2: Set Environment Variables

1. **Click the eye icon** (👁️) next to the environment dropdown
2. **Click "Edit"** to open the environment editor
3. **Set the following variables** from your seed output:

   | Variable        | Value                   | Description                        |
   | --------------- | ----------------------- | ---------------------------------- |
   | `base_url`      | `http://localhost:3000` | API base URL (already set)         |
   | `company_key`   | `hlk_co_...`            | Company API key from seed output   |
   | `workspace_key` | `hlk_ws_...`            | Workspace API key from seed output |
   | `company_id`    | `company-uuid`          | Company ID from seed output        |
   | `workspace_id`  | `workspace-uuid`        | Workspace ID from seed output      |
   | `project_id`    | `project-uuid`          | Project ID from seed output        |

4. **Click "Save"** to save the environment

**Note:** The `export_job_id` variable will be automatically set when you create an export (via Postman Tests).

### Step 3: Verify Setup

1. **Open the collection** → "Internal" → "Health Check"
2. **Set the `internal_token` variable** (check your `.env` file for `INTERNAL_TOKEN`)
3. **Click "Send"**
4. **Expected response:** `{"status":"ok"}`

If you get an error, check:

- API server is running (`npm run dev`)
- `base_url` is correct in environment
- `internal_token` matches your `.env` file

---

## Test HOT Exports

### Step 1: Ingest Some Events (Optional)

Before exporting, you may want to ingest some test events:

1. **Open:** "V1 API" → "Events" → "Ingest Event"
2. **Click "Send"** (uses default body with workspace_key)
3. **Repeat a few times** to create multiple events

**Or use the Body tab to customize:**

```json
{
  "category": "user",
  "action": "login",
  "actor": {
    "email": "test@example.com"
  },
  "metadata": {
    "ip": "192.168.1.1",
    "userAgent": "Postman"
  }
}
```

### Step 2: Create HOT Export (JSONL)

1. **Open:** "V1 API" → "Exports" → "Create Export (HOT - JSONL)"
2. **Review the request:**
   - **Method:** POST
   - **URL:** `{{base_url}}/v1/exports`
   - **Headers:** Authorization uses `{{company_key}}` automatically
   - **Body:** Pre-configured with HOT source and JSONL format

3. **Optional: Modify the body** if needed:

   ```json
   {
     "source": "HOT",
     "format": "JSONL",
     "filters": {
       "category": "user"
     },
     "limit": 100
   }
   ```

4. **Click "Send"**

5. **Expected Response (201 Created):**

   ```json
   {
     "jobId": "export-job-uuid-here",
     "status": "PENDING"
   }
   ```

6. **Check Postman Console:**
   - Open Postman Console (View → Show Postman Console)
   - You should see: `Export job ID saved: export-job-uuid-here`
   - This means the `export_job_id` environment variable was automatically set!

### Step 3: Check Export Status

1. **Open:** "V1 API" → "Exports" → "Get Export Status"
2. **Notice:** The URL uses `{{export_job_id}}` - this was auto-set from the previous step!
3. **Click "Send"**

4. **Expected Response:**
   ```json
   {
     "id": "export-job-uuid",
     "status": "PENDING",
     "source": "HOT",
     "format": "JSONL",
     "rowLimit": "100",
     "rowsExported": "0",
     "createdAt": "2024-01-15T10:00:00.000Z"
   }
   ```

**Status Values:**

- `PENDING`: Job created, not started
- `RUNNING`: Currently streaming
- `SUCCEEDED`: Export completed successfully
- `FAILED`: Export failed (check `errorCode` and `errorMessage`)

### Step 4: Download Export

1. **Open:** "V1 API" → "Exports" → "Download Export"
2. **Click "Send and Download"** (button next to "Send")
   - This will save the file to your Downloads folder
   - Or click "Send" to view in response body

3. **Expected Result:**
   - File saved as `export.jsonl` (or similar)
   - Response body shows JSONL lines (one event per line)

4. **Verify the file:**
   - Open the downloaded file
   - Should see JSON lines like:
     ```json
     {"id":"...","timestamp":"...","category":"user","action":"login",...}
     {"id":"...","timestamp":"...","category":"user","action":"login",...}
     ```

**Note:** If the job is still `PENDING`, wait a moment and check status again. The download will start the streaming process.

---

## Test CSV Exports

### Step 1: Create HOT Export (CSV)

1. **Open:** "V1 API" → "Exports" → "Create Export (HOT - CSV)"
2. **Review the body:**

   ```json
   {
     "source": "HOT",
     "format": "CSV",
     "limit": 50
   }
   ```

3. **Click "Send"**

4. **Expected Response:**

   ```json
   {
     "jobId": "export-job-uuid-here",
     "status": "PENDING"
   }
   ```

5. **Note:** The `export_job_id` variable is automatically updated!

### Step 2: Download CSV Export

1. **Open:** "V1 API" → "Exports" → "Download Export"
2. **Click "Send and Download"**

3. **Expected Result:**
   - File saved as `export.csv`
   - First line is header: `id,timestamp,category,action,actorId,...`
   - Subsequent lines are CSV rows

4. **Verify the file:**
   - Open in Excel or text editor
   - Should see proper CSV format with headers

---

## Test Worker Jobs

Worker jobs must be run from the terminal (they're background processes). This section shows how to test them and verify results in Postman.

### Step 1: Ingest Events for Archival

Before testing archival, ingest some events:

1. **Use Postman:** "V1 API" → "Events" → "Ingest Event"
2. **Send multiple events** (at least 5-10)
3. **Verify in Postman:** "V1 API" → "Events" → "Query Events"
   - Should see your ingested events

### Step 2: Run Retention Marking Job

This marks events older than `hotRetentionDays` as ready for archival.

**In Terminal:**

```powershell
npm run worker retention-marking
```

**What it does:**

- Iterates through all regions
- For each company, marks events older than `hotRetentionDays` as `archivalCandidate=true`
- Does NOT delete events
- Plan-based: uses `Company.plan.hotRetentionDays`

**Verify in Prisma Studio:**

```powershell
npm run prisma:studio:us
```

Look at `audit_events` table - some events should have `archivalCandidate = true`.

**Note:** If your events are too new, they won't be marked. You can manually set `timestamp` in the database to be older, or wait for the retention period.

### Step 3: Run Archival Job

This archives marked events to S3.

**In Terminal:**

```powershell
npm run worker archival
```

**What it does:**

- Finds events with `archivalCandidate=true` and `archived=false`
- Groups by UTC date (YYYY-MM-DD)
- Creates gzipped JSONL files
- Uploads to S3: `archives/{companyId}/{YYYY}/{MM}/{DD}/events.jsonl.gz`
- Creates `ArchiveObject` records
- Marks events as `archived=true`

**Verify Results:**

1. **In MinIO Console** (http://localhost:9001):
   - Navigate to `hyrelog-archive-us` bucket
   - You should see folders: `archives/{companyId}/{YYYY}/{MM}/{DD}/`
   - Inside: `events.jsonl.gz` files

2. **In Prisma Studio:**
   - Check `archive_objects` table - should have new records
   - Check `audit_events` table - archived events should have `archived = true`

### Step 4: Run Archive Verification Job

This verifies archived files by SHA-256.

**In Terminal:**

```powershell
npm run worker archive-verification
```

**What it does:**

- Downloads archived files from S3
- Recomputes SHA-256 hash
- Compares with stored hash
- Updates `verifiedAt` on success
- Records `verificationError` on mismatch

**Verify in Prisma Studio:**

- `archive_objects` table - `verifiedAt` should be set for verified archives

### Step 5: Run Cold Archive Marker Job (Weekly)

This marks old archives for cold storage (metadata only).

**In Terminal:**

```powershell
npm run worker cold-archive-marker
```

**What it does:**

- Marks `ArchiveObject` records older than `coldArchiveAfterDays`
- Sets `isColdArchived=true`
- Metadata-only (actual Glacier transition handled by AWS lifecycle)

**Verify in Prisma Studio:**

- `archive_objects` table - old archives should have `isColdArchived = true`

---

## Test ARCHIVED Exports

### Prerequisites

- You must have archived data (run archival job first)
- Know the date range of your archives (check `archive_objects` table in Prisma Studio)

### Step 1: Find Archive Date Range

**In Prisma Studio:**

1. Open `archive_objects` table
2. Note the `date` column (format: YYYY-MM-DD)
3. Pick a date range that has archives

**Example:** If you see dates like `2024-01-15`, use:

- `from`: `2024-01-15T00:00:00Z`
- `to`: `2024-01-15T23:59:59Z`

### Step 2: Create ARCHIVED Export

1. **Open:** "V1 API" → "Exports" → "Create Export (ARCHIVED)"
2. **Modify the body** with your date range:

   ```json
   {
     "source": "ARCHIVED",
     "format": "JSONL",
     "filters": {
       "from": "2024-01-15T00:00:00Z",
       "to": "2024-01-15T23:59:59Z",
       "category": "user"
     }
   }
   ```

3. **Click "Send"**

4. **Expected Response:**
   ```json
   {
     "jobId": "export-job-uuid-here",
     "status": "PENDING"
   }
   ```

**Note:** `from` and `to` are **required** for ARCHIVED exports.

### Step 3: Download ARCHIVED Export

1. **Open:** "V1 API" → "Exports" → "Download Export"
2. **Click "Send and Download"**

3. **Expected Result:**
   - File contains archived events (gzipped JSONL, automatically decompressed)
   - Same format as HOT export

**Note:** If you get an error about archive retention, the requested date range is older than your plan's `archiveRetentionDays`. Check your plan configuration.

---

## Test HOT_AND_ARCHIVED Exports

This combines both HOT and ARCHIVED data in a single export.

### Step 1: Create HOT_AND_ARCHIVED Export

1. **Open:** "V1 API" → "Exports" → "Create Export (HOT_AND_ARCHIVED)"
2. **Modify the body** with your date range:

   ```json
   {
     "source": "HOT_AND_ARCHIVED",
     "format": "JSONL",
     "filters": {
       "from": "2024-01-15T00:00:00Z",
       "to": "2024-01-15T23:59:59Z"
     }
   }
   ```

3. **Click "Send"**

4. **Expected Response:**
   ```json
   {
     "jobId": "export-job-uuid-here",
     "status": "PENDING"
   }
   ```

### Step 2: Download Combined Export

1. **Open:** "V1 API" → "Exports" → "Download Export"
2. **Click "Send and Download"**

3. **Expected Result:**
   - File contains HOT events first, then ARCHIVED events
   - All in chronological order (by timestamp)
   - Single JSONL file

**Note:** This is useful for getting a complete export across both current and archived data.

---

## Test Plan Restrictions

Test that FREE plan is properly rejected for exports.

### Step 1: Re-seed with FREE Plan

**In Terminal:**

```powershell
$env:SEED_PLAN_TIER="FREE"
npm run seed
```

**Save the new company_key** from the output.

### Step 2: Update Postman Environment

1. **Edit environment:** Click eye icon → "Edit"
2. **Update `company_key`** with the new FREE plan key
3. **Save**

### Step 3: Try to Create Export

1. **Open:** "V1 API" → "Exports" → "Create Export (HOT - JSONL)"
2. **Click "Send"**

3. **Expected Error (403 Forbidden):**
   ```json
   {
     "error": "streamingExportsEnabled requires a STARTER plan or higher. Your current plan is FREE.",
     "code": "PLAN_RESTRICTED"
   }
   ```

**Success!** Plan restriction is working correctly.

### Step 4: Restore STARTER Plan

**In Terminal:**

```powershell
$env:SEED_PLAN_TIER="STARTER"
npm run seed
```

**Update Postman environment** with the new STARTER plan key.

---

## Troubleshooting

### Export Job Stuck in PENDING

**Symptoms:** Job status remains `PENDING` even after clicking "Download Export"

**Solutions:**

1. Check API server logs for errors
2. Verify plan allows exports (STARTER+)
3. Check rate limits (shouldn't be an issue for exports)
4. Try creating a new export job

### No Events to Archive

**Symptoms:** Archival job runs but creates no archives

**Solutions:**

1. Ingest more events first
2. Manually set `timestamp` in database to be older than `hotRetentionDays`
3. Wait for retention marking job to mark them
4. Check `archivalCandidate` flag in `audit_events` table

### Archive Verification Fails

**Symptoms:** `verificationError` set in `archive_objects` table

**Solutions:**

1. Check MinIO console - file should exist
2. Check `verificationError` message in `archive_objects` table
3. Verify S3 credentials in `.env`
4. Re-run verification job

### Can't Download Export

**Symptoms:** Download request fails or returns empty

**Solutions:**

1. Check job status first: "Get Export Status"
2. Verify job is in `PENDING` or `RUNNING` state
3. Check API server logs for streaming errors
4. Verify you have events to export (for HOT exports)
5. Verify you have archived data (for ARCHIVED exports)

### Plan Restriction Not Working

**Symptoms:** FREE plan can create exports

**Solutions:**

1. Verify company has correct plan assigned
2. Check `Company.planId` in database
3. Verify plan configuration in `plans` table
4. Check API server logs for plan enforcement

### Postman Auto-Extraction Not Working

**Symptoms:** `export_job_id` variable not set automatically

**Solutions:**

1. Check Postman Console for errors
2. Verify response code is 201 (not 200 or error)
3. Verify response has `jobId` field
4. Manually set `export_job_id` in environment if needed

---

## Quick Test Checklist

Use this checklist to verify all Phase 3 features:

- [ ] Seed with STARTER plan
- [ ] Create S3 buckets in MinIO
- [ ] Import Postman collection and environment
- [ ] Set environment variables (keys, IDs)
- [ ] Create HOT export (JSONL) in Postman
- [ ] Check export status in Postman
- [ ] Download export successfully
- [ ] Create CSV export in Postman
- [ ] Download CSV export
- [ ] Ingest some events
- [ ] Run retention marking job (terminal)
- [ ] Run archival job (terminal)
- [ ] Verify archives in MinIO console
- [ ] Run archive verification job (terminal)
- [ ] Create ARCHIVED export in Postman
- [ ] Download ARCHIVED export
- [ ] Create HOT_AND_ARCHIVED export in Postman
- [ ] Test plan restriction (FREE plan) in Postman

---

## Next Steps

Once Phase 3 is working:

- Test with larger datasets
- Test with different plan tiers (STARTER, GROWTH, ENTERPRISE)
- Test archive retention enforcement
- Test cold storage marking
- Monitor worker job performance
- Test export limits (try exporting more than plan allows)

---

## Additional Resources

- **Postman Collection:** `postman/HyreLog API.postman_collection.json`
- **Postman Environment:** `postman/HyreLog Local.postman_environment.json`
- **Postman README:** `postman/README.md`
- **API Documentation:** See individual endpoint descriptions in Postman collection

---

## Summary

This guide provides complete Postman-based testing for Phase 3:

✅ **Exports:** HOT, ARCHIVED, and HOT_AND_ARCHIVED exports in JSONL and CSV formats  
✅ **Worker Jobs:** Retention marking, archival, verification, and cold archive marking  
✅ **Plan Enforcement:** Verify FREE plan is rejected, STARTER+ works  
✅ **Auto-Extraction:** Postman automatically saves `export_job_id` for easy workflow

All export operations can be done entirely in Postman - no need for PowerShell scripts or curl commands!
