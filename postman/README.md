# Postman Collection for HyreLog API

This directory contains Postman collections and environments for testing the HyreLog API.

## Files

- `HyreLog API.postman_collection.json` - Postman collection with all API endpoints (Phase 3)
- `HyreLog Local.postman_environment.json` - Local development environment variables
- `ENVIRONMENT_SETUP.md` - Detailed guide on where to get each environment variable value

## Setup Instructions

### 1. Import into Postman

1. Open Postman
2. Click **Import** button (top left)
3. Select both JSON files:
   - `HyreLog API.postman_collection.json`
   - `HyreLog Local.postman_environment.json`
4. Select the **HyreLog Local** environment from the environment dropdown (top right)

### 2. Seed Test Data

Run the seed script to create test data:

```powershell
npm run seed
```

The script will output:
- Company ID
- Workspace ID
- Project ID
- Company API key (plaintext - save this!)
- Workspace API key (plaintext - save this!)

### 3. Configure Environment Variables

In Postman, edit the **HyreLog Local** environment and set:

#### Required (from seed output):
- `company_key` - Company API key from seed output (for reading/exporting)
- `workspace_key` - Workspace API key from seed output (for ingesting events)
- `company_id` - Company ID from seed output
- `workspace_id` - Workspace ID from seed output
- `project_id` - Project ID from seed output
- `plan_tier` - Plan tier from seed output (FREE, STARTER, GROWTH, or ENTERPRISE)

#### Optional (set these as you use the API):

**`key_id`** - API Key ID (for rotate operations):
- Get it from: `V1 API > Keys > Get Key Status` response (the `id` field)
- Or from: `V1 API > Keys > Create Workspace Key` response (the `id` field)
- Use for: Rotating keys

**`webhook_id`** - Webhook ID (for webhook operations):
- Get it from: `V1 API > Webhooks > Create Webhook` response (the `id` field)
- Or from: `V1 API > Webhooks > List Webhooks` response (the `id` field from any webhook)
- Use for: Enable/disable webhooks, viewing deliveries

**`webhook_secret`** - Webhook Secret (for signature verification):
- ⚠️ **IMPORTANT:** Only available in the `Create Webhook` response - shown only once!
- Get it from: `V1 API > Webhooks > Create Webhook` response (the `secret` field)
- **Save it immediately** - you won't be able to retrieve it again
- Use for: Verifying webhook signatures in your webhook receiver

**`export_job_id`** - Export Job ID (for export operations):
- ⚠️ **AUTO-EXTRACTED:** Automatically saved from "Create Export" responses via Postman Tests
- Get it from: `V1 API > Exports > Create Export` response (the `jobId` field)
- Or manually: Copy from any "Create Export" response
- Use for: Checking export status and downloading exports

**Note:** The seed script clears all existing data and creates fresh test data each time you run it.

## Available Endpoints

### Root
- `GET /` - Root endpoint (no auth required)

### Internal (requires `x-internal-token` header)
- `GET /internal/health` - Health check endpoint
- `GET /internal/metrics` - Metrics endpoint

### V1 API (requires API key in Authorization header)

#### Events
- `POST /v1/events` - Ingest an audit event (workspace key only)
- `GET /v1/events` - Query events with filters (company or workspace key)

#### Keys
- `POST /v1/workspaces/:workspaceId/keys` - Create workspace key (company key only, IP allowlist required)
- `GET /v1/keys/status` - Get key status (any key)
- `POST /v1/keys/:keyId/rotate` - Rotate key (company key only, IP allowlist required)

#### Webhooks (Growth+ plans only)
- `POST /v1/workspaces/:workspaceId/webhooks` - Create webhook (company key, IP allowlist, Growth+ plan)
- `GET /v1/workspaces/:workspaceId/webhooks` - List webhooks
- `POST /v1/webhooks/:webhookId/disable` - Disable webhook
- `POST /v1/webhooks/:webhookId/enable` - Enable webhook
- `GET /v1/webhooks/:webhookId/deliveries` - Get delivery attempts

#### Exports (Starter+ plans only)
- `POST /v1/exports` - Create export job (HOT, ARCHIVED, or HOT_AND_ARCHIVED)
- `GET /v1/exports/:jobId` - Get export job status
- `GET /v1/exports/:jobId/download` - Stream and download export data

## Testing Workflow

1. **Start the API:**
   ```powershell
   npm run dev
   ```

2. **Seed test data:**
   ```powershell
   npm run seed
   ```

3. **Update Postman environment** with the keys and IDs from seed output

4. **Test in Postman:**
   - Start with "Ingest Event" using workspace key
   - Then "Query Events" using company key
   - Check rate limit headers in response
   - Try key management endpoints

## Rate Limit Headers

All responses include:
- `X-RateLimit-Limit` - Maximum requests per minute
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - ISO timestamp when limit resets

On 429 (rate limited):
- `Retry-After` - Seconds to wait before retrying

## Error Format

All errors follow:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`

## Getting Environment Variable Values

See `ENVIRONMENT_SETUP.md` for detailed instructions on where to get:
- `key_id` - From Get Key Status or Create Key response
- `webhook_id` - From Create Webhook or List Webhooks response
- `webhook_secret` - From Create Webhook response (⚠️ shown only once!)

## Phase 3 Updates

**New Export Endpoints:**
- Create Export (HOT - JSONL) - Stream current data in JSONL format
- Create Export (HOT - CSV) - Stream current data in CSV format
- Create Export (ARCHIVED) - Stream archived data (requires from/to dates)
- Create Export (HOT_AND_ARCHIVED) - Stream both current and archived data
- Get Export Status - Check export job status and progress
- Download Export - Stream and download export file

**Auto-Extraction:**
- `export_job_id` is automatically extracted from "Create Export" responses
- No manual copying needed - just use `{{export_job_id}}` in subsequent requests

**Plan Requirements:**
- Exports require STARTER+ plan
- FREE plan will return `PLAN_RESTRICTED` error
- Export limits enforced: FREE=10K, STARTER=250K, GROWTH=1M, ENTERPRISE=unlimited

**Testing Exports:**
1. Ensure STARTER+ plan: `$env:SEED_PLAN_TIER="STARTER"; npm run seed`
2. Create export: Use any "Create Export" request
3. Check status: "Get Export Status" (uses auto-extracted `export_job_id`)
4. Download: "Download Export" → Use "Send and Download" to save file

## Updating the Collection

The collection is updated with each phase:
- ✅ Phase 1: Events, Keys
- ✅ Phase 2: Webhooks
- ✅ Phase 3: Exports
