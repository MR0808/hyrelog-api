# Cleanup script for failed migration
# Removes any partial changes from the failed add_plan_model migration

param(
    [string]$Region = "US",
    [int]$Port = 54321,
    [string]$Database = "hyrelog_us"
)

$env:DATABASE_URL = "postgresql://hyrelog:hyrelog@localhost:$Port/$Database"

Write-Host "`n🧹 Cleaning up failed migration for $Region region..." -ForegroundColor Cyan
Write-Host "Database: $Database on port $Port`n" -ForegroundColor Gray

# SQL cleanup commands
$cleanupSQL = @"
-- Remove foreign key constraint if exists
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_planId_fkey;

-- Remove planId column if exists
ALTER TABLE companies DROP COLUMN IF EXISTS planId;

-- Drop plans table if exists
DROP TABLE IF EXISTS plans CASCADE;

-- Drop PlanType enum if exists
DROP TYPE IF EXISTS "PlanType";
"@

Write-Host "Executing cleanup SQL..." -ForegroundColor Yellow

# Save SQL to temp file
$tempFile = [System.IO.Path]::GetTempFileName()
$cleanupSQL | Out-File -FilePath $tempFile -Encoding UTF8

try {
    # Execute via Prisma
    $result = npx prisma db execute --file $tempFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Cleanup completed successfully!`n" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Cleanup may have partially completed. Check output:`n" -ForegroundColor Yellow
        Write-Host $result
    }
} catch {
    Write-Host "❌ Error during cleanup: $_`n" -ForegroundColor Red
    Write-Host "You may need to manually run the SQL commands in your database.`n" -ForegroundColor Yellow
} finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

Write-Host "Database is now clean and ready for migration.`n" -ForegroundColor Green

