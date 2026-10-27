param(
  [string]$TargetUrl = "https://aqualicious.vercel.app"
)

$ErrorActionPreference = 'Stop'
$TargetUrl = $TargetUrl.TrimEnd('/')
$ExpectedTitle = "AquaLicious - Pure Mineral Water & Station Refills"

Write-Host "=== AQUALICIOUS LIVE DEPLOYMENT VERIFICATION ===" -ForegroundColor Cyan
Write-Host "Target: $TargetUrl`n"

$failures = 0
$passes = 0

# -------------------------------------------------------------
# 1. VERIFY ROOT <title>
# -------------------------------------------------------------
Write-Host "[1/3] Checking HTML <title> on $TargetUrl/ ..." -ForegroundColor Yellow
try {
  $html = & curl.exe -s -L "$TargetUrl/"
  $titleMatch = [regex]::Match($html, "<title>(.*?)</title>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  
  if ($titleMatch.Success) {
    $actualTitle = $titleMatch.Groups[1].Value.Trim()
    if ($actualTitle -eq $ExpectedTitle) {
      Write-Host "PASS: <title> matches expected: '$actualTitle'" -ForegroundColor Green
      $passes++
    } else {
      Write-Host "FAIL: <title> mismatch!`n  Expected: '$ExpectedTitle'`n  Actual:   '$actualTitle'`n  (The live site is still serving an old build!)" -ForegroundColor Red
      $failures++
    }
  } else {
    Write-Host "FAIL: No <title> tag found in HTML response from $TargetUrl/" -ForegroundColor Red
    $failures++
  }
} catch {
  Write-Host "FAIL: Failed to fetch $TargetUrl/: $($_.Exception.Message)" -ForegroundColor Red
  $failures++
}

# -------------------------------------------------------------
# 2. VERIFY /products.html -> 301 REDIRECT TO /
# -------------------------------------------------------------
Write-Host "`n[2/3] Checking /products.html 301 redirect..." -ForegroundColor Yellow
try {
  $curlOut = & curl.exe -s -I "$TargetUrl/products.html"
  $statusMatch = $curlOut | Select-String "HTTP/\d(\.\d)?\s+(\d+)"
  $statusLine = if ($statusMatch) { $statusMatch.Matches[0].Value } else { "HTTP/Unknown" }

  $locMatch = $curlOut | Select-String -CaseSensitive:$false "^Location:\s*(.+)"
  $rawLocation = if ($locMatch) { $locMatch.Matches[0].Groups[1].Value.Trim() } else { "" }

  $parsedLocation = if ($rawLocation) {
    try {
      $uri = [System.Uri]::new($rawLocation, [System.UriKind]::RelativeOrAbsolute)
      if ($uri.IsAbsoluteUri) { $uri.PathAndQuery } else { $rawLocation }
    } catch { $rawLocation }
  } else { "" }

  $is301 = $statusLine -match "301|308"
  $isTargetRoot = ($parsedLocation -eq "/")

  if ($is301 -and $isTargetRoot) {
    Write-Host "PASS: /products.html correctly returns 301 redirecting to '/' (Location: $rawLocation)" -ForegroundColor Green
    $passes++
  } else {
    Write-Host "FAIL: /products.html did not return 301 redirect to '/'!`n  Status:   $statusLine`n  Location: '$parsedLocation' (Raw: '$rawLocation')`n  Expected: 301 with Location: '/'" -ForegroundColor Red
    $failures++
  }
} catch {
  Write-Host "FAIL: Error checking /products.html: $($_.Exception.Message)" -ForegroundColor Red
  $failures++
}

# -------------------------------------------------------------
# 3. VERIFY QUERY PRESERVATION & OTHER CLEAN URL REDIRECTS
# -------------------------------------------------------------
Write-Host "`n[3/3] Checking key redirect preservation..." -ForegroundColor Yellow
$extraTests = @(
  @{
    Path = "/dashboard.html"
    ExpectedPath = "/dashboard"
    Label = "/dashboard.html -> 301 /dashboard"
  },
  @{
    Path = "/verify-email-complete.html?mode=verifyEmail&oobCode=deploy_test"
    ExpectedPath = "/verify-email-complete?mode=verifyEmail&oobCode=deploy_test"
    Label = "/verify-email-complete.html query string preservation"
  }
)

foreach ($t in $extraTests) {
  try {
    $curlOut = & curl.exe -s -I "$TargetUrl$($t.Path)"
    $statusMatch = $curlOut | Select-String "HTTP/\d(\.\d)?\s+(\d+)"
    $statusLine = if ($statusMatch) { $statusMatch.Matches[0].Value } else { "HTTP/Unknown" }

    $locMatch = $curlOut | Select-String -CaseSensitive:$false "^Location:\s*(.+)"
    $rawLoc = if ($locMatch) { $locMatch.Matches[0].Groups[1].Value.Trim() } else { "" }

    $parsedLoc = if ($rawLoc) {
      try {
        $uri = [System.Uri]::new($rawLoc, [System.UriKind]::RelativeOrAbsolute)
        if ($uri.IsAbsoluteUri) { $uri.PathAndQuery } else { $rawLoc }
      } catch { $rawLoc }
    } else { "" }

    $is301 = $statusLine -match "301|308"
    $matchesPath = ($parsedLoc -eq $t.ExpectedPath)

    if ($is301 -and $matchesPath) {
      Write-Host "PASS: $($t.Label) (Status: $statusLine, Path: $parsedLoc)" -ForegroundColor Green
      $passes++
    } else {
      Write-Host "FAIL: $($t.Label)`n  Status:   $statusLine`n  Path:     '$parsedLoc'`n  Expected: 301 with Path '$($t.ExpectedPath)'" -ForegroundColor Red
      $failures++
    }
  } catch {
    Write-Host "FAIL: $($t.Label) error: $($_.Exception.Message)" -ForegroundColor Red
    $failures++
  }
}

# -------------------------------------------------------------
# SUMMARY & EXIT CODE
# -------------------------------------------------------------
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Passed: $passes, Failed: $failures"

if ($failures -gt 0) {
  Write-Host "`nDEPLOYMENT VERIFICATION FAILED: The live deployment does not match local code." -ForegroundColor Red
  exit 1
} else {
  Write-Host "`nSUCCESS: Live deployment verified! The new title and clean 301 redirects are active on Vercel." -ForegroundColor Green
  exit 0
}
