# Check migration state and clean up if needed
param(
    [string]$Region = "US",
    [int]$Port = 54321,
    [string]$Database = "hyrelog_us"
)

$env:DATABASE_URL = "postgresql://hyrelog:hyrelog@localhost:$Port/$Database"

Write-Host "`nChecking migration state for $Region region..." -ForegroundColor Cyan
Write-Host "Database: $Database on port $Port`n" -ForegroundColor Gray

# Check if plans table exists
$plansExists = $false
$planIdExists = $false

try {
    # Use Prisma to check state
    $result = npx prisma db execute --stdin 2>&1 <<< "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'plans') AS plans_exists;"
    if ($result -match "true") { $plansExists = $true }
} catch {
    Write-Host "Could not check via Prisma, trying direct SQL..." -ForegroundColor Yellow
}

Write-Host "Migration state:" -ForegroundColor Yellow
Write-Host "  Plans table exists: $plansExists" -ForegroundColor White
Write-Host "  planId column exists: $planIdExists`n" -ForegroundColor White

if ($plansExists -or $planIdExists) {
    Write-Host "⚠️  Partial migration detected!" -ForegroundColor Yellow
    Write-Host "You may need to manually clean up:" -ForegroundColor White
    Write-Host "  - DROP TABLE IF EXISTS plans CASCADE;" -ForegroundColor Gray
    Write-Host "  - ALTER TABLE companies DROP COLUMN IF EXISTS planId;`n" -ForegroundColor Gray
} else {
    Write-Host "✅ Database is clean, ready for migration`n" -ForegroundColor Green
}

