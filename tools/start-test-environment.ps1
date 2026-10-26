param([string]$DatabaseName='aqualicious_db',[int]$Port=8088,[int]$SecondPort=8089)
$ErrorActionPreference='Stop'
if($DatabaseName -notmatch '^aqualicious_[a-z0-9_]+$'){throw 'Use a disposable aqualicious_* database name'}
$root=Split-Path $PSScriptRoot -Parent
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'; $env:DB_NAME=$DatabaseName; $env:DB_USER='root'; $env:DB_PASSWORD=''
$env:AQ_TEST_URL="http://127.0.0.1:$Port/backend/api";$env:AQ_TEST_URL_2="http://127.0.0.1:$SecondPort/backend/api"
$env:JWT_SECRET=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:AQ_ADMIN_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(20))
$env:CORS_ORIGINS='https://localhost,http://localhost:8090'
(Get-Content -Raw (Join-Path $root 'aqualicious website/backend/schema.sql')).Replace('aqualicious_db',$DatabaseName) | & 'C:/xampp/mysql/bin/mysql.exe' --host=127.0.0.1 --port=3307 --user=root
if($LASTEXITCODE -ne 0){throw 'Schema import failed; use a fresh disposable database.'}
& php (Join-Path $root 'aqualicious website/backend/create-admin.php') test-owner 'Test Owner'
$web=Join-Path $root 'aqualicious website'
foreach($testPort in $Port,$SecondPort){Start-Process -FilePath 'C:/xampp/php/php.exe' -ArgumentList '-S',"127.0.0.1:$testPort",'backend/router.php' -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardError (Join-Path $root "runtime/php-$testPort.log") -PassThru | Select-Object Id}
# Credentials are ephemeral and inherited by this test process, never printed.
& php (Join-Path $root 'tests/analytics.php')
& node (Join-Path $root 'tests/integration.mjs')
if($LASTEXITCODE -ne 0){throw 'Integration tests failed'}
