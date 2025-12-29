# HyreLog API - Phase 0 Setup Guide

This guide provides step-by-step instructions to get the HyreLog API running locally for the first time.

## Prerequisites Check

Run the verification script to check your setup:

```powershell
npm run verify
```

This will verify:
- Node.js 20+ is installed
- npm is installed
- Docker Desktop is installed and running
- Docker containers are running
- .env file exists
- Dependencies are installed

## Complete Setup Steps

### 1. Start Docker Containers

```powershell
npm run docker:up
```

Wait for all containers to be healthy (about 30 seconds). Verify with:

```powershell
docker ps
```

You should see 5 containers running:
- `hyrelog-postgres-us`
- `hyrelog-postgres-eu`
- `hyrelog-postgres-uk`
- `hyrelog-postgres-au`
- `hyrelog-minio`

### 2. Create .env File

```powershell
Copy-Item .env.example .env
```

The `.env` file is pre-configured for local development. You can edit it if needed.

### 3. Install Dependencies

```powershell
npm install
```

This installs dependencies for all workspaces (root, api, worker, infra).

### 4. Run Database Migrations

Run migrations for all 4 regions:

```powershell
npm run prisma:migrate:all
```

**First time only**: You'll be prompted to name the initial migration (e.g., "init"). Type a name and press Enter.

This script will:
- Create the initial migration (if it doesn't exist)
- Apply migrations to all 4 Postgres databases (US, EU, UK, AU)

### 5. Generate Prisma Client

```powershell
npm run prisma:generate
```

This generates the Prisma Client used by the API.

### 6. Start the API Server

```powershell
npm run dev
```

You should see:
```
[INFO] HyreLog API server started
[INFO] Server listening on http://0.0.0.0:3000
```

### 7. Test the API

Open a new PowerShell window and test:

```powershell
# Test root endpoint
curl http://localhost:3000/

# Test internal health endpoint
curl -H "x-internal-token: dev-internal-token-change-in-production" http://localhost:3000/internal/health

# Test internal metrics endpoint
curl -H "x-internal-token: dev-internal-token-change-in-production" http://localhost:3000/internal/metrics
```

## Access MinIO Console (S3 Local)

1. Open browser: http://localhost:9001
2. Login:
   - Username: `minioadmin`
   - Password: `minioadmin`
3. (Optional) Create buckets:
   - `hyrelog-archive-us`
   - `hyrelog-archive-eu`
   - `hyrelog-archive-uk`
   - `hyrelog-archive-au`

## Common Commands

```powershell
# Development
npm run dev                    # Start API server
npm run typecheck              # Type-check all packages
npm run lint                   # Lint all packages
npm run format                 # Format code with Prettier

# Database
npm run prisma:migrate:all     # Run migrations for all regions
npm run prisma:generate        # Generate Prisma Client
npm run prisma:studio          # Open Prisma Studio (database GUI)

# Docker
npm run docker:up              # Start containers
npm run docker:down            # Stop containers
npm run docker:logs            # View container logs

# Verification
npm run verify                 # Check setup completeness
```

## Troubleshooting

### Port 3000 Already in Use

Find what's using the port:
```powershell
netstat -ano | findstr :3000
```

Kill the process or change `PORT` in `.env`.

### Database Connection Errors

1. Check containers are running: `docker ps`
2. Check database logs: `docker logs hyrelog-postgres-us`
3. Verify `.env` has correct `DATABASE_URL_*` values

### Migration Errors

If migrations fail:
1. Check database is accessible: `docker exec -it hyrelog-postgres-us psql -U hyrelog -d hyrelog_us -c "\dt"`
2. Reset database (⚠️ deletes data): In the migration script, use `-Reset` flag (not recommended for production)

### Prisma Client Not Found

Run: `npm run prisma:generate`

## Next Steps

Once the API is running:
1. Explore the codebase structure
2. Review the Prisma schema: `services/api/prisma/schema.prisma`
3. Check internal endpoints with the health check
4. Read the main README.md for architecture details

## Phase 0 Complete ✅

You now have:
- ✅ API service scaffold running
- ✅ Worker service scaffold (placeholder)
- ✅ Prisma schema with all models
- ✅ Multi-region database setup
- ✅ CDK infrastructure scaffold
- ✅ Local development environment

Ready for Phase 1 development!

