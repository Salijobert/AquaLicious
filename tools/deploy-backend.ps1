# Deploy Backend Script with Strict Exit Code Checking
$ErrorActionPreference = 'Stop'

function Assert-LastExitCode {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[FATAL] Step '$StepName' failed with exit code $LASTEXITCODE. Aborting deployment immediately."
        exit $LASTEXITCODE
    }
}

Write-Host "=== AQUALICIOUS BACKEND DEPLOYMENT ===" -ForegroundColor Cyan

# 1. Run Prisma Database Migrations
Write-Host "`n[1/3] Running Prisma migrate deploy..." -ForegroundColor Yellow
Push-Location ./backend
& node ./node_modules/prisma/build/index.js migrate deploy
Assert-LastExitCode "Prisma migrate deploy"
Pop-Location

# 2. Compile TypeScript
Write-Host "`n[2/3] Building backend TypeScript..." -ForegroundColor Yellow
& npm --prefix ./backend run build
Assert-LastExitCode "Backend TypeScript build"

# 3. Reload PM2 Cluster
Write-Host "`n[3/3] Executing zero-downtime pm2 reload..." -ForegroundColor Yellow
& npx pm2 startOrReload ./ecosystem.config.cjs --update-env
Assert-LastExitCode "PM2 startOrReload"

Write-Host "`n=== BACKEND DEPLOYMENT SUCCEEDED ===" -ForegroundColor Green
exit 0
