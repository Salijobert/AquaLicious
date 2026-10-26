param([int]$WebPort=8088)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$env:DATABASE_URL='postgresql://postgres@localhost:5432/aqualicious_pg?schema=public'
$env:AQ_TEST_WEB="http://127.0.0.1:$WebPort"
$env:AQ_ADMIN_PASSWORD='pass-'+[guid]::NewGuid().ToString('N')
$env:AQ_UI_USERNAME='ui-'+[guid]::NewGuid().ToString('N')
$env:PORT="$WebPort"

Write-Host "Seeding UI test user and initial stock in PostgreSQL..."
Push-Location (Join-Path $root 'backend')
try {
    & npx.cmd tsx src/seed.ts $env:AQ_UI_USERNAME 'UI Test Owner'
} finally { Pop-Location }

# Give product 2 initial stock for mobile test checkout
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d aqualicious_pg -c "UPDATE products SET stock = 50 WHERE id = 2;"

# Start Express server in background
$serverProc = Start-Process -FilePath "node" -ArgumentList (Join-Path $root 'backend/dist/server.js') -WorkingDirectory (Join-Path $root 'backend') -PassThru -WindowStyle Hidden

# Start mobile web server on 8090
$mobileProc = Start-Process -FilePath "node" -ArgumentList (Join-Path $root 'tools/serve-mobile.mjs') -WorkingDirectory $root -PassThru -WindowStyle Hidden

try {
    # Wait for web server
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/api/config" -TimeoutSec 2 -UseBasicParsing
            if ($r.StatusCode -eq 200) { break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    # Wait for mobile server
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:8090" -TimeoutSec 2 -UseBasicParsing
            if ($r.StatusCode -eq 200) { break }
        } catch { Start-Sleep -Milliseconds 200 }
    }

    Write-Host "Running Playwright UI tests..."
    & node (Join-Path $root 'tools/ui-test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'UI test failed' }
} finally {
    Stop-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $mobileProc.Id -ErrorAction SilentlyContinue
}
