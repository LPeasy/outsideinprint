param(
  [string]$PriorityUrlsPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/priority-urls.json'),
  [string]$WorksheetPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout/rollout-worksheet.csv'),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports/seo-rollout')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-JsonDocument {
  param([string]$Json)

  $trimmed = $Json.Trim()
  $isArrayDocument = $trimmed.StartsWith('[') -and $trimmed.EndsWith(']')

  if ($isArrayDocument -and $trimmed -match '^\[\s*\]$') {
    return ,@()
  }

  $convertFromJson = Get-Command ConvertFrom-Json -ErrorAction Stop
  if ($convertFromJson.Parameters.ContainsKey('NoEnumerate')) {
    return ($Json | ConvertFrom-Json -NoEnumerate)
  }

  $parsed = $Json | ConvertFrom-Json
  if ($isArrayDocument -and $null -eq $parsed) {
    return ,@()
  }

  if ($isArrayDocument -and ($parsed -is [string] -or $parsed -isnot [System.Collections.IEnumerable])) {
    return ,$parsed
  }

  return $parsed
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing required JSON input: $Path"
  }

  return (Convert-JsonDocument -Json (Get-Content -Path $Path -Raw))
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  ($Value | ConvertTo-Json -Depth 20) | Out-File -FilePath $Path -Encoding utf8
}

function Get-WorksheetSummary {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }

  $rows = @(Import-Csv -Path $Path)
  if ($rows.Count -eq 0) {
    return $null
  }

  return [pscustomobject]@{
    total_rows = $rows.Count
    live_smoke_passed = @($rows | Where-Object { $_.live_smoke_passed -eq 'yes' }).Count
    live_smoke_failed = @($rows | Where-Object { $_.live_smoke_passed -ne 'yes' }).Count
    legacy_redirect_passed = @($rows | Where-Object { $_.legacy_redirect_passed -eq 'yes' }).Count
    legacy_redirect_failed = @($rows | Where-Object { $_.legacy_redirect_passed -ne 'yes' }).Count
  }
}

function Invoke-PowerShellProbe {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -MaximumRedirection 5
    return [pscustomobject]@{
      ok = $true
      status_code = [int]$response.StatusCode
      final_url = [string]$response.BaseResponse.ResponseUri.AbsoluteUri
      error = $null
    }
  }
  catch {
    return [pscustomobject]@{
      ok = $false
      status_code = $null
      final_url = $null
      error = $_.Exception.Message
    }
  }
}

function Invoke-CurlProbe {
  param(
    [string]$Url,
    [switch]$FollowRedirects = $true
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('seo-host-diagnostics-' + [guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $tempRoot -Force
  $headerPath = Join-Path $tempRoot 'headers.txt'
  $bodyPath = Join-Path $tempRoot 'body.txt'
  $stderrPath = Join-Path $tempRoot 'stderr.txt'

  try {
    $arguments = @(
      '--silent',
      '--show-error',
      '--connect-timeout', '20',
      '--max-time', '30',
      '--dump-header', $headerPath,
      '--output', $bodyPath,
      '--write-out', '%{response_code}|%{url_effective}|%{ssl_verify_result}|%{content_type}'
    )

    if ($FollowRedirects) {
      $arguments += @('--location', '--max-redirs', '5')
    }

    $arguments += $Url

    $raw = & curl.exe @arguments 2> $stderrPath
    $exitCode = $LASTEXITCODE
    $stderr = if (Test-Path -LiteralPath $stderrPath) { (Get-Content -Path $stderrPath -Raw).Trim() } else { '' }
    $headers = if (Test-Path -LiteralPath $headerPath) { (Get-Content -Path $headerPath -Raw) } else { '' }
    $body = if (Test-Path -LiteralPath $bodyPath) { (Get-Content -Path $bodyPath -Raw) } else { '' }

    $parts = @([string]$raw -split '\|', 4)
    $responseCode = if ($parts.Count -ge 1 -and $parts[0]) { [int]$parts[0] } else { $null }
    $effectiveUrl = if ($parts.Count -ge 2) { $parts[1] } else { $null }
    $sslVerifyResult = if ($parts.Count -ge 3) { $parts[2] } else { $null }
    $contentType = if ($parts.Count -ge 4) { $parts[3] } else { $null }

    $location = $null
    foreach ($line in ($headers -split "`r?`n")) {
      if ($line -match '^(?i)location:\s*(.+)$') {
        $location = $Matches[1].Trim()
      }
    }

    return [pscustomobject]@{
      ok = ($exitCode -eq 0)
      exit_code = $exitCode
      response_code = $responseCode
      effective_url = $effectiveUrl
      ssl_verify_result = $sslVerifyResult
      content_type = $contentType
      location = $location
      stderr = $stderr
      body_excerpt = (($body -replace '\s+', ' ').Trim())
    }
  }
  finally {
    Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
  }
}

function Resolve-DnsSummary {
  param([string]$Name)

  try {
    $records = @(Resolve-DnsName -Name $Name -ErrorAction Stop)
    $values = foreach ($record in $records) {
      if ($record.PSObject.Properties['IPAddress'] -and $record.IPAddress) {
        [string]$record.IPAddress
        continue
      }

      if ($record.PSObject.Properties['IP4Address'] -and $record.IP4Address) {
        [string]$record.IP4Address
        continue
      }

      if ($record.PSObject.Properties['IP6Address'] -and $record.IP6Address) {
        [string]$record.IP6Address
        continue
      }

      if ($record.PSObject.Properties['NameHost'] -and $record.NameHost) {
        [string]$record.NameHost
      }
    }

    return [pscustomobject]@{
      ok = $true
      values = @($values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
      error = $null
    }
  }
  catch {
    return [pscustomobject]@{
      ok = $false
      values = @()
      error = $_.Exception.Message
    }
  }
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$priorityRows = @((Read-JsonFile -Path $PriorityUrlsPath))
if ($priorityRows.Count -eq 0) {
  throw "Priority URL list is empty: $PriorityUrlsPath"
}

$canonicalUrls = @(
  'https://outsideinprint.org/',
  'https://outsideinprint.org/llms.txt',
  'https://outsideinprint.org/robots.txt',
  'https://outsideinprint.org/sitemap.xml'
)

$legacyUrls = @(
  'https://lpeasy.github.io/outsideinprint/',
  'https://lpeasy.github.io/outsideinprint/about/',
  'https://lpeasy.github.io/outsideinprint/authors/robert-v-ussley/',
  'https://lpeasy.github.io/outsideinprint/collections/risk-uncertainty/'
)

$prioritySample = @($priorityRows | Select-Object -First 3)
foreach ($row in $prioritySample) {
  $canonicalUrls += [string]$row.canonical_url
  $legacyUrls += [string]$row.legacy_url
}

$canonicalUrls = @($canonicalUrls | Select-Object -Unique)
$legacyUrls = @($legacyUrls | Select-Object -Unique)

$result = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  canonical_dns = [ordered]@{
    apex = Resolve-DnsSummary -Name 'outsideinprint.org'
    www = Resolve-DnsSummary -Name 'www.outsideinprint.org'
  }
  worksheet_summary = Get-WorksheetSummary -Path $WorksheetPath
  canonical_probes = @(
    foreach ($url in $canonicalUrls) {
      [pscustomobject]@{
        url = $url
        powershell = Invoke-PowerShellProbe -Url $url
        curl = Invoke-CurlProbe -Url $url
      }
    }
  )
  legacy_probes = @(
    foreach ($url in $legacyUrls) {
      [pscustomobject]@{
        url = $url
        curl_no_follow = Invoke-CurlProbe -Url $url -FollowRedirects:$false
        curl_follow = Invoke-CurlProbe -Url $url
      }
    }
  )
}

$canonicalPowerShellErrors = @($result.canonical_probes | ForEach-Object { [string]($_.powershell.error ?? '') })
$canonicalCurlErrors = @($result.canonical_probes | ForEach-Object { [string]($_.curl.stderr ?? '') })
$allCanonicalPowerShellFailed = @($result.canonical_probes | Where-Object { -not $_.powershell.ok }).Count -eq @($result.canonical_probes).Count
$allCanonicalPowerShellTlsFailed = @($canonicalPowerShellErrors | Where-Object { $_ -match 'SSL connection could not be established' }).Count -eq @($result.canonical_probes).Count
$allCanonicalCurlCredentialFailed = @($canonicalCurlErrors | Where-Object { $_ -match 'SEC_E_NO_CREDENTIALS|No credentials are available in the security package' }).Count -eq @($result.canonical_probes).Count
$localWindowsTlsCredentialsFailure = [bool]($allCanonicalPowerShellFailed -and $allCanonicalPowerShellTlsFailed -and $allCanonicalCurlCredentialFailed)
$result['client_environment'] = [ordered]@{
  local_windows_tls_credentials_failure = $localWindowsTlsCredentialsFailure
  interpretation = if ($localWindowsTlsCredentialsFailure) {
    'All canonical probes failed through the local Windows Schannel client with SEC_E_NO_CREDENTIALS. Treat this as local client evidence unless GitHub Actions or browser checks also fail.'
  } else {
    'No uniform local Windows Schannel credential failure detected.'
  }
}

$jsonPath = Join-Path $OutputDir 'host-diagnostics.json'
$markdownPath = Join-Path $OutputDir 'host-diagnostics.md'

Write-JsonFile -Path $jsonPath -Value $result

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# SEO Host Diagnostics')
$lines.Add('')
$lines.Add(('- Generated at: {0}' -f $result.generated_at))
$lines.Add('')
$lines.Add('## Client Environment')
$lines.Add('')
$lines.Add(('- Local Windows TLS credentials failure: {0}' -f $result.client_environment.local_windows_tls_credentials_failure))
$lines.Add(('- Interpretation: {0}' -f $result.client_environment.interpretation))
$lines.Add('')
$lines.Add('## DNS')
$lines.Add('')
$lines.Add('| Host | Status | Values | Error |')
$lines.Add('| --- | --- | --- | --- |')
$lines.Add(('| outsideinprint.org | {0} | {1} | {2} |' -f $(if ($result.canonical_dns.apex.ok) { 'ok' } else { 'error' }), (($result.canonical_dns.apex.values -join ', ') -replace '\|', '\|'), (([string]($result.canonical_dns.apex.error ?? '')) -replace '\|', '\|')))
$lines.Add(('| www.outsideinprint.org | {0} | {1} | {2} |' -f $(if ($result.canonical_dns.www.ok) { 'ok' } else { 'error' }), (($result.canonical_dns.www.values -join ', ') -replace '\|', '\|'), (([string]($result.canonical_dns.www.error ?? '')) -replace '\|', '\|')))
$lines.Add('')

if ($null -ne $result.worksheet_summary) {
  $lines.Add('## Rollout Worksheet Snapshot')
  $lines.Add('')
  $lines.Add(('- Priority rows: {0}' -f $result.worksheet_summary.total_rows))
  $lines.Add(('- Canonical live-smoke passed: {0}' -f $result.worksheet_summary.live_smoke_passed))
  $lines.Add(('- Canonical live-smoke failed: {0}' -f $result.worksheet_summary.live_smoke_failed))
  $lines.Add(('- Legacy redirects passed: {0}' -f $result.worksheet_summary.legacy_redirect_passed))
  $lines.Add(('- Legacy redirects failed: {0}' -f $result.worksheet_summary.legacy_redirect_failed))
  $lines.Add('')
}

$lines.Add('## Canonical Host Probes')
$lines.Add('')
$lines.Add('| URL | PowerShell | PowerShell error | curl exit | HTTP code | curl final URL | curl SSL verify | curl stderr |')
$lines.Add('| --- | --- | --- | ---: | ---: | --- | --- | --- |')
foreach ($probe in $result.canonical_probes) {
  $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} |' -f `
      ($probe.url -replace '\|', '\|'),
      $(if ($probe.powershell.ok) { 'ok' } else { 'fail' }),
      (([string]($probe.powershell.error ?? '')) -replace '\|', '\|'),
      ([string]($probe.curl.exit_code ?? '')),
      ([string]($probe.curl.response_code ?? '')),
      (([string]($probe.curl.effective_url ?? '')) -replace '\|', '\|'),
      (([string]($probe.curl.ssl_verify_result ?? '')) -replace '\|', '\|'),
      (([string]($probe.curl.stderr ?? '')) -replace '\|', '\|')))
}
$lines.Add('')

$lines.Add('## Legacy Host Probes')
$lines.Add('')
$lines.Add('| URL | First curl exit | First HTTP code | First location | Follow curl exit | Follow HTTP code | Follow final URL | Follow stderr |')
$lines.Add('| --- | ---: | ---: | --- | ---: | ---: | --- | --- |')
foreach ($probe in $result.legacy_probes) {
  $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} |' -f `
      ($probe.url -replace '\|', '\|'),
      ([string]($probe.curl_no_follow.exit_code ?? '')),
      ([string]($probe.curl_no_follow.response_code ?? '')),
      (([string]($probe.curl_no_follow.location ?? '')) -replace '\|', '\|'),
      ([string]($probe.curl_follow.exit_code ?? '')),
      ([string]($probe.curl_follow.response_code ?? '')),
      (([string]($probe.curl_follow.effective_url ?? '')) -replace '\|', '\|'),
      (([string]($probe.curl_follow.stderr ?? '')) -replace '\|', '\|')))
}
$lines.Add('')

$lines.Add('## Operator Notes')
$lines.Add('')
$lines.Add('- PowerShell failures here matter only if they reproduce in GitHub Actions or another clean client.')
$lines.Add('- `SEC_E_NO_CREDENTIALS` from local Windows Schannel points to this client environment, not automatically to bad site DNS or certificate setup.')
$lines.Add('- curl success with PowerShell failure usually points to a client-specific TLS or certificate-chain issue rather than a total host outage.')
$lines.Add('- Legacy URLs should end in matching `https://outsideinprint.org/...` paths, not a second live HTML surface.')

$lines -join "`r`n" | Out-File -FilePath $markdownPath -Encoding utf8

Write-Host "Wrote SEO host diagnostics to $OutputDir"
