# Webhooks Explained - A Beginner's Guide

## What Are Webhooks?

**Webhooks are a way for one application to automatically notify another application when something happens.**

Think of it like this:

- **API calls (polling)**: You keep asking "Did anything happen?" over and over
- **Webhooks**: The system calls you and says "Hey, something happened!" automatically

### Real-World Analogy

Imagine you're waiting for a package delivery:

**Polling (API calls):**

- You check your mailbox every 5 minutes: "Is it here yet? No. Is it here yet? No..."
- Wasteful and inefficient

**Webhooks:**

- The delivery person rings your doorbell when the package arrives
- You get notified immediately, only when something actually happens
- Efficient and real-time

## How Webhooks Work in HyreLog

### The Problem Webhooks Solve

Your application uses HyreLog to store audit events (user logins, data changes, etc.). But you also need to:

- Send notifications to Slack when important events happen
- Update your dashboard in real-time
- Trigger workflows in other systems
- Send emails for security events

**Without webhooks:** You'd have to constantly poll HyreLog's API asking "Any new events?" - inefficient and slow.

**With webhooks:** HyreLog automatically sends you a notification immediately when an event is created - efficient and real-time.

### The Flow

Here's what happens step-by-step:

```
1. Your Application
   └─> Sends event to HyreLog API
       POST /v1/events
       { "category": "user", "action": "login" }

2. HyreLog API
   ├─> Stores the event in database ✅
   ├─> Checks: Does this company have webhooks? ✅
   ├─> Finds matching webhook endpoints
   └─> Creates webhook jobs (one per webhook endpoint)

3. HyreLog Worker (background process)
   ├─> Polls database for webhook jobs
   ├─> Finds a job that's ready to send
   ├─> Signs the payload with HMAC-SHA256
   ├─> Sends HTTP POST to your webhook URL
   │   POST https://your-app.com/webhooks/hyrelog
   │   Headers:
   │     - x-hyrelog-signature: v1=abc123...
   │     - x-hyrelog-timestamp: 1234567890
   │     - x-hyrelog-delivery-id: job-123
   │   Body: { event data }
   │
   └─> Records delivery attempt (success or failure)

4. Your Application (webhook receiver)
   ├─> Receives the webhook POST request
   ├─> Verifies the signature (security check)
   ├─> Processes the event data
   └─> Returns 200 OK to HyreLog

5. HyreLog Worker
   └─> Sees 200 OK response
       └─> Marks delivery as SUCCEEDED ✅
```

### Example Scenario

**Scenario:** User logs into your application

1. **Your app** sends login event to HyreLog:

   ```json
   POST /v1/events
   {
     "category": "user",
     "action": "login",
     "actor": { "email": "user@example.com" }
   }
   ```

2. **HyreLog** stores the event and creates a webhook job

3. **HyreLog Worker** sends webhook to your endpoint:

   ```json
   POST https://your-app.com/webhooks/hyrelog
   {
     "id": "event-123",
     "timestamp": "2024-01-15T10:30:00Z",
     "category": "user",
     "action": "login",
     "actor": { "email": "user@example.com" },
     "hash": "abc123...",
     ...
   }
   ```

4. **Your app** receives the webhook and:
   - Verifies the signature (ensures it's really from HyreLog)
   - Updates your dashboard
   - Sends a Slack notification
   - Triggers any other workflows

## Key Concepts

### 1. Webhook Endpoints

A **webhook endpoint** is a URL you register with HyreLog. It's where HyreLog will send notifications.

**Example:**

- URL: `https://your-app.com/webhooks/hyrelog`
- Events: `AUDIT_EVENT_CREATED`
- Scope: Workspace-wide or project-specific

### 2. Webhook Jobs

When an event is created, HyreLog creates a **webhook job** for each matching webhook endpoint. The worker processes these jobs.

**Job states:**

- `PENDING` - Waiting to be processed
- `SENDING` - Currently being delivered
- `SUCCEEDED` - Delivery successful
- `FAILED` - Delivery failed after all retries
- `RETRY_SCHEDULED` - Failed, will retry later

### 3. Retry Logic

If your webhook endpoint is down or returns an error, HyreLog automatically retries:

- **Attempt 1:** Immediate
- **Attempt 2:** +1 minute later
- **Attempt 3:** +5 minutes later
- **Attempt 4:** +30 minutes later
- **Attempt 5:** +6 hours later

After 5 failed attempts, the job is marked as permanently failed.

### 4. Security: HMAC Signatures

Every webhook payload is **signed** with a secret key. This ensures:

- The webhook is really from HyreLog (not a fake)
- The data hasn't been tampered with
- You can verify authenticity

**How it works:**

1. HyreLog creates a secret when you register a webhook
2. When sending a webhook, HyreLog calculates: `HMAC-SHA256(secret, payload)`
3. Includes signature in header: `x-hyrelog-signature: v1=abc123...`
4. Your app verifies: `HMAC-SHA256(your-secret, received-payload)` should match

### 5. Plan Gating

Webhooks are a **premium feature**:

- **FREE plan:** Webhooks disabled
- **STARTER plan:** Webhooks disabled
- **GROWTH plan:** Up to 3 webhooks
- **ENTERPRISE plan:** Up to 20 webhooks

This is why you need to seed with `SEED_PLAN_TIER=GROWTH` to test webhooks.

## What You're Testing

When you test webhooks, you're verifying:

### 1. Webhook Registration

- ✅ Can you create a webhook endpoint?
- ✅ Does it require Growth+ plan?
- ✅ Is the webhook limit enforced?

### 2. Event Ingestion → Webhook Trigger

- ✅ When you ingest an event, does it create a webhook job?
- ✅ Does it only trigger for Growth+ plans?

### 3. Webhook Delivery

- ✅ Does the worker send the webhook to your URL?
- ✅ Is the payload correct?
- ✅ Are the security headers present (signature, timestamp)?

### 4. Retry Logic

- ✅ If your endpoint is down, does it retry?
- ✅ Are retries scheduled correctly?
- ✅ Does it stop after 5 attempts?

### 5. Delivery Tracking

- ✅ Can you see delivery attempts in the API?
- ✅ Are success/failure states recorded correctly?

## Testing Setup

### Your Test Environment

```
┌─────────────────┐
│  Your App       │  (The thing that receives webhooks)
│  localhost:3001 │
└────────┬────────┘
         │
         │ HTTP POST (webhook delivery)
         │
         ▼
┌─────────────────┐
│  HyreLog Worker │  (Sends webhooks)
│  npm run worker │
└────────┬────────┘
         │
         │ Reads webhook jobs
         │
         ▼
┌─────────────────┐
│  Database       │  (Stores webhook jobs)
│  Postgres       │
└─────────────────┘
         ▲
         │
         │ Creates webhook jobs
         │
┌────────┴────────┐
│  HyreLog API   │  (Receives events, creates jobs)
│  npm run dev   │
└─────────────────┘
         ▲
         │
         │ POST /v1/events
         │
┌────────┴────────┐
│  Postman/Your   │  (Sends events)
│  Application    │
└─────────────────┘
```

### The Test Flow

1. **Start webhook receiver:**

   ```powershell
   node tools/webhook-receiver.js
   ```

   This listens on `http://localhost:3001` and logs all incoming webhooks.

2. **Create a webhook:**
   - Use Postman: `V1 API > Webhooks > Create Webhook`
   - URL: `http://localhost:3001`
   - **Save the `secret`** from the response!

3. **Ingest an event:**
   - Use Postman: `V1 API > Events > Ingest Event`
   - This creates the event AND triggers webhook job creation

4. **Watch the magic:**
   - Worker picks up the job (within 5 seconds)
   - Sends webhook to your receiver
   - Receiver logs the payload
   - Check delivery status in Postman

## Why Webhooks Matter

### Benefits

1. **Real-time:** Get notified immediately, not after polling delay
2. **Efficient:** No wasted API calls checking for nothing
3. **Scalable:** Works even with high event volumes
4. **Reliable:** Automatic retries handle temporary failures
5. **Secure:** HMAC signatures prevent tampering

### Use Cases

- **Real-time dashboards:** Update UI immediately when events happen
- **Notifications:** Send Slack/email alerts for important events
- **Integration:** Trigger workflows in other systems (Zapier, etc.)
- **Analytics:** Stream events to your analytics platform
- **Compliance:** Forward events to compliance monitoring systems

## Security Considerations

### What Makes It Secure?

1. **HMAC Signatures:**
   - Every payload is signed
   - You verify signatures before processing
   - Prevents fake webhooks

2. **HTTPS Required (Production):**
   - Webhooks must use HTTPS in production
   - Data encrypted in transit
   - Only `http://localhost` allowed in development

3. **Secret Management:**
   - Each webhook has a unique secret
   - Secret is encrypted in the database
   - Shown only once when created

4. **Plan Gating:**
   - Only Growth+ plans can use webhooks
   - Prevents abuse on free tier

### What You Should Do

1. **Always verify signatures:**

   ```javascript
   const signature = req.headers['x-hyrelog-signature'];
   const secret = process.env.WEBHOOK_SECRET;
   // Verify signature matches
   ```

2. **Check timestamps:**
   - `x-hyrelog-timestamp` prevents replay attacks
   - Reject webhooks older than 5 minutes

3. **Use HTTPS in production:**
   - Never use HTTP for webhooks in production
   - Only `http://localhost` is allowed in dev

## Common Questions

### Q: What if my webhook endpoint is down?

A: HyreLog will retry automatically with exponential backoff. After 5 failed attempts, the job is marked as failed. You can check delivery attempts to see what happened.

### Q: Can I have multiple webhooks for the same event?

A: Yes! Each webhook endpoint is independent. If you create 3 webhooks, an event will trigger all 3.

### Q: What if I lose the webhook secret?

A: You can't retrieve it (it's encrypted). You'll need to create a new webhook endpoint.

### Q: How fast are webhooks delivered?

A: Usually within a few seconds. The worker polls every 5 seconds, so worst case is ~5 seconds delay.

### Q: Can I filter which events trigger webhooks?

A: Currently, all events trigger webhooks if you subscribe to `AUDIT_EVENT_CREATED`. Future versions may support filtering by category/action.

## Summary

**Webhooks = Automatic notifications when events happen**

- Your app sends events → HyreLog stores them
- HyreLog automatically notifies your webhook endpoint
- Your app receives the notification and does something with it
- HyreLog retries if delivery fails
- Everything is signed and secure

**You're testing:** That this entire flow works correctly, securely, and reliably.
