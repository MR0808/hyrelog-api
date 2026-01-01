# Test Export Download
# Downloads an export and saves it to a file to verify content

param(
    [Parameter(Mandatory=$false)]
    [string]$JobId = $env:EXPORT_JOB_ID,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiKey = $env:API_KEY,
    
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "http://localhost:3000"
)

if (-not $JobId) {
    Write-Host "Error: JobId is required. Set EXPORT_JOB_ID env var or pass -JobId parameter" -ForegroundColor Red
    exit 1
}

if (-not $ApiKey) {
    Write-Host "Error: API Key is required. Set API_KEY env var or pass -ApiKey parameter" -ForegroundColor Red
    exit 1
}

$url = "$BaseUrl/v1/exports/$JobId/download"
$outputFile = "export-$JobId.jsonl"

Write-Host "`nDownloading export..." -ForegroundColor Cyan
Write-Host "  URL: $url" -ForegroundColor Gray
Write-Host "  Output: $outputFile`n" -ForegroundColor Gray

try {
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
    }
    
    Invoke-WebRequest -Uri $url -Headers $headers -OutFile $outputFile
    
    Write-Host "Download complete!" -ForegroundColor Green
    Write-Host "  File: $outputFile" -ForegroundColor Gray
    
    $fileSize = (Get-Item $outputFile).Length
    Write-Host "  Size: $fileSize bytes`n" -ForegroundColor Gray
    
    if ($fileSize -eq 0) {
        Write-Host "WARNING: File is empty!" -ForegroundColor Yellow
    } else {
        Write-Host "First 500 characters:" -ForegroundColor Cyan
        Get-Content $outputFile -TotalCount 10 | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Gray
        }
        
        $lineCount = (Get-Content $outputFile | Measure-Object -Line).Lines
        Write-Host "`n  Total lines: $lineCount" -ForegroundColor Gray
    }
} catch {
    Write-Host "Error downloading export:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
