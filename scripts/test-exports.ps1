# Test Phase 3 Export Endpoints
# 
# This script tests the export API endpoints with various scenarios.
# Prerequisites:
# - API server running (npm run dev)
# - Seed data created (npm run seed)
# - Company key and workspace key from seed output

param(
    [Parameter(Position=0)]
    [string]$CompanyKey = "",
    [Parameter(Position=1)]
    [string]$WorkspaceKey = "",
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "`n🧪 Phase 3 Export Testing Script`n" -ForegroundColor Cyan

# Use environment variables if keys not provided as parameters
if ([string]::IsNullOrEmpty($CompanyKey)) {
    $CompanyKey = $env:COMPANY_KEY
}
if ([string]::IsNullOrEmpty($WorkspaceKey)) {
    $WorkspaceKey = $env:WORKSPACE_KEY
}

# Check if keys are provided (after checking env vars)
if ([string]::IsNullOrEmpty($CompanyKey) -or [string]::IsNullOrEmpty($WorkspaceKey)) {
    Write-Host "❌ Error: Company key and workspace key are required`n" -ForegroundColor Red
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\test-exports.ps1 -CompanyKey 'hlk_co_...' -WorkspaceKey 'hlk_ws_...'`n" -ForegroundColor White
    Write-Host "Or set environment variables:" -ForegroundColor Yellow
    Write-Host "  `$env:COMPANY_KEY='hlk_co_...'" -ForegroundColor White
    Write-Host "  `$env:WORKSPACE_KEY='hlk_ws_...'`n" -ForegroundColor White
    exit 1
}

Write-Host "📋 Test Configuration:" -ForegroundColor Yellow
Write-Host "  Base URL: $BaseUrl" -ForegroundColor White
Write-Host "  Company Key: $($CompanyKey.Substring(0, [Math]::Min(20, $CompanyKey.Length)))..." -ForegroundColor White
Write-Host "  Workspace Key: $($WorkspaceKey.Substring(0, [Math]::Min(20, $WorkspaceKey.Length)))...`n" -ForegroundColor White

# Test 1: Create HOT export (JSONL)
Write-Host 'Test 1: Create HOT export (JSONL format)' -ForegroundColor Cyan
$createHotJsonl = @{
    source = "HOT"
    format = "JSONL"
    filters = @{
        category = "user"
    }
    limit = 100
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/v1/exports" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
            "Content-Type" = "application/json"
        } `
        -Body $createHotJsonl
    
    $jobId = $response.jobId
    Write-Host "  ✅ Export job created: $jobId" -ForegroundColor Green
    Write-Host "  Status: $($response.status)`n" -ForegroundColor White
} catch {
    Write-Host "  ❌ Failed to create export job" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)`n" -ForegroundColor Red
    exit 1
}

# Test 2: Check export job status
Write-Host "Test 2: Check export job status" -ForegroundColor Cyan
Start-Sleep -Seconds 1

try {
    $status = Invoke-RestMethod -Uri "$BaseUrl/v1/exports/$jobId" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
        }
    
    Write-Host "  ✅ Job status retrieved" -ForegroundColor Green
    Write-Host "  Status: $($status.status)" -ForegroundColor White
    Write-Host "  Source: $($status.source)" -ForegroundColor White
    Write-Host "  Format: $($status.format)" -ForegroundColor White
    Write-Host "  Row Limit: $($status.rowLimit)" -ForegroundColor White
    Write-Host "  Rows Exported: $($status.rowsExported)`n" -ForegroundColor White
} catch {
    Write-Host "  ❌ Failed to get job status" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 3: Download export (stream)
Write-Host 'Test 3: Download export (streaming)' -ForegroundColor Cyan
$outputFile = $null
$csvOutputFile = $null

if ($jobId) {
    $outputFile = "export-$jobId.jsonl"
}

try {
    Invoke-WebRequest -Uri "$BaseUrl/v1/exports/$jobId/download" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
        } `
        -OutFile $outputFile
    
    $fileSize = (Get-Item $outputFile).Length
    $lineCount = (Get-Content $outputFile | Measure-Object -Line).Lines
    
    Write-Host "  ✅ Export downloaded" -ForegroundColor Green
    Write-Host "  File: $outputFile" -ForegroundColor White
    Write-Host "  Size: $fileSize bytes" -ForegroundColor White
    Write-Host "  Lines: $lineCount`n" -ForegroundColor White
} catch {
    Write-Host "  ❌ Failed to download export" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 4: Create CSV export
Write-Host 'Test 4: Create HOT export (CSV format)' -ForegroundColor Cyan
$createHotCsv = @{
    source = "HOT"
    format = "CSV"
    limit = 50
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/v1/exports" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
            "Content-Type" = "application/json"
        } `
        -Body $createHotCsv
    
    $csvJobId = $response.jobId
    Write-Host "  ✅ CSV export job created: $csvJobId" -ForegroundColor Green
    
    Start-Sleep -Seconds 1
    
    if ($csvJobId) {
        $csvOutputFile = "export-$csvJobId.csv"
    }
    Invoke-WebRequest -Uri "$BaseUrl/v1/exports/$csvJobId/download" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
        } `
        -OutFile $csvOutputFile
    
    Write-Host "  ✅ CSV export downloaded: $csvOutputFile`n" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed to create/download CSV export" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 5: Test plan restriction (FREE plan)
Write-Host 'Test 5: Test plan restriction (should fail on FREE plan)' -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/v1/exports" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $CompanyKey"
            "Content-Type" = "application/json"
        } `
        -Body $createHotJsonl `
        -ErrorAction Stop
    
    Write-Host '  ⚠️  Export created (plan may allow exports)' -ForegroundColor Yellow
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorResponse.code -eq "PLAN_RESTRICTED") {
        Write-Host '  ✅ Plan restriction enforced (expected for FREE plan)' -ForegroundColor Green
        Write-Host "  Error: $($errorResponse.error)`n" -ForegroundColor White
    } else {
        Write-Host "  ❌ Unexpected error" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)`n" -ForegroundColor Red
    }
}

Write-Host "`n✅ Export testing complete!`n" -ForegroundColor Green
Write-Host "📁 Generated files:" -ForegroundColor Cyan
if ($outputFile -and (Test-Path $outputFile)) {
    Write-Host "  - $outputFile" -ForegroundColor White
}
if ($csvOutputFile -and (Test-Path $csvOutputFile)) {
    Write-Host "  - $csvOutputFile" -ForegroundColor White
}
Write-Host ""

