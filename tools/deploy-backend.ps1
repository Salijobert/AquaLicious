# Deploy Backend Script with Strict Exit Code Checking & Safe Process Inspection
$ErrorActionPreference = 'Stop'

function Assert-LastExitCode {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[FATAL] Step '$StepName' failed with exit code $LASTEXITCODE. Aborting deployment immediately."
        exit $LASTEXITCODE
    }
}

Write-Host "=== AQUALICIOUS BACKEND DEPLOYMENT ===" -ForegroundColor Cyan

# 0. Dynamic PM2_HOME Discovery & Port 8088 Sanity Check
Write-Host "`n[0/4] Verifying PM2 environment and port 8088..." -ForegroundColor Yellow
$pm2Home = if ($env:PM2_HOME) { 
    $env:PM2_HOME 
} elseif ($env:USERPROFILE -and (Test-Path (Join-Path $env:USERPROFILE '.pm2'))) { 
    Join-Path $env:USERPROFILE '.pm2' 
} else { 
    $null 
}

if (-not $pm2Home -or -not (Test-Path $pm2Home)) {
    Write-Error "[FATAL] PM2_HOME could not be determined dynamically or directory does not exist. Aborting."
    exit 1
}
Write-Host "Resolved PM2_HOME: $pm2Home" -ForegroundColor Gray

# Inspect Port 8088 ownership
$conn = Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $portPid = $conn.OwningProcess
    Write-Host "Port 8088 is currently bound by PID $portPid" -ForegroundColor Gray

    $pm2ListJson = & npx pm2 jlist 2>$null
    $pm2Procs = try { $pm2ListJson | ConvertFrom-Json } catch { @() }
    $pm2Pids = @($pm2Procs | Where-Object { $_.name -eq 'aqualicious-api' } | ForEach-Object { $_.pid })

    if ($pm2Pids.Count -gt 0 -and $portPid -notin $pm2Pids) {
        Write-Error "[FATAL] Port 8088 is owned by PID $portPid, which differs from running PM2 worker PIDs ($($pm2Pids -join ', ')). Terminate orphaned process before reloading."
        exit 1
    }
}

# 1. Run Prisma Database Migrations (using MIGRATION_DATABASE_URL if configured)
Write-Host "`n[1/4] Running Prisma migrate deploy..." -ForegroundColor Yellow
Push-Location ./backend
if ($env:MIGRATION_DATABASE_URL) {
    Write-Host "Using dedicated MIGRATION_DATABASE_URL for migration execution..." -ForegroundColor Gray
    $oldDbUrl = $env:DATABASE_URL
    $env:DATABASE_URL = $env:MIGRATION_DATABASE_URL
}
& node ./node_modules/prisma/build/index.js migrate deploy
Assert-LastExitCode "Prisma migrate deploy"
if ($env:MIGRATION_DATABASE_URL) {
    $env:DATABASE_URL = $oldDbUrl
}
Pop-Location

# 2. Compile TypeScript
Write-Host "`n[2/4] Building backend TypeScript..." -ForegroundColor Yellow
& npm --prefix ./backend run build
Assert-LastExitCode "Backend TypeScript build"

# 3. Reload PM2 Cluster
Write-Host "`n[3/4] Executing zero-downtime pm2 reload..." -ForegroundColor Yellow
& npx pm2 startOrReload ./ecosystem.config.cjs --update-env
Assert-LastExitCode "PM2 startOrReload"

Write-Host "`n=== BACKEND DEPLOYMENT SUCCEEDED ===" -ForegroundColor Green
exit 0
