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

function Get-WebResponseFinalUrl {
  param(
    [object]$Response,
    [string]$FallbackUrl
  )

  try {
    if ($Response.BaseResponse.ResponseUri) {
      return [string]$Response.BaseResponse.ResponseUri.AbsoluteUri
    }
  }
  catch {
  }

  try {
    if ($Response.BaseResponse.RequestMessage.RequestUri) {
      return [string]$Response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
    }
  }
  catch {
  }

  return $FallbackUrl
}

function Get-TextValue {
  param([object]$Value)

  if ($null -eq $Value) {
    return ''
  }

  return [string]$Value
}

function Test-LocalTlsCredentialFailure {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $false
  }

  return [string]$Text -match '(?i)SEC_E_NO_CREDENTIALS|No credentials are available in the security package|SSL connection could not be established'
}

function Invoke-PowerShellProbe {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -MaximumRedirection 5
    return [pscustomobject]@{
      ok = $true
      status_code = [int]$response.StatusCode
      final_url = Get-WebResponseFinalUrl -Response $response -FallbackUrl $Url
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
    $stderrContent = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Path $stderrPath -Raw } else { '' }
    $headerContent = if (Test-Path -LiteralPath $headerPath) { Get-Content -Path $headerPath -Raw } else { '' }
    $bodyContent = if (Test-Path -LiteralPath $bodyPath) { Get-Content -Path $bodyPath -Raw } else { '' }
    $stderr = if ($null -ne $stderrContent) { ([string]$stderrContent).Trim() } else { '' }
    $headers = if ($null -ne $headerContent) { [string]$headerContent } else { '' }
    $body = if ($null -ne $bodyContent) { [string]$bodyContent } else { '' }

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

function Get-PythonCommand {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $candidates = @(
    (Join-Path $repoRoot 'tools/bin/generated/python.cmd'),
    'python',
    'python3',
    'py'
  )

  foreach ($candidate in $candidates) {
    try {
      if ($candidate -match '[\\/]' -and -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        continue
      }

      $null = & $candidate --version 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    }
    catch {
    }
  }

  return $null
}

function Invoke-PythonProbe {
  param(
    [string]$Url,
    [int]$RedirectLimit = 5,
    [switch]$FollowRedirects = $true
  )

  $pythonCommand = Get-PythonCommand
  if ([string]::IsNullOrWhiteSpace($pythonCommand)) {
    return [pscustomobject]@{
      ok = $false
      status_code = $null
      final_url = $null
      location = $null
      content_type = $null
      error = 'Python fallback client is unavailable.'
      body_excerpt = ''
    }
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('seo-host-python-diagnostics-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $scriptPath = Join-Path $tempRoot 'probe.py'
  $script = @'
import json
import sys
import time
import urllib.error
import urllib.request
import urllib.parse

url = sys.argv[1]
redirect_limit = int(sys.argv[2])
follow_redirects = sys.argv[3].lower() == "true"


class RedirectFailure(Exception):
    def __init__(self, error, current_url, redirect_count, redirect_history):
        super().__init__(error)
        self.error = error
        self.current_url = current_url
        self.redirect_count = redirect_count
        self.redirect_history = list(redirect_history)

class RedirectLimitExceeded(RedirectFailure):
    pass

class RedirectLoop(RedirectFailure):
    pass

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def open_once(opener, request_url):
    request = urllib.request.Request(request_url, headers={"User-Agent": "OutsideInPrintSEOProbe/1.0"})
    try:
        response = opener.open(request, timeout=25)
        try:
            body = response.read(5000).decode("utf-8", errors="replace")
            return {
                "ok": getattr(response, "status", response.getcode()) < 400,
                "status_code": getattr(response, "status", response.getcode()),
                "final_url": response.geturl(),
                "location": response.headers.get("location"),
                "content_type": response.headers.get("content-type"),
                "error": "",
                "body_excerpt": " ".join(body.split()),
            }
        finally:
            response.close()
    except urllib.error.HTTPError as exc:
        body = exc.read(5000).decode("utf-8", errors="replace")
        return {
            "ok": exc.code < 400,
            "status_code": exc.code,
            "final_url": exc.geturl(),
            "location": exc.headers.get("location"),
            "content_type": exc.headers.get("content-type"),
            "error": "" if exc.code < 400 else str(exc),
            "body_excerpt": " ".join(body.split()),
        }


def normalize_redirect_url(current_url, location, redirect_count, redirect_history):
    if not location:
        raise RedirectLimitExceeded(
            "redirect_missing_location",
            current_url,
            redirect_count,
            redirect_history,
        )
    return urllib.parse.urljoin(current_url, location)


def probe_url(url, redirect_limit, follow_redirects):
    opener = urllib.request.build_opener(
        urllib.request.HTTPHandler(),
        urllib.request.HTTPSHandler(),
        NoRedirectHandler()
    )
    redirect_count = 0
    redirect_history = []
    visited = set()
    current_url = url

    while True:
        response = open_once(opener, current_url)
        status_code = response.get("status_code", 0)
        location = response.get("location")
        response["redirect_count"] = redirect_count
        response["redirect_history"] = redirect_history

        if not follow_redirects:
            return response

        if status_code < 300 or status_code >= 400:
            return response

        if redirect_count >= redirect_limit:
            raise RedirectLimitExceeded("redirect_limit_exceeded", current_url, redirect_count, redirect_history)

        resolved_location = normalize_redirect_url(current_url, location, redirect_count, redirect_history)
        hop = "{0} -> {1}".format(current_url, resolved_location)

        if resolved_location in visited:
            raise RedirectLoop(
                "redirect_loop_detected",
                resolved_location,
                redirect_count + 1,
                redirect_history + [hop],
            )

        visited.add(current_url)
        redirect_count += 1
        response["redirect_count"] = redirect_count
        redirect_history.append(hop)
        current_url = resolved_location


def make_failure_payload(current_url, error, redirect_count, redirect_history):
    return {
        "ok": False,
        "status_code": 0,
        "final_url": current_url,
        "location": None,
        "content_type": None,
        "error": error,
        "body_excerpt": "",
        "redirect_count": redirect_count,
        "redirect_history": redirect_history,
    }


start = time.time()
try:
    payload = probe_url(url, redirect_limit, follow_redirects)
except RedirectFailure as exc:
    payload = make_failure_payload(exc.current_url, exc.error, exc.redirect_count, exc.redirect_history)
except Exception as exc:
    payload = make_failure_payload(url, "probe_error: {0}".format(str(exc)), 0, [])
payload["elapsed_ms"] = int((time.time() - start) * 1000)
print(json.dumps(payload))
'@

  try {
    $script | Out-File -FilePath $scriptPath -Encoding utf8
    $raw = @(& $pythonCommand $scriptPath $Url $RedirectLimit ([string]([bool]$FollowRedirects)).ToLowerInvariant() 2>&1)
    if ($LASTEXITCODE -ne 0) {
      return [pscustomobject]@{
        ok = $false
        status_code = $null
        final_url = $null
        location = $null
        content_type = $null
        error = (($raw | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
        body_excerpt = ''
      }
    }

    $payload = Convert-JsonDocument -Json (($raw | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
    return [pscustomobject]@{
      ok = [bool]$payload.ok
      status_code = [int]$payload.status_code
      final_url = [string]$payload.final_url
      location = [string]$payload.location
      content_type = [string]$payload.content_type
      error = [string]$payload.error
      body_excerpt = [string]$payload.body_excerpt
      redirect_count = [int]$payload.redirect_count
      redirect_history = @($payload.redirect_history)
      elapsed_ms = [int]$payload.elapsed_ms
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
$maxRedirects = 5

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
        python = Invoke-PythonProbe -Url $url -RedirectLimit $maxRedirects
      }
    }
  )
  legacy_probes = @(
    foreach ($url in $legacyUrls) {
      [pscustomobject]@{
        url = $url
        curl_no_follow = Invoke-CurlProbe -Url $url -FollowRedirects:$false
        curl_follow = Invoke-CurlProbe -Url $url
        python_no_follow = Invoke-PythonProbe -Url $url -RedirectLimit $maxRedirects -FollowRedirects:$false
        python_follow = Invoke-PythonProbe -Url $url -RedirectLimit $maxRedirects
      }
    }
  )
}

$canonicalPowerShellErrors = @($result.canonical_probes | ForEach-Object { Get-TextValue -Value $_.powershell.error })
$canonicalPythonErrors = @($result.canonical_probes | ForEach-Object { Get-TextValue -Value $_.python.error })
$canonicalCurlErrors = @($result.canonical_probes | ForEach-Object { Get-TextValue -Value $_.curl.stderr })
$allCanonicalPowerShellFailed = @($result.canonical_probes | Where-Object { -not $_.powershell.ok }).Count -eq @($result.canonical_probes).Count
$allCanonicalPowerShellTlsFailed = @($canonicalPowerShellErrors | Where-Object { Test-LocalTlsCredentialFailure -Text $_ }).Count -eq @($result.canonical_probes).Count
$allCanonicalPythonTlsFailed = @($canonicalPythonErrors | Where-Object { Test-LocalTlsCredentialFailure -Text $_ }).Count -eq @($result.canonical_probes).Count
$allCanonicalCurlCredentialFailed = @($canonicalCurlErrors | Where-Object { Test-LocalTlsCredentialFailure -Text $_ }).Count -eq @($result.canonical_probes).Count
$localWindowsTlsCredentialsFailure = [bool]($allCanonicalPowerShellFailed -and $allCanonicalPowerShellTlsFailed -and ($allCanonicalCurlCredentialFailed -or $allCanonicalPythonTlsFailed))
$result['client_environment'] = [ordered]@{
  local_windows_tls_credentials_failure = $localWindowsTlsCredentialsFailure
  python_canonical_success_count = @($result.canonical_probes | Where-Object { $_.python.ok -and [int]$_.python.status_code -eq 200 }).Count
  python_legacy_full_path_301_count = @($result.legacy_probes | Where-Object { [int]$_.python_no_follow.status_code -eq 301 -and ([string]$_.python_no_follow.location).StartsWith('https://outsideinprint.org/', [System.StringComparison]::OrdinalIgnoreCase) }).Count
  interpretation = if ($localWindowsTlsCredentialsFailure) {
    'All canonical probes failed through the local Windows Schannel client with SEC_E_NO_CREDENTIALS. Compare the Python probe columns before treating this as site failure.'
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
$lines.Add(('- Python canonical successes: {0}' -f $result.client_environment.python_canonical_success_count))
$lines.Add(('- Python legacy full-path 301s: {0}' -f $result.client_environment.python_legacy_full_path_301_count))
$lines.Add(('- Interpretation: {0}' -f $result.client_environment.interpretation))
$lines.Add('')
$lines.Add('## DNS')
$lines.Add('')
$lines.Add('| Host | Status | Values | Error |')
$lines.Add('| --- | --- | --- | --- |')
$lines.Add(('| outsideinprint.org | {0} | {1} | {2} |' -f $(if ($result.canonical_dns.apex.ok) { 'ok' } else { 'error' }), (($result.canonical_dns.apex.values -join ', ') -replace '\|', '\|'), ((Get-TextValue -Value $result.canonical_dns.apex.error) -replace '\|', '\|')))
$lines.Add(('| www.outsideinprint.org | {0} | {1} | {2} |' -f $(if ($result.canonical_dns.www.ok) { 'ok' } else { 'error' }), (($result.canonical_dns.www.values -join ', ') -replace '\|', '\|'), ((Get-TextValue -Value $result.canonical_dns.www.error) -replace '\|', '\|')))
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
$lines.Add('| URL | PowerShell | PowerShell error | curl exit | curl HTTP | curl final URL | Python HTTP | Python final URL | Python error |')
$lines.Add('| --- | --- | --- | ---: | ---: | --- | ---: | --- | --- |')
foreach ($probe in $result.canonical_probes) {
  $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} | {8} |' -f `
      ($probe.url -replace '\|', '\|'),
      $(if ($probe.powershell.ok) { 'ok' } else { 'fail' }),
      ((Get-TextValue -Value $probe.powershell.error) -replace '\|', '\|'),
      (Get-TextValue -Value $probe.curl.exit_code),
      (Get-TextValue -Value $probe.curl.response_code),
      ((Get-TextValue -Value $probe.curl.effective_url) -replace '\|', '\|'),
      (Get-TextValue -Value $probe.python.status_code),
      ((Get-TextValue -Value $probe.python.final_url) -replace '\|', '\|'),
      ((Get-TextValue -Value $probe.python.error) -replace '\|', '\|')))
}
$lines.Add('')

$lines.Add('## Legacy Host Probes')
$lines.Add('')
$lines.Add('| URL | First curl HTTP | First curl location | Python first HTTP | Python first location | Python follow HTTP | Python follow final URL | curl stderr |')
$lines.Add('| --- | ---: | --- | ---: | --- | ---: | --- | --- |')
foreach ($probe in $result.legacy_probes) {
  $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} |' -f `
      ($probe.url -replace '\|', '\|'),
      (Get-TextValue -Value $probe.curl_no_follow.response_code),
      ((Get-TextValue -Value $probe.curl_no_follow.location) -replace '\|', '\|'),
      (Get-TextValue -Value $probe.python_no_follow.status_code),
      ((Get-TextValue -Value $probe.python_no_follow.location) -replace '\|', '\|'),
      (Get-TextValue -Value $probe.python_follow.status_code),
      ((Get-TextValue -Value $probe.python_follow.final_url) -replace '\|', '\|'),
      ((Get-TextValue -Value $probe.curl_follow.stderr) -replace '\|', '\|')))
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
