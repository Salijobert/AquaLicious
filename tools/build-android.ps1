param([ValidateSet('Debug','Release')][string]$Configuration='Debug')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(-not $env:JAVA_HOME){$jdk=Get-ChildItem (Join-Path $root '.tools/jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1;if($jdk){$env:JAVA_HOME=$jdk.FullName}}
if(-not $env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $root '.tools/android-sdk'}
if(-not (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))){throw 'Set JAVA_HOME to a Java 21 JDK.'}
Push-Location (Join-Path $root 'mobile')
try {
 & npm.cmd run sync
 if($LASTEXITCODE -ne 0){throw 'Asset sync failed'}
 Push-Location android
 try { & .\gradlew.bat "assemble$Configuration" --console=plain; if($LASTEXITCODE -ne 0){throw 'Android build failed'} } finally {Pop-Location}
} finally {Pop-Location}
