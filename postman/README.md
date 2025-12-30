# Postman Collection for HyreLog API

This directory contains Postman collections and environments for testing the HyreLog API.

## Files

- `HyreLog API.postman_collection.json` - Postman collection with all API endpoints (Phase 2.x)
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

## Updating the Collection

As new endpoints are added in future phases, this collection will be updated to include:
- Streaming export endpoints
- Additional filtering options
- Error scenario tests
