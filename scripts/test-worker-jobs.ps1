# Test Phase 3 Worker Jobs
# 
# This script tests the worker archival jobs.
# Prerequisites:
# - Docker containers running (docker compose up -d)
# - Migrations run (npm run prisma:migrate:all)
# - Seed data created (npm run seed)

Write-Host "`n🧪 Phase 3 Worker Jobs Testing Script`n" -ForegroundColor Cyan

# Check if worker is available
$workerPath = "services\worker\src\index.ts"
if (-not (Test-Path $workerPath)) {
    Write-Host "❌ Error: Worker source not found at $workerPath`n" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Available Worker Jobs:" -ForegroundColor Yellow
Write-Host "  1. retention-marking - Mark events for archival" -ForegroundColor White
Write-Host "  2. archival - Archive events to S3" -ForegroundColor White
Write-Host "  3. archive-verification - Verify archived files" -ForegroundColor White
Write-Host "  4. cold-archive-marker - Mark old archives for cold storage`n" -ForegroundColor White

Write-Host "💡 To run a specific job:" -ForegroundColor Cyan
Write-Host "  npm run worker retention-marking" -ForegroundColor White
Write-Host "  npm run worker archival" -ForegroundColor White
Write-Host "  npm run worker archive-verification" -ForegroundColor White
Write-Host "  npm run worker cold-archive-marker`n" -ForegroundColor White

Write-Host "💡 To run all jobs continuously:" -ForegroundColor Cyan
Write-Host "  npm run worker`n" -ForegroundColor White

Write-Host "📝 Job Details:" -ForegroundColor Yellow
Write-Host "`n1. Retention Marking Job (Daily)" -ForegroundColor Cyan
Write-Host "   - Marks events older than hotRetentionDays as archivalCandidate=true" -ForegroundColor White
Write-Host "   - Plan-based: uses Company.plan.hotRetentionDays" -ForegroundColor White
Write-Host "   - Does NOT delete events" -ForegroundColor White

Write-Host "`n2. Archival Job (Daily)" -ForegroundColor Cyan
Write-Host "   - Archives events marked as archivalCandidate=true" -ForegroundColor White
Write-Host "   - Groups events by UTC day (YYYY-MM-DD)" -ForegroundColor White
Write-Host "   - Creates gzipped JSONL files" -ForegroundColor White
Write-Host "   - Uploads to S3/MinIO" -ForegroundColor White
Write-Host "   - Creates ArchiveObject records" -ForegroundColor White

Write-Host "`n3. Archive Verification Job (Daily)" -ForegroundColor Cyan
Write-Host "   - Verifies archived files by SHA-256 checksum" -ForegroundColor White
Write-Host "   - Downloads and recomputes hash" -ForegroundColor White
Write-Host "   - Updates verifiedAt on success" -ForegroundColor White
Write-Host "   - Records errors on mismatch" -ForegroundColor White

Write-Host "`n4. Cold Archive Marker Job (Weekly)" -ForegroundColor Cyan
Write-Host "   - Marks ArchiveObjects older than coldArchiveAfterDays" -ForegroundColor White
Write-Host "   - Sets isColdArchived=true" -ForegroundColor White
Write-Host "   - Metadata-only (actual Glacier transition handled by AWS lifecycle)" -ForegroundColor White

Write-Host "`n✅ Worker jobs are ready to test!`n" -ForegroundColor Green

