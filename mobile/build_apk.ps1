$ErrorActionPreference = "Stop"

Write-Host "=== Building AquaLicious Android APK ===" -ForegroundColor Cyan

# 1. Set JDK 21 and Android SDK
$jdkPath = "E:\AquaLicious\.tools\jdk\jdk-21.0.12.1+1"
if (Test-Path $jdkPath) {
    $env:JAVA_HOME = $jdkPath
    $env:PATH = "$jdkPath\bin;$env:PATH"
    Write-Host "Using JDK from: $jdkPath" -ForegroundColor Green
}

$sdkPath = "E:\AquaLicious\.tools\android-sdk"
if (Test-Path $sdkPath) {
    $env:ANDROID_HOME = $sdkPath
    $env:PATH = "$sdkPath\platform-tools;$env:PATH"
    Write-Host "Using Android SDK from: $sdkPath" -ForegroundColor Green
}

# 2. Sync Capacitor Web Assets
Set-Location "E:\AquaLicious\mobile"
Write-Host "Syncing Capacitor assets..." -ForegroundColor Yellow
npx cap sync android

# 3. Build APK
Set-Location "E:\AquaLicious\mobile\android"
Write-Host "Running Gradle build..." -ForegroundColor Yellow
.\gradlew.bat assembleDebug

Write-Host "`nAPK Build Complete!" -ForegroundColor Green
Get-ChildItem -Path "app\build\outputs\apk" -Recurse -Filter "*.apk" | Select-Object Name, Length, LastWriteTime, FullName
