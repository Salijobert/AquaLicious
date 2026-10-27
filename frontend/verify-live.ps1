param(
  [string]$TargetUrl = "https://aqualicious.vercel.app"
)

& "$PSScriptRoot\..\tools\verify-live-deployment.ps1" -TargetUrl $TargetUrl
exit $LASTEXITCODE
