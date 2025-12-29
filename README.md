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

```bash
npm run prisma:studio
```

This opens a web interface at http://localhost:5555 where you can browse and edit data.

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

## Next Steps (Phase 1)

Phase 1 will implement:
- Business endpoints (`/v1/events`, etc.)
- API key authentication
- Rate limiting
- Real archival processing
- GDPR anonymization workflow
- Webhook delivery system
- ECS Fargate service definitions
- CI/CD pipelines

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the code comments (especially in placeholder jobs)
3. Check Prisma and Fastify documentation

---

**Happy coding! 🚀**

