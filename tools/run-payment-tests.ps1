$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$env:DB_HOST='127.0.0.1';$env:DB_PORT='3307';$env:DB_NAME='aqualicious_db';$env:DB_USER='root';$env:DB_PASSWORD=''
$env:JWT_SECRET=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:AQ_ADMIN_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(20))
$env:AQ_UI_USERNAME='payment-'+[guid]::NewGuid().ToString('N')
$env:GCASH_QR_URL='https://merchant.example/test-qr.png'
$env:CORS_ORIGINS='https://localhost'
& php (Join-Path $root 'aqualicious website/backend/create-admin.php') $env:AQ_UI_USERNAME 'Payment Test Owner'
Start-Process -FilePath 'C:/xampp/php/php.exe' -ArgumentList '-S','127.0.0.1:8092','backend/router.php' -WorkingDirectory (Join-Path $root 'aqualicious website') -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'runtime/php-8092.log')
& node (Join-Path $root 'tests/payments.mjs')
if($LASTEXITCODE -ne 0){throw 'Payment tests failed'}
