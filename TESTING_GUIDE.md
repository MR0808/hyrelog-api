# Testing Guide - Phase 2.x

Complete testing guide for HyreLog API with plan tiers, webhooks, and feature gating.

## Understanding Webhooks

**New to webhooks?** Read `WEBHOOKS_EXPLAINED.md` first! It explains:

- What webhooks are and why they're useful
- How the webhook flow works in HyreLog
- Security features (HMAC signatures)
- What you're actually testing

**Quick summary:** Webhooks are automatic notifications. When an event is created in HyreLog, your webhook endpoint gets notified immediately (instead of you having to poll the API).

## Prerequisites

1. **Docker running** with all containers up:

   ```powershell
   npm run docker:up
   ```

2. **Environment variables set** in `.env`:
   - `API_KEY_SECRET` (required)
   - `WEBHOOK_SECRET_ENCRYPTION_KEY` (required for webhooks)
   - All database URLs

3. **Migrations run**:
   ```powershell
   npm run prisma:migrate:all
   npm run prisma:generate
   ```

## Testing Setup

### Step 1: Seed Test Data

**Option A: FREE Plan (no webhooks)**

```powershell
npm run seed
```

**Option B: GROWTH Plan (webhooks enabled)**

```powershell
$env:SEED_PLAN_TIER="GROWTH"
npm run seed
```

**Option C: ENTERPRISE Plan (20 webhooks)**

```powershell
$env:SEED_PLAN_TIER="ENTERPRISE"
npm run seed
```

**Save the output!** You'll need:

- Company ID
- Workspace ID
- Project ID
- Company Key (for management operations)
- Workspace Key (for event ingestion)

### Step 2: Start Services

**Terminal 1 - API Server:**

```powershell
npm run dev
```

**Terminal 2 - Worker (for webhook delivery):**

```powershell
npm run worker
```

**Terminal 3 - Webhook Receiver (for testing webhooks):**

```powershell
node tools/webhook-receiver.js
```

### Step 3: Configure Postman

1. **Import Collection & Environment:**
   - Import `postman/HyreLog API.postman_collection.json`
   - Import `postman/HyreLog Local.postman_environment.json`

2. **Set Environment Variables:**
   - `company_key` - From seed output
   - `workspace_key` - From seed output
   - `company_id` - From seed output
   - `workspace_id` - From seed output
   - `project_id` - From seed output
   - `plan_tier` - From seed output (FREE, STARTER, GROWTH, or ENTERPRISE)

## Testing Scenarios

### Scenario 1: Basic Event Ingestion & Query

**Test Event Ingestion:**

1. Use Postman: `V1 API > Events > Ingest Event`
2. Or curl:
   ```powershell
   $workspaceKey = "your-workspace-key"
   curl -X POST "http://localhost:3000/v1/events" `
     -H "Authorization: Bearer $workspaceKey" `
     -H "Content-Type: application/json" `
     -d '{
       "category": "user",
       "action": "login",
       "actor": {"email": "user@example.com"},
       "metadata": {"ip": "192.168.1.1"}
     }'
   ```

**Test Event Query:**

1. Use Postman: `V1 API > Events > Query Events (Company Key)`
2. Or curl:
   ```powershell
   $companyKey = "your-company-key"
   curl "http://localhost:3000/v1/events?limit=10" `
     -H "Authorization: Bearer $companyKey"
   ```

**Expected Results:**

- ✅ Event created with 201 status
- ✅ Event appears in query results
- ✅ Rate limit headers present
- ✅ Trace ID in response headers

### Scenario 2: Plan Gating - Webhook Creation

**Test with FREE Plan:**

1. Seed with FREE plan (default)
2. Try to create webhook: `V1 API > Webhooks > Create Webhook`
3. **Expected:** 403 error with "Webhooks require a Growth plan or higher"

**Test with GROWTH Plan:**

1. Seed with GROWTH plan:
   ```powershell
   $env:SEED_PLAN_TIER="GROWTH"
   npm run seed
   ```
2. Update Postman environment: `plan_tier = GROWTH`
3. Create webhook: `V1 API > Webhooks > Create Webhook`
4. **Expected:** 201 with webhook object including `secret`
5. **Save the `secret`** - set it in Postman as `webhook_secret`
6. **Save the `id`** - set it in Postman as `webhook_id`

**Test Webhook Limit (GROWTH = 3 max):**

1. Create 3 webhooks (should all succeed)
2. Try to create 4th webhook
3. **Expected:** 403 error with "Webhook limit exceeded"

**Test with ENTERPRISE Plan:**

1. Seed with ENTERPRISE plan:
   ```powershell
   $env:SEED_PLAN_TIER="ENTERPRISE"
   npm run seed
   ```
2. Create up to 20 webhooks (should all succeed)
3. Try to create 21st webhook
4. **Expected:** 403 error with limit exceeded

### Scenario 3: Webhook Delivery Flow

**Prerequisites:**

- Company seeded with GROWTH or ENTERPRISE plan
- Webhook receiver running (`node tools/webhook-receiver.js`)
- Worker running (`npm run worker`)

**Steps:**

1. **Create webhook** pointing to `http://localhost:3001`
   - Use Postman: `V1 API > Webhooks > Create Webhook`
   - Or update the URL in the request body

2. **Ingest an event:**
   - Use Postman: `V1 API > Events > Ingest Event`
   - Or use curl (see Scenario 1)

3. **Watch webhook receiver console:**
   - Should see webhook delivery logged
   - Check signature header
   - Verify payload structure

4. **Check delivery status:**
   - Use Postman: `V1 API > Webhooks > Get Webhook Deliveries`
   - Should show delivery attempt with status SUCCEEDED

**Expected Results:**

- ✅ Webhook delivered within a few seconds
- ✅ Signature header present (`x-hyrelog-signature`)
- ✅ Delivery attempt recorded in database
- ✅ Status shows SUCCEEDED

### Scenario 4: Webhook Retry Behavior

**Test Failed Delivery:**

1. Create webhook pointing to invalid URL (e.g., `http://localhost:9999`)
2. Ingest an event
3. Check delivery attempts: `V1 API > Webhooks > Get Webhook Deliveries`
4. **Expected:** Multiple attempts with increasing delays:
   - Attempt 1: Immediate
   - Attempt 2: +1 minute
   - Attempt 3: +5 minutes
   - Attempt 4: +30 minutes
   - Attempt 5: +6 hours
   - After 5 failures: Status = FAILED

**Test Successful Retry:**

1. Create webhook pointing to invalid URL
2. Ingest an event (will fail)
3. Wait for retry
4. Start webhook receiver on correct port
5. **Expected:** Next retry should succeed

### Scenario 5: Webhook Enable/Disable

1. Create a webhook
2. Disable it: `V1 API > Webhooks > Disable Webhook`
3. Ingest an event
4. **Expected:** No webhook delivery (webhook is disabled)
5. Enable it: `V1 API > Webhooks > Enable Webhook`
6. Ingest another event
7. **Expected:** Webhook delivery succeeds

### Scenario 6: Key Management Security

**Test IP Allowlist Requirement:**

1. Create company key without IP allowlist (via Prisma Studio or direct DB)
2. Try to create workspace key: `V1 API > Keys > Create Workspace Key`
3. **Expected:** 403 error with "IP allowlist required"

**Test with IP Allowlist:**

1. Update company key in database to include your IP in `ipAllowlist`
2. Try to create workspace key again
3. **Expected:** 201 success

**Test Rate Limiting:**

1. Make 10+ key management requests rapidly
2. **Expected:** 429 error after 10 requests/minute

### Scenario 7: Plan Tier Comparison

**Create Multiple Companies:**

1. Seed with FREE plan
2. Test webhook creation → Should fail
3. Seed with STARTER plan
4. Test webhook creation → Should fail (webhooks require Growth+)
5. Seed with GROWTH plan
6. Test webhook creation → Should succeed (up to 3 webhooks)
7. Seed with ENTERPRISE plan
8. Test webhook creation → Should succeed (up to 20 webhooks)

## Quick Test Checklist

- [ ] Event ingestion works (workspace key)
- [ ] Event query works (company key)
- [ ] Event query scoped correctly (workspace key only sees own workspace)
- [ ] Rate limit headers present
- [ ] FREE plan: webhook creation fails
- [ ] GROWTH plan: webhook creation succeeds (up to 3)
- [ ] ENTERPRISE plan: webhook creation succeeds (up to 20)
- [ ] Webhook delivery works (worker + receiver)
- [ ] Webhook signature present in delivery
- [ ] Delivery attempts recorded
- [ ] Webhook retry works (after failures)
- [ ] Webhook enable/disable works
- [ ] IP allowlist enforcement works
- [ ] Key management rate limiting works

## Troubleshooting

### Webhook Not Delivering

1. **Check worker is running:**

   ```powershell
   # Should see polling logs
   npm run worker
   ```

2. **Check webhook receiver is running:**

   ```powershell
   # Should see "listening on http://localhost:3001"
   node tools/webhook-receiver.js
   ```

3. **Check plan tier:**
   - Use Prisma Studio: `npm run prisma:studio`
   - Verify `Company.planTier` is GROWTH or ENTERPRISE

4. **Check webhook status:**
   - Use Postman: `V1 API > Webhooks > List Webhooks`
   - Verify webhook status is ACTIVE

5. **Check delivery attempts:**
   - Use Postman: `V1 API > Webhooks > Get Webhook Deliveries`
   - Look for error messages

### Plan Gating Not Working

1. **Verify Prisma Client regenerated:**

   ```powershell
   npm run prisma:generate
   ```

2. **Check plan tier in database:**
   - Use Prisma Studio
   - Verify `Company.planTier` matches expected value

3. **Check error response:**
   - Should be 403 with `code: "PLAN_RESTRICTED"`
   - Error message should mention required plan

### TypeScript Errors

1. **Regenerate Prisma Client:**

   ```powershell
   npm run prisma:generate
   ```

2. **Run migrations:**

   ```powershell
   npm run prisma:migrate:all
   ```

3. **Restart TypeScript server** in your IDE

## Postman Collection Usage

### Pre-request Scripts (Optional)

You can add pre-request scripts to automatically extract IDs from responses:

**For Create Webhook:**

```javascript
// In "Tests" tab of Create Webhook request
if (pm.response.code === 201) {
  const json = pm.response.json();
  pm.environment.set('webhook_id', json.id);
  pm.environment.set('webhook_secret', json.secret);
  console.log('Webhook ID and secret saved to environment');
}
```

**For Ingest Event:**

```javascript
// In "Tests" tab of Ingest Event request
if (pm.response.code === 201) {
  const json = pm.response.json();
  console.log('Event created:', json.id);
  console.log('Trace ID:', pm.response.headers.get('X-Trace-Id'));
}
```

### Environment Variables

Make sure these are set:

- `base_url` = `http://localhost:3000`
- `company_key` = From seed output
- `workspace_key` = From seed output
- `company_id` = From seed output
- `workspace_id` = From seed output
- `project_id` = From seed output
- `webhook_id` = From create webhook response
- `webhook_secret` = From create webhook response (shown only once!)
- `plan_tier` = From seed output

## Next Steps

After basic testing:

1. Test webhook signature verification
2. Test webhook retry with different failure scenarios
3. Test plan downgrade behavior (features disabled but data preserved)
4. Test rate limiting edge cases
5. Test concurrent webhook deliveries
