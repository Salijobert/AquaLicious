param(
  [string]$TargetUrl = "https://aqualicious.vercel.app"
)

$ErrorActionPreference = 'Stop'
$TargetUrl = $TargetUrl.TrimEnd('/')

Write-Host "=== AQUALICIOUS POST-DEPLOY VERCEL SMOKE TEST ===" -ForegroundColor Cyan
Write-Host "Target: $TargetUrl`n"

$tests = @(
  @{
    Path = "/dashboard.html"
    ExpectedLocation = "/dashboard"
    Label = "/dashboard.html -> 301 /dashboard"
  },
  @{
    Path = "/products.html"
    ExpectedLocation = "/"
    Label = "/products.html -> 301 /"
  },
  @{
    Path = "/frontend/pages/dashboard.html"
    ExpectedLocation = "/dashboard"
    Label = "/frontend/pages/dashboard.html -> 301 /dashboard"
  },
  @{
    Path = "/verify-email-complete.html?mode=verifyEmail&oobCode=test"
    ExpectedLocation = "/verify-email-complete?mode=verifyEmail&oobCode=test"
    Label = "/verify-email-complete.html?mode=verifyEmail&oobCode=test -> 301 (query preserved)"
  },
  @{
    Path = "/reset-password-complete.html?mode=resetPassword&oobCode=test"
    ExpectedLocation = "/reset-password-complete?mode=resetPassword&oobCode=test"
    Label = "/reset-password-complete.html?mode=resetPassword&oobCode=test -> 301 (query preserved)"
  }
)

$passed = 0
$failed = 0

foreach ($t in $tests) {
  $url = "$TargetUrl$($t.Path)"
  try {
    # Use curl -I without auto-redirect to inspect 301 and Location
    $curlOut = & curl.exe -s -I $url
    $statusMatch = $curlOut | Select-String "HTTP/\d(\.\d)?\s+(\d+)"
    $statusLine = if ($statusMatch) { $statusMatch.Matches[0].Value } else { "HTTP/Unknown" }

    $locMatch = $curlOut | Select-String -CaseSensitive:$false "^Location:\s*(.+)"
    $rawLocation = if ($locMatch) { $locMatch.Matches[0].Groups[1].Value.Trim() } else { "" }

    # Parse and compare ONLY the path and query string (supporting relative or absolute URLs)
    $parsedLocation = if ($rawLocation) {
      try {
        $uri = [System.Uri]::new($rawLocation, [System.UriKind]::RelativeOrAbsolute)
        if ($uri.IsAbsoluteUri) {
          $uri.PathAndQuery
        } else {
          $rawLocation
        }
      } catch {
        $rawLocation
      }
    } else { "" }

    $is301 = $statusLine -match "301|308"
    $matchesLocation = ($parsedLocation -eq $t.ExpectedLocation)

    if ($is301 -and $matchesLocation) {
      Write-Host "PASS $statusLine $($t.Label) (Location Path: $parsedLocation)" -ForegroundColor Green
      $passed++
    } else {
      Write-Host "FAIL $statusLine $($t.Label)`n  Expected Status: 301, Got: $statusLine`n  Expected Path: $($t.ExpectedLocation), Got: '$parsedLocation' (Raw: '$rawLocation')" -ForegroundColor Red
      $failed++
    }
  } catch {
    Write-Host "FAIL $($t.Label): $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}

Write-Host "`nResults: $passed passed, $failed failed."

if ($failed -gt 0) {
  exit 1
} else {
  Write-Host "ALL POST-DEPLOY SMOKE CHECKS VERIFIED SUCCESSFULLY!" -ForegroundColor Green
  exit 0
}
