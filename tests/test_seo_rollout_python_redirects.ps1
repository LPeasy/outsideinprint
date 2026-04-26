Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$probeScriptPath = Join-Path $repoRoot 'scripts\probe_seo_rollout.ps1'
$diagnoseScriptPath = Join-Path $repoRoot 'scripts\diagnose_seo_hosts.ps1'

function Get-PythonCommand {
  $candidates = @()
  if ($IsWindows) {
    $candidates += (Join-Path $repoRoot 'tools/bin/generated/python.cmd')
  }

  $candidates += @(
    'py',
    'python',
    'python3',
    'python3.13',
    'python3.12',
    'python3.11'
  )

  foreach ($candidate in $candidates) {
    if ($candidate -match '[\\/]' -and -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }

    try {
      $null = & $candidate --version 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    }
    catch {
    }
  }

  throw 'Python 3 is required for the redirect fallback regression test.'
}

function Get-PythonProbeScript {
  param([string]$Path)

  $scriptText = Get-Content -Path $Path -Raw
  $match = [regex]::Match($scriptText, '(?s)\$script = @''\r?\n(?<body>.*?)\r?\n''@')
  if (-not $match.Success) {
    throw "Could not extract Python probe script from $Path."
  }

  return $match.Groups['body'].Value.Trim()
}

function Get-FunctionDefinition {
  param(
    [string]$Path,
    [string]$Name
  )

  $scriptText = Get-Content -Path $Path -Raw
  $lines = $scriptText -split "`r?`n"
  $startLine = -1
  for ($i = 0; $i -lt $lines.Length; $i++) {
    $lineWithoutComment = ($lines[$i] -split '#')[0].TrimStart()
    if ($lineWithoutComment -match "^function\s+$([regex]::Escape($Name))\b") {
      $startLine = $i
      break
    }
  }

  if ($startLine -lt 0) {
    throw "Could not extract function '$Name' from $Path."
  }

  $endLine = $lines.Length - 1
  for ($i = $startLine + 1; $i -lt $lines.Length; $i++) {
    $lineWithoutComment = ($lines[$i] -split '#')[0].TrimStart()
    if ($lineWithoutComment -match '^function\s+') {
      $endLine = $i - 1
      break
    }
  }

  return ($lines[$startLine..$endLine] -join [Environment]::NewLine)
}

function Invoke-EmbeddedPythonProbe {
  param(
    [string]$PythonCommand,
    [string]$ProbeScript,
    [string]$Url,
    [int]$RedirectLimit,
    [bool]$FollowRedirects
  )

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('seo-python-redirect-regress-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  try {
    $probePath = Join-Path $tempDir 'probe.py'
    $ProbeScript.TrimStart() | Out-File -FilePath $probePath -Encoding utf8

    $raw = & $PythonCommand $probePath $Url $RedirectLimit ($FollowRedirects.ToString().ToLowerInvariant()) 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Embedded Python probe failed: $($raw -join [Environment]::NewLine)"
    }

    return ($raw | ConvertFrom-Json)
  }
  finally {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
  }
}

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "Assertion failed: $Message"
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return $listener.LocalEndpoint.Port
  }
  finally {
    $listener.Stop()
  }
}

function New-TestRedirectServer {
  param(
    [string]$PythonCommand,
    [int]$Port
  )

  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('seo-redirect-server-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  $serverScriptPath = Join-Path $tempDir 'server.py'

  $serverScript = @"
import http.server
import socketserver


PORT = $Port


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/chain1':
            self.send_response(301)
            self.send_header('Location', '/chain2')
            self.end_headers()
        elif self.path == '/chain2':
            self.send_response(301)
            self.send_header('Location', '/chain3')
            self.end_headers()
        elif self.path == '/chain3':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'chain3')
        elif self.path == '/loop1':
            self.send_response(301)
            self.send_header('Location', '/loop2')
            self.end_headers()
        elif self.path == '/loop2':
            self.send_response(301)
            self.send_header('Location', '/loop1')
            self.end_headers()
        elif self.path == '/noloc':
            self.send_response(302)
            self.end_headers()
        elif self.path == '/final':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'ok')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return


with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
    httpd.serve_forever()
"@
  $serverScript | Out-File -FilePath $serverScriptPath -Encoding utf8
  $outPath = Join-Path $tempDir 'server.out'
  $errPath = Join-Path $tempDir 'server.err'
  $startProcessArguments = @{
    FilePath = $PythonCommand
    ArgumentList = @('-u', $serverScriptPath)
    PassThru = $true
    RedirectStandardOutput = $outPath
    RedirectStandardError = $errPath
  }

  if ($IsWindows) {
    $startProcessArguments['WindowStyle'] = 'Hidden'
  }

  $proc = Start-Process @startProcessArguments

  return [pscustomobject]@{
    Process = $proc
    TempDir = $tempDir
    StdOut = $outPath
    StdErr = $errPath
  }
}

$pythonCommand = Get-PythonCommand
$probeScripts = @(
  @{ Name = 'rollout'; Path = Get-PythonProbeScript -Path $probeScriptPath },
  @{ Name = 'diagnose'; Path = Get-PythonProbeScript -Path $diagnoseScriptPath }
)

$tlsClassifierDefinitions = @(
  @{ Name = 'probe'; Path = $probeScriptPath; ParamName = 'Message'; Alias = 'ProbeTlsClassifier' },
  @{ Name = 'diagnose'; Path = $diagnoseScriptPath; ParamName = 'Text'; Alias = 'DiagnoseTlsClassifier' }
)

$port = Get-FreeTcpPort
$baseUrl = "http://127.0.0.1:$port"

$server = New-TestRedirectServer -PythonCommand $pythonCommand -Port $port
try {
  $serverReady = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($server.Process.HasExited) {
      $stderr = if (Test-Path -LiteralPath $server.StdErr -PathType Leaf) { (Get-Content -Path $server.StdErr -Raw) } else { '' }
      throw "Local HTTP test server exited unexpectedly. Process stderr: $stderr"
    }

    try {
      $null = Invoke-WebRequest -Uri "$baseUrl/final" -UseBasicParsing -TimeoutSec 1
      $serverReady = $true
      break
    }
    catch {
      Start-Sleep -Milliseconds 200
    }
  }
  Assert-Condition -Condition $serverReady -Message "Local python redirect server started."

  foreach ($entry in $probeScripts) {
    $script = $entry.Path
    $result = Invoke-EmbeddedPythonProbe -PythonCommand $pythonCommand -ProbeScript $script -Url "$baseUrl/chain1" -RedirectLimit 1 -FollowRedirects $true
    Assert-Condition -Condition ((-not $result.ok) -and $result.error -eq 'redirect_limit_exceeded') "Python fallback from $($entry.Name) must report redirect_limit_exceeded."
    Assert-Condition -Condition ($result.redirect_count -eq 1) "Python fallback from $($entry.Name) must preserve redirect_count for limit exceed."
    Assert-Condition -Condition ($result.final_url -eq "$baseUrl/chain2") "Python fallback from $($entry.Name) must report failure URL at chain2."
    Assert-Condition -Condition @($result.redirect_history).Count -eq 1 "Python fallback from $($entry.Name) must preserve redirect_history for limit exceed."
    Assert-Condition -Condition ([int]$result.elapsed_ms -ge 0) "Python fallback from $($entry.Name) should report elapsed_ms."

    $result = Invoke-EmbeddedPythonProbe -PythonCommand $pythonCommand -ProbeScript $script -Url "$baseUrl/chain1" -RedirectLimit 2 -FollowRedirects $true
    Assert-Condition -Condition ($result.ok -and [int]$result.status_code -eq 200) "Python fallback from $($entry.Name) must follow redirects when within cap."
    Assert-Condition -Condition ($result.final_url -eq "$baseUrl/chain3") "Python fallback from $($entry.Name) should end at chain3."
    Assert-Condition -Condition ([int]$result.elapsed_ms -ge 0) "Python fallback from $($entry.Name) should report elapsed_ms."

    $result = Invoke-EmbeddedPythonProbe -PythonCommand $pythonCommand -ProbeScript $script -Url "$baseUrl/loop1" -RedirectLimit 10 -FollowRedirects $true
    Assert-Condition -Condition ((-not $result.ok) -and $result.error -eq 'redirect_loop_detected') "Python fallback from $($entry.Name) must report redirect_loop_detected."
    Assert-Condition -Condition ($result.redirect_count -eq 2) "Python fallback from $($entry.Name) must preserve loop redirect_count."
    Assert-Condition -Condition ($result.final_url -eq "$baseUrl/loop1") "Python fallback from $($entry.Name) must report current URL at loop detection."
    Assert-Condition -Condition @($result.redirect_history).Count -eq 2 "Python fallback from $($entry.Name) must preserve loop redirect_history."
    Assert-Condition -Condition ([int]$result.elapsed_ms -ge 0) "Python fallback from $($entry.Name) should report elapsed_ms."

    $result = Invoke-EmbeddedPythonProbe -PythonCommand $pythonCommand -ProbeScript $script -Url "$baseUrl/noloc" -RedirectLimit 2 -FollowRedirects $true
    Assert-Condition -Condition ((-not $result.ok) -and $result.error -eq 'redirect_missing_location') "Python fallback from $($entry.Name) must report redirect_missing_location."
    Assert-Condition -Condition ($result.redirect_count -eq 0) "Python fallback from $($entry.Name) must preserve redirect_count for missing location."
    Assert-Condition -Condition ($result.final_url -eq "$baseUrl/noloc") "Python fallback from $($entry.Name) must report current URL for missing location."
    Assert-Condition -Condition (@($result.redirect_history).Count -eq 0) "Python fallback from $($entry.Name) must preserve empty redirect_history for missing location."
    Assert-Condition -Condition ([int]$result.elapsed_ms -ge 0) "Python fallback from $($entry.Name) should report elapsed_ms."
  }

  foreach ($entry in $tlsClassifierDefinitions) {
    $definition = Get-FunctionDefinition -Path $entry.Path -Name 'Test-LocalTlsCredentialFailure'
    $definition = $definition -replace 'Test-LocalTlsCredentialFailure', $entry.Alias
    Invoke-Expression $definition

    $aliasName = $entry.Alias
    $paramName = $entry.ParamName
    $tlsPositive = @(
      'SSL connection could not be established',
      'SEC_E_NO_CREDENTIALS',
      'No credentials are available in the security package'
    )

    foreach ($case in $tlsPositive) {
      $args = @{}
      $args[$paramName] = $case
      $result = & $aliasName @args
      Assert-Condition -Condition ([bool]$result) -Message "TLS classifier $aliasName should match: $case"
    }

    $tlsNegative = @(
      'DNS name does not exist',
      'The operation timed out',
      'connection refused',
      'HTTP 500 Internal Server Error',
      'redirect_loop_detected'
    )
    foreach ($case in $tlsNegative) {
      $args = @{}
      $args[$paramName] = $case
      $result = & $aliasName @args
      Assert-Condition -Condition (-not ([bool]$result)) -Message "TLS classifier $aliasName should not match: $case"
    }
  }
}
finally {
  if ($server.Process -and -not $server.Process.HasExited) {
    Stop-Process -Id $server.Process.Id -Force
  }

  Remove-Item -Recurse -Force $server.TempDir -ErrorAction SilentlyContinue
}

Write-Host 'SEO rollout Python redirect and TLS fallback test passed.'
$global:LASTEXITCODE = 0
exit 0
