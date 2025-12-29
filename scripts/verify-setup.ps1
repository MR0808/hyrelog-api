# HyreLog - Verify Local Setup
# This script checks that all prerequisites and setup steps are complete

$ErrorActionPreference = "Continue"

Write-Host "HyreLog - Setup Verification" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -ge 20) {
        Write-Host "  ✓ Node.js $nodeVersion (required: 20+)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Node.js $nodeVersion (required: 20+)" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "  ✗ Node.js not found" -ForegroundColor Red
    $allGood = $false
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "  ✓ npm $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ npm not found" -ForegroundColor Red
    $allGood = $false
}

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "  ✓ $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker not found" -ForegroundColor Red
    $allGood = $false
}

# Check Docker Compose
Write-Host "Checking Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version
    Write-Host "  ✓ $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker Compose not found" -ForegroundColor Red
    $allGood = $false
}

# Check Docker containers
Write-Host "Checking Docker containers..." -ForegroundColor Yellow
$containers = @("hyrelog-postgres-us", "hyrelog-postgres-eu", "hyrelog-postgres-uk", "hyrelog-postgres-au", "hyrelog-minio")
$runningContainers = docker ps --format "{{.Names}}"

foreach ($container in $containers) {
    if ($runningContainers -match $container) {
        Write-Host "  ✓ $container is running" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $container is not running" -ForegroundColor Red
        $allGood = $false
    }
}

# Check .env file
Write-Host "Checking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "  ✓ .env file exists" -ForegroundColor Green
} else {
    Write-Host "  ✗ .env file not found (copy from .env.example)" -ForegroundColor Red
    $allGood = $false
}

# Check node_modules
Write-Host "Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "  ✓ node_modules exists (run 'npm install' if missing packages)" -ForegroundColor Green
} else {
    Write-Host "  ✗ node_modules not found (run 'npm install')" -ForegroundColor Red
    $allGood = $false
}

# Check Prisma Client
Write-Host "Checking Prisma Client..." -ForegroundColor Yellow
$prismaClientPath = Join-Path "services" "api" "node_modules" ".prisma" "client"
if (Test-Path $prismaClientPath) {
    Write-Host "  ✓ Prisma Client generated" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Prisma Client not generated (run 'npm run prisma:generate')" -ForegroundColor Yellow
}

Write-Host ""
if ($allGood) {
    Write-Host "✓ All checks passed! You're ready to start developing." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Run migrations: npm run prisma:migrate:all" -ForegroundColor Gray
    Write-Host "  2. Generate Prisma Client: npm run prisma:generate" -ForegroundColor Gray
    Write-Host "  3. Start the API: npm run dev" -ForegroundColor Gray
} else {
    Write-Host "✗ Some checks failed. Please fix the issues above." -ForegroundColor Red
    exit 1
}

