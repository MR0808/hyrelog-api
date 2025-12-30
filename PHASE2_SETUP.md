# Phase 2 Setup Instructions

## Prerequisites

1. **Add webhook encryption key to `.env`**:
   ```powershell
   # Generate a 32-byte hex key (64 hex characters)
   # Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Or use: openssl rand -hex 32
   WEBHOOK_SECRET_ENCRYPTION_KEY=371b24a8449ee6031ec996dfe7cb839148d6eaecb1b3f484f45d6d6d13818cbf
   ```
   **Important**: Use a different key in production! The example above is for local development only.

2. **Ensure Docker is running**:
   ```powershell
   npm run docker:up
   ```

## Setup Steps

### 1. Run Migrations

```powershell
npm run prisma:migrate:all
npm run prisma:generate
```

This creates the new webhook tables in all 4 regional databases.

### 2. Seed with GROWTH Plan

To test webhooks, seed with a GROWTH or ENTERPRISE plan:

```powershell
$env:SEED_PLAN_TIER="GROWTH"
npm run seed
```

Or for ENTERPRISE:
```powershell
$env:SEED_PLAN_TIER="ENTERPRISE"
npm run seed
```

**Note**: Default is FREE (webhooks disabled for FREE plan).

### 3. Start Services

**Terminal 1 - API Server**:
```powershell
npm run dev
```

**Terminal 2 - Worker**:
```powershell
npm run worker
```

**Terminal 3 - Webhook Receiver** (for testing):
```powershell
node tools/webhook-receiver.js
```

## Testing Webhook Flow

### 1. Create a Webhook Endpoint

```powershell
$workspaceId = "your-workspace-id-from-seed"
$companyKey = "your-company-key-from-seed"

$body = @{
    url = "http://localhost:3001"
    events = @("AUDIT_EVENT_CREATED")
} | ConvertTo-Json

curl -X POST "http://localhost:3000/v1/workspaces/$workspaceId/webhooks" `
  -H "Authorization: Bearer $companyKey" `
  -H "Content-Type: application/json" `
  -d $body
```

**Save the `secret` from the response** - you'll need it to verify signatures!

### 2. Ingest an Event

```powershell
$workspaceKey = "your-workspace-key-from-seed"

$body = @{
    category = "user"
    action = "login"
    actor = @{
        email = "user@example.com"
    }
} | ConvertTo-Json

curl -X POST "http://localhost:3000/v1/events" `
  -H "Authorization: Bearer $workspaceKey" `
  -H "Content-Type: application/json" `
  -d $body
```

### 3. Watch Webhook Delivery

You should see the webhook delivery logged in the webhook receiver console (Terminal 3).

### 4. Check Delivery Status

```powershell
$webhookId = "webhook-id-from-create-response"
$companyKey = "your-company-key-from-seed"

curl "http://localhost:3000/v1/webhooks/$webhookId/deliveries" `
  -H "Authorization: Bearer $companyKey"
```

## Webhook Signature Verification

The webhook receiver tool can verify signatures if you set the `WEBHOOK_SECRET` environment variable:

```powershell
$env:WEBHOOK_SECRET = "secret-from-webhook-creation-response"
node tools/webhook-receiver.js
```

## Retry Schedule

Webhook deliveries are automatically retried:
- Attempt 1: Immediate
- Attempt 2: +1 minute
- Attempt 3: +5 minutes
- Attempt 4: +30 minutes
- Attempt 5: +6 hours

After 5 failed attempts, the webhook is marked as permanently failed.

## Troubleshooting

### Webhook not being delivered

1. **Check company plan tier**: Webhooks only work for GROWTH and ENTERPRISE plans
   ```powershell
   # Verify in Prisma Studio or check seed output
   npm run prisma:studio
   ```

2. **Check worker is running**: The worker must be running to process webhook jobs
   ```powershell
   npm run worker
   ```

3. **Check webhook status**: Ensure webhook is ACTIVE
   ```powershell
   curl "http://localhost:3000/v1/workspaces/{workspaceId}/webhooks" `
     -H "Authorization: Bearer {companyKey}"
   ```

4. **Check delivery attempts**: View delivery history for errors
   ```powershell
   curl "http://localhost:3000/v1/webhooks/{webhookId}/deliveries" `
     -H "Authorization: Bearer {companyKey}"
   ```

### Worker not processing jobs

1. **Check worker logs**: Look for errors in the worker console
2. **Verify database connection**: Ensure DATABASE_URL_* variables are set correctly
3. **Check nextAttemptAt**: Jobs are only processed when `nextAttemptAt <= now()`

### Signature verification failing

1. **Verify secret**: Ensure you're using the correct secret from webhook creation
2. **Check body format**: Signature is computed on the raw JSON body (not parsed)
3. **Verify timestamp**: The `x-hyrelog-timestamp` header should be within a reasonable window

## Next Steps

- Test webhook delivery with different event types
- Test retry behavior by temporarily stopping the webhook receiver
- Test webhook disable/enable
- Test project-scoped webhooks (set `projectId` when creating webhook)

