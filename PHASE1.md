# Phase 1 - Core API MVP

Phase 1 implementation is complete! This document provides testing instructions and examples.

## Quick Start

### 1. Ensure Environment Variables

Make sure your `.env` file includes:
```bash
API_KEY_SECRET=dev-api-key-secret-change-in-production
```

### 2. Run Migrations

```powershell
npm run prisma:migrate:all
```

### 3. Generate Prisma Client

```powershell
npm run prisma:generate
```

### 4. Seed Test Data

```powershell
npm run seed
```

**Important**: Save the API keys printed by the seed script! They're shown only once:
- Company key (for reading/exporting)
- Workspace key (for ingesting events)

### 5. Start the API

```powershell
npm run dev
```

## Testing with curl

### Ingest an Event (Workspace Key)

```powershell
$workspaceKey = "hlk_ws_..." # From seed output

curl -X POST http://localhost:3000/v1/events `
  -H "Authorization: Bearer $workspaceKey" `
  -H "Content-Type: application/json" `
  -d '{
    "category": "user",
    "action": "login",
    "actor": {
      "email": "user@example.com",
      "role": "admin"
    },
    "resource": {
      "type": "session",
      "id": "sess_123"
    },
    "metadata": {
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0"
    }
  }'
```

### Query Events (Company Key)

```powershell
$companyKey = "hlk_co_..." # From seed output

# Get all events
curl "http://localhost:3000/v1/events?limit=10" `
  -H "Authorization: Bearer $companyKey"

# Filter by category
curl "http://localhost:3000/v1/events?limit=10&category=user" `
  -H "Authorization: Bearer $companyKey"

# Filter by date range
curl "http://localhost:3000/v1/events?limit=10&from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z" `
  -H "Authorization: Bearer $companyKey"
```

### Create Workspace Key

```powershell
$companyKey = "hlk_co_..." # From seed output
$workspaceId = "..." # From seed output

curl -X POST "http://localhost:3000/v1/workspaces/$workspaceId/keys" `
  -H "Authorization: Bearer $companyKey" `
  -H "Content-Type: application/json" `
  -d '{
    "label": "Production Key",
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

### Get Key Status

```powershell
$apiKey = "hlk_ws_..." # Any valid key

curl "http://localhost:3000/v1/keys/status" `
  -H "Authorization: Bearer $apiKey"
```

## Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 1200
X-RateLimit-Remaining: 1199
X-RateLimit-Reset: 2024-12-29T10:31:00.000Z
```

On 429 (rate limited):
```
Retry-After: 60
```

## Error Format

All errors follow the standard format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `UNAUTHORIZED` - Missing or invalid API key
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Request validation failed
- `RATE_LIMITED` - Rate limit exceeded

## Postman Collection

Import the updated Postman collection:
- `postman/HyreLog API.postman_collection.json`
- `postman/HyreLog Local.postman_environment.json`

Set environment variables:
- `company_key` - Company API key from seed
- `workspace_key` - Workspace API key from seed
- `workspace_id` - Workspace ID from seed

## Architecture Notes

### Region Routing
- API keys are stored in the same region as their owning Company
- Authentication searches across all regions (with 5-minute cache)
- Once authenticated, all queries use the company's region database

### Hash Chaining
- Events are chained per (companyId, workspaceId, projectId) partition
- Each event's hash includes the previous event's hash
- Ensures immutability and tamper detection

### Idempotency
- Use `idempotencyKey` in request body
- Same key + same data = returns existing event
- Prevents duplicate events from retries

### Rate Limiting
- In-memory token bucket (per-process)
- Per API key: 1200/min (configurable)
- Per IP: 600/min (configurable)
- Headers on all responses

## Next Steps

Phase 2 will add:
- Webhook delivery
- Streaming exports
- Archival processing
- GDPR anonymization workflow

