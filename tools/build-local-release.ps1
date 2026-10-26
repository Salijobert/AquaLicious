# Creates a signing key once, protects its password with Windows DPAPI, and builds.
# The key belongs to this project. Back it up before distributing the APK.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(-not $env:JAVA_HOME){$env:JAVA_HOME=(Get-ChildItem (Join-Path $root '.tools/jdk') -Directory | Select-Object -First 1).FullName}
if(-not $env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $root '.tools/android-sdk'}
$env:GRADLE_USER_HOME=Join-Path $root '.tools/gradle-cache'
$signing=Join-Path $root 'private-signing'
New-Item -ItemType Directory -Force $signing | Out-Null
$env:AQ_KEYSTORE=Join-Path $signing 'aqualicious-release.p12'
$protectedPassword=Join-Path $signing 'password.dpapi'
try {
 if(-not (Test-Path $env:AQ_KEYSTORE)) {
  if(Test-Path $protectedPassword){throw 'Password file exists without keystore; restore the original key instead of replacing it.'}
  $env:AQ_STORE_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  $env:AQ_KEY_PASSWORD=$env:AQ_STORE_PASSWORD
  $secure=ConvertTo-SecureString $env:AQ_STORE_PASSWORD -AsPlainText -Force
  $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedPassword
  & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $env:AQ_KEYSTORE -storetype PKCS12 -storepass:env AQ_STORE_PASSWORD -keypass:env AQ_KEY_PASSWORD -alias aqualicious -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=AquaLicious, OU=Android, O=AquaLicious, C=PH'
  if($LASTEXITCODE -ne 0){throw 'Signing-key creation failed'}
 } else {
  $secure=Get-Content -LiteralPath $protectedPassword | ConvertTo-SecureString
  $env:AQ_STORE_PASSWORD=[System.Net.NetworkCredential]::new('', $secure).Password
  $env:AQ_KEY_PASSWORD=$env:AQ_STORE_PASSWORD
 }
 $env:AQ_KEY_ALIAS='aqualicious'
 & (Join-Path $PSScriptRoot 'build-android.ps1') -Configuration Release
} finally {
 Remove-Item Env:AQ_STORE_PASSWORD,Env:AQ_KEY_PASSWORD -ErrorAction SilentlyContinue
}
