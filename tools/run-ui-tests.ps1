param([string]$DatabaseName='aqualicious_db',[int]$WebPort=8088)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$env:DB_HOST='127.0.0.1';$env:DB_PORT='3307';$env:DB_NAME=$DatabaseName;$env:DB_USER='root';$env:DB_PASSWORD=''
$env:AQ_TEST_WEB="http://127.0.0.1:$WebPort"
$env:AQ_ADMIN_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(20))
$env:AQ_UI_USERNAME='ui-'+[guid]::NewGuid().ToString('N')
& php (Join-Path $root 'aqualicious website/backend/create-admin.php') $env:AQ_UI_USERNAME 'UI Test Owner'
if(-not (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue)){Start-Process -FilePath 'C:/xampp/php/php.exe' -ArgumentList '-S','localhost:8090' -WorkingDirectory (Join-Path $root 'mobile/www') -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'runtime/mobile-web.log')}
& php (Join-Path $root 'tests/invariants.php')
& node (Join-Path $root 'tools/ui-test.mjs')
if($LASTEXITCODE -ne 0){throw 'UI test failed'}
