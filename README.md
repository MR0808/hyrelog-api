# HyreLog API

HyreLog is a developer-first immutable audit log API for pre-compliance B2B SaaS (10–200 employees) selling into enterprise/fintech/regulatory buyers.

**Phase 0 Status**: Foundation complete - API scaffold, worker scaffold, Prisma schema, and CDK infrastructure ready.

## Prerequisites

Before you begin, make sure you have the following installed:

1. **Node.js 20+** - [Download here](https://nodejs.org/)
   - Verify installation: `node --version` (should show v20.x.x or higher)
   - Verify npm: `npm --version` (should show 10.x.x or higher)

2. **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
   - Verify installation: `docker --version`
   - Verify Docker Compose: `docker compose version`

3. **Git** (optional, for version control)

## Quick Start (Local Development)

Follow these steps to get the HyreLog API running locally:

### Step 1: Start Local Infrastructure

Open a terminal in the repository root and run:

```bash
docker compose up -d
```

This starts:
- 4 Postgres databases (one per region: US, EU, UK, AU)
- MinIO (S3-compatible storage for local development)

**Verify containers are running:**
```bash
docker ps
```

You should see 5 containers:
- `hyrelog-postgres-us` (port 54321)
- `hyrelog-postgres-eu` (port 54322)
- `hyrelog-postgres-uk` (port 54323)
- `hyrelog-postgres-au` (port 54324)
- `hyrelog-minio` (ports 9000, 9001)

### Step 2: Set Up Environment Variables

Copy the example environment file:

```bash
# On Windows (PowerShell)
Copy-Item .env.example .env

# On macOS/Linux
cp .env.example .env
```

**Important**: The `.env` file is already configured for local development with the Docker Compose setup. You can modify it if needed, but the defaults should work.

### Step 3: Install Dependencies

Install all dependencies for the workspace:

```bash
npm install
```

This installs dependencies for:
- Root workspace
- `services/api`
- `services/worker`
- `infra`

### Step 4: Set Up Databases (Run Migrations)

The Prisma schema needs to be applied to each of the 4 Postgres databases. We'll run migrations for each region.

**Option A: Use the migration script (recommended - PowerShell)**

Run migrations for all regions at once:

```powershell
npm run prisma:migrate:all
```

This script will:
- Run migrations against all 4 Postgres databases (US, EU, UK, AU)
- Create the initial migration if it doesn't exist
- Apply migrations to each database

**Option B: Run migrations manually (one at a time)**

If you prefer to run migrations manually:

```powershell
# US Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54321/hyrelog_us"
npm run prisma:migrate --workspace=services/api

# EU Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54322/hyrelog_eu"
npm run prisma:migrate --workspace=services/api

# UK Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54323/hyrelog_uk"
npm run prisma:migrate --workspace=services/api

# AU Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54324/hyrelog_au"
npm run prisma:migrate --workspace=services/api
```

**Note**: The first time you run `prisma migrate`, it will create the initial migration. You'll be prompted to name it (e.g., "init").

### Step 5: Generate Prisma Client

Generate the Prisma Client (required before running the API):

```bash
npm run prisma:generate
```

### Step 6: Start the API Server

Start the development server:

```bash
npm run dev
```

You should see output like:
```
[INFO] HyreLog API server started
[INFO] Server listening on http://0.0.0.0:3000
```

### Step 7: Test the API

Open a new terminal and test the health endpoint:

```bash
# Test root endpoint
curl http://localhost:3000/

# Test internal health endpoint (requires internal token)
curl -H "x-internal-token: dev-internal-token-change-in-production" http://localhost:3000/internal/health

# Test internal metrics endpoint
curl -H "x-internal-token: dev-internal-token-change-in-production" http://localhost:3000/internal/metrics
```

**Expected responses:**

- Root (`/`): `{"service":"hyrelog-api","version":"0.1.0","status":"running"}`
- Health (`/internal/health`): `{"status":"ok","uptime":123,"timestamp":"2024-01-01T00:00:00.000Z","service":"hyrelog-api"}`
- Metrics (`/internal/metrics`): JSON with placeholder metrics

## MinIO Console (S3 Local Development)

MinIO provides an S3-compatible interface for local development. Access the MinIO Console:

1. Open your browser: http://localhost:9001
2. Login credentials:
   - **Username**: `minioadmin`
   - **Password**: `minioadmin`

### Create Buckets (Optional)

In the MinIO Console, you can create buckets for each region:
- `hyrelog-archive-us`
- `hyrelog-archive-eu`
- `hyrelog-archive-uk`
- `hyrelog-archive-au`

These match the bucket names in your `.env` file. The API will create them automatically when needed (in Phase 1).

## Project Structure

```
hyrelog-api/
├── services/
│   ├── api/              # Fastify API service
│   │   ├── src/
│   │   │   ├── lib/      # Config, logger, trace utilities
│   │   │   ├── plugins/  # Fastify plugins (auth, error handling)
│   │   │   ├── routes/   # API routes (internal only in Phase 0)
│   │   │   └── server.ts # Server bootstrap
│   │   └── prisma/       # Prisma schema and migrations
│   └── worker/           # Background worker service
│       └── src/
│           └── jobs/     # Placeholder job definitions
├── infra/                # AWS CDK infrastructure
│   ├── bin/              # CDK app entry point
│   └── lib/              # CDK stack definitions
├── docker-compose.yml    # Local infrastructure
├── package.json          # Root workspace config
└── README.md             # This file
```

## Available Scripts

### Root Workspace

- `npm run dev` - Start API server in development mode
- `npm run typecheck` - Type-check all packages
- `npm run lint` - Lint all packages
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers
- `npm run docker:logs` - View Docker container logs
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run Prisma migrations (for default DB)
- `npm run prisma:migrate:all` - Run Prisma migrations for all regions (PowerShell script)
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

### API Service (`services/api`)

- `npm run dev --workspace=services/api` - Start API with hot reload
- `npm run build --workspace=services/api` - Build for production
- `npm run start --workspace=services/api` - Start production server
- `npm run prisma:studio --workspace=services/api` - Open Prisma Studio

### Worker Service (`services/worker`)

- `npm run dev --workspace=services/worker` - Start worker (placeholder)
- `npm run build --workspace=services/worker` - Build worker

### Infrastructure (`infra`)

- `npm run cdk --workspace=infra -- synth` - Synthesize CDK stack
- `npm run cdk --workspace=infra -- deploy --context region=us-east-1` - Deploy to AWS

## Database Management

### Prisma Studio

View and edit your database through Prisma Studio:

**For US Region (default):**
```powershell
npm run prisma:studio:us
```

**For other regions, set DATABASE_URL manually:**
```powershell
# EU Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54322/hyrelog_eu"
npm run prisma:studio --workspace=services/api

# UK Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54323/hyrelog_uk"
npm run prisma:studio --workspace=services/api

# AU Region
$env:DATABASE_URL="postgresql://hyrelog:hyrelog@localhost:54324/hyrelog_au"
npm run prisma:studio --workspace=services/api
```

This opens a web interface at http://localhost:5555 where you can browse and edit data.

**Note:** Prisma Studio connects to one database at a time. Use the appropriate command for the region you want to view.

### Connect to Databases Directly

You can connect to any of the 4 Postgres databases using a PostgreSQL client:

- **US**: `postgresql://hyrelog:hyrelog@localhost:54321/hyrelog_us`
- **EU**: `postgresql://hyrelog:hyrelog@localhost:54322/hyrelog_eu`
- **UK**: `postgresql://hyrelog:hyrelog@localhost:54323/hyrelog_uk`
- **AU**: `postgresql://hyrelog:hyrelog@localhost:54324/hyrelog_au`

## AWS Deployment (CDK)

**Note**: AWS deployment is for Phase 1+. This section is for reference.

### Prerequisites

1. AWS CLI installed and configured
2. AWS CDK CLI: `npm install -g aws-cdk`
3. Bootstrap CDK (first time only): `cdk bootstrap`

### Deploy to a Region

Deploy the infrastructure to a specific AWS region:

```bash
cd infra
npm install
npm run cdk -- deploy --context region=us-east-1
```

**Supported regions:**
- US: `--context region=us-east-1`
- EU: `--context region=eu-west-1`
- UK: `--context region=eu-west-2`
- AU: `--context region=ap-southeast-2`

**Example: Deploy to EU region**
```bash
npm run cdk -- deploy --context region=eu-west-1
```

The stack will be named `HyrelogStack-EU` and all resources will be tagged with the region.

### View Stack Outputs

After deployment, CDK will output:
- VPC ID
- ECS Cluster name
- ECR Repository URIs
- RDS Database endpoint
- S3 Bucket name
- CloudWatch Log Group names

Save these values - you'll need them to configure your ECS services.

## Plans & Limits

HyreLog offers 4 plan tiers with different feature sets and limits:

### Plan Tiers

- **FREE**: Basic audit logging (7 days retention, 10K export rows)
- **STARTER**: Streaming exports enabled (30 days retention, 250K export rows)
- **GROWTH**: Webhooks + exports (90 days retention, 1M export rows, 3 webhooks)
- **ENTERPRISE**: Full features (180 days retention, unlimited exports, 20 webhooks)

### Feature Gating

- **Webhooks**: Growth+ plans only
- **Streaming Exports**: Starter+ plans only
- **Custom Categories**: Starter+ plans only

### Important Notes

- **Retention enforcement**: Coming in Phase 3 (currently not enforced)
- **Stripe billing integration**: Coming in a future phase (schema is ready)
- **Plan downgrades**: Features are disabled but data is not deleted
- **Plan enforcement**: All checks are server-side and cannot be bypassed

See `SECURITY.md` for details on plan enforcement and security.

## Phase 2 - Webhooks

Phase 2 adds signed webhook delivery for near-real-time event notifications.

### Features

- **Webhook Endpoints**: Register webhook URLs at workspace or project scope
- **Signed Payloads**: HMAC-SHA256 signatures for security
- **Retry Backoff**: Automatic retries with exponential backoff (5 attempts)
- **Delivery Tracking**: Full audit trail of all delivery attempts
- **Plan Gating**: Webhooks available for GROWTH and ENTERPRISE plans only

### Setup

1. **Add webhook encryption key to `.env`**:
   ```bash
   # Generate a 32-byte hex key (64 hex characters)
   # You can use: openssl rand -hex 32
   WEBHOOK_SECRET_ENCRYPTION_KEY=your_64_character_hex_key_here
   ```

2. **Run migrations**:
   ```bash
   npm run prisma:migrate:all
   npm run prisma:generate
   ```

3. **Seed with GROWTH plan** (to test webhooks):
   ```bash
   $env:SEED_PLAN_TIER="GROWTH"
   npm run seed
   ```

### Testing Webhooks Locally

1. **Start webhook receiver** (in a separate terminal):
   ```bash
   node tools/webhook-receiver.js
   ```
   This starts a server on `http://localhost:3001` that logs all webhook deliveries.

2. **Start the worker** (in another terminal):
   ```bash
   npm run worker
   ```
   The worker polls for webhook jobs and processes deliveries.

3. **Create a webhook endpoint**:
   ```bash
   curl -X POST "http://localhost:3000/v1/workspaces/{workspace_id}/webhooks" \
     -H "Authorization: Bearer {company_key}" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "http://localhost:3001",
       "events": ["AUDIT_EVENT_CREATED"]
     }'
   ```
   
   **Note**: The response includes a `secret` field - save this! You'll need it to verify signatures.

4. **Ingest an event**:
   ```bash
   curl -X POST "http://localhost:3000/v1/events" \
     -H "Authorization: Bearer {workspace_key}" \
     -H "Content-Type: application/json" \
     -d '{
       "category": "user",
       "action": "login",
       "actor": {"email": "user@example.com"}
     }'
   ```

5. **Watch the webhook receiver console** - you should see the webhook delivery logged.

6. **Check delivery status**:
   ```bash
   curl "http://localhost:3000/v1/webhooks/{webhook_id}/deliveries" \
     -H "Authorization: Bearer {company_key}"
   ```

### Webhook Signature Verification

Webhooks are signed with HMAC-SHA256. To verify:

```javascript
const crypto = require('crypto');

const signature = req.headers['x-hyrelog-signature']; // Format: "v1=<hex>"
const timestamp = req.headers['x-hyrelog-timestamp'];
const body = req.body; // Raw JSON string

const providedSig = signature.replace(/^v1=/, '');
const computedSig = crypto
  .createHmac('sha256', webhookSecret)
  .update(body)
  .digest('hex');

if (providedSig === computedSig) {
  // Signature is valid
}
```

### Retry Schedule

Webhook deliveries are retried up to 5 times:
- Attempt 1: Immediate
- Attempt 2: +1 minute
- Attempt 3: +5 minutes
- Attempt 4: +30 minutes
- Attempt 5: +6 hours

After 5 failed attempts, the webhook is marked as permanently failed.

### API Endpoints

- `POST /v1/workspaces/:workspaceId/webhooks` - Create webhook endpoint
- `GET /v1/workspaces/:workspaceId/webhooks` - List webhooks
- `POST /v1/webhooks/:webhookId/disable` - Disable webhook
- `POST /v1/webhooks/:webhookId/enable` - Enable webhook
- `GET /v1/webhooks/:webhookId/deliveries` - Get delivery attempts

All webhook management endpoints require:
- Company key authentication
- IP allowlist on the company key
- Rate limiting (10 operations/minute)

## Troubleshooting

### Port Already in Use

If you see "port already in use" errors:

1. Check what's using the port: `netstat -ano | findstr :3000` (Windows) or `lsof -i :3000` (macOS/Linux)
2. Stop the conflicting service or change the port in `.env`

### Database Connection Errors

1. Verify Docker containers are running: `docker ps`
2. Check database logs: `docker logs hyrelog-postgres-us`
3. Verify connection string in `.env` matches Docker Compose ports

### Prisma Migration Errors

1. Make sure you're running migrations against the correct database URL
2. Check that the database exists: `docker exec -it hyrelog-postgres-us psql -U hyrelog -d hyrelog_us -c "\dt"`
3. If migrations are stuck, you may need to reset: `prisma migrate reset` (⚠️ deletes all data)

### MinIO Connection Issues

1. Verify MinIO is running: `docker logs hyrelog-minio`
2. Check the console at http://localhost:9001
3. Verify S3 credentials in `.env` match MinIO defaults

## Phase 0 Deliverables Checklist

✅ **Root workspace files**
- [x] Root `package.json` with npm workspaces
- [x] `.env.example` with all required variables
- [x] TypeScript and Prettier configs

✅ **API service scaffold**
- [x] Fastify server with TypeScript
- [x] Config loader with Zod validation
- [x] Structured logging (Pino)
- [x] Trace ID propagation
- [x] Error handler with standard format
- [x] Internal auth plugin
- [x] Internal routes (`/internal/health`, `/internal/metrics`)

✅ **Prisma schema**
- [x] All required models (Company, Workspace, Project, AuditEvent, ApiKey, etc.)
- [x] All required enums (Region, ApiKeyScope, GdprRequestStatus, etc.)
- [x] Multi-region support
- [x] Archival schema (ArchiveObject)
- [x] GDPR schema (GdprRequest, GdprApproval)

✅ **Worker service scaffold**
- [x] Worker runner placeholder
- [x] Archival job placeholder
- [x] GDPR worker placeholder
- [x] Webhook worker placeholder

✅ **CDK infrastructure**
- [x] Multi-region deployable stack
- [x] VPC, ECS Cluster, ECR repos
- [x] RDS Postgres (encrypted, backups)
- [x] S3 bucket with lifecycle rules
- [x] CloudWatch log groups

✅ **Documentation**
- [x] Comprehensive README with beginner-friendly steps
- [x] Setup instructions
- [x] Troubleshooting guide

## Phase 1 - Core API MVP

Phase 1 is now complete! The API includes:

### Security Measures

**Key Management Security:**
- **Company key creation**: Dashboard-only (not available via API)
- **Key revocation**: Dashboard-only (requires confirmation dialogs)
- **Workspace key creation**: API-accessible but requires:
  - Company key with IP allowlist configured
  - Stricter rate limiting (10 operations/minute)
  - Comprehensive audit logging
- **Key rotation**: API-accessible but requires:
  - Company key with IP allowlist configured
  - Stricter rate limiting (10 operations/minute)
  - Comprehensive audit logging

**Why these restrictions?**
- Company keys are high-privilege and should require dashboard authentication + 2FA
- Key revocation is destructive and needs proper confirmation
- Workspace key creation/rotation can be automated but needs IP restrictions
- All key management operations are logged for audit compliance

The API includes:

✅ **API Key Authentication**
- Workspace keys (ingest + read within workspace)
- Company keys (read/export across all workspaces; cannot ingest)
- HMAC-SHA256 key hashing
- Cross-region key lookup with caching

✅ **Event Ingestion** (`POST /v1/events`)
- Append-only events with hash chaining
- Idempotency support
- Request context capture (traceId, IP, userAgent)
- Workspace key authentication required

✅ **Event Query** (`GET /v1/events`)
- Filtering by category, action, project, workspace, date range
- Cursor-based pagination
- Scoped access (company vs workspace)

✅ **Key Management**
- Create workspace keys (`POST /v1/workspaces/:workspaceId/keys`) - Requires company key with IP allowlist
- Rotate keys (`POST /v1/keys/:keyId/rotate`) - Requires company key with IP allowlist
- Key status (`GET /v1/keys/status`) - Read-only, less restrictive
- **Revoke keys**: Dashboard-only (removed from API for security)
- **Create company keys**: Dashboard-only (not available via API)

✅ **Rate Limiting**
- Per API key: 1200 requests/min (configurable)
- Per IP: 600 requests/min (configurable)
- Headers on all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 responses with `Retry-After` header

✅ **Multi-Region Support**
- Region-aware request routing
- Company dataRegion determines database
- Cross-region API key lookup

### Phase 1 Setup

1. **Add API_KEY_SECRET to .env:**
   ```powershell
   # Add to your .env file:
   API_KEY_SECRET=dev-api-key-secret-change-in-production
   ```

2. **Run migrations (if not already done):**
   ```powershell
   npm run prisma:migrate:all
   ```

3. **Generate Prisma Client:**
   ```powershell
   npm run prisma:generate
   ```

4. **Seed test data:**
   ```powershell
   npm run seed
   ```
   
   This creates:
   - A Company (Acme Corp)
   - A Workspace (Production)
   - A Project (Main App)
   - A Company API key (for reading/exporting)
   - A Workspace API key (for ingesting events)
   
   **Important**: The seed script prints plaintext API keys to the console. Save these - they're shown only once!

5. **Start the API:**
   ```powershell
   npm run dev
   ```

### Phase 1 API Examples

**Ingest an event (workspace key):**
```powershell
$workspaceKey = "hlk_ws_..." # From seed output

curl -X POST http://localhost:3000/v1/events `
  -H "Authorization: Bearer $workspaceKey" `
  -H "Content-Type: application/json" `
  -d '{
    "category": "user",
    "action": "login",
    "actor": {
      "email": "user@example.com"
    },
    "metadata": {
      "ip": "192.168.1.1"
    }
  }'
```

**Query events (company key):**
```powershell
$companyKey = "hlk_co_..." # From seed output

curl "http://localhost:3000/v1/events?limit=10&category=user" `
  -H "Authorization: Bearer $companyKey"
```

**Check rate limit headers:**
All responses include:
- `X-RateLimit-Limit`: Maximum requests per minute
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: ISO timestamp when limit resets

### Phase 1 Postman Collection

Import the Postman collection from `postman/` directory:
- `HyreLog API.postman_collection.json` - Updated with Phase 1 endpoints
- `HyreLog Local.postman_environment.json` - Environment variables

## Next Steps (Phase 2+)

Future phases will implement:
- Real archival processing
- GDPR anonymization workflow
- Webhook delivery system
- Streaming exports
- ECS Fargate service definitions
- CI/CD pipelines

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the code comments (especially in placeholder jobs)
3. Check Prisma and Fastify documentation

---

**Happy coding! 🚀**

