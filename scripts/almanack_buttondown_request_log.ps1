# Local request evidence only. Never store authentication headers or retry here.
function New-AlmanackRequestLog {
  param([Parameter(Mandatory = $true)][string] $Directory)
  $null = [System.IO.Directory]::CreateDirectory($Directory)
  $path = Join-Path $Directory ("buttondown-requests-" + [guid]::NewGuid().ToString('N') + '.jsonl')
  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
  $stream.Dispose()
  return $path
}

function Write-AlmanackRequestEvent {
  param(
    [AllowNull()][string] $Path,
    [ValidateSet('started', 'completed', 'failed')][string] $Stage,
    [string] $Method,
    [string] $Url,
    [AllowNull()][string] $IdempotencyKey,
    [AllowNull()][object] $JsonBody,
    [AllowNull()][object] $HttpStatus = $null
  )
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $digest = $null
  if ($null -ne $JsonBody) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes([string] $JsonBody)
      $digest = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $sha.Dispose() }
  }
  $record = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    stage = $Stage
    method = $Method.ToUpperInvariant()
    url = $Url
    idempotency_key = $(if ([string]::IsNullOrWhiteSpace($IdempotencyKey)) { $null } else { $IdempotencyKey })
    body_sha256 = $digest
    http_status = $(if ([string]::IsNullOrWhiteSpace([string] $HttpStatus)) { $null } else { [int] $HttpStatus })
  }
  $line = ($record | ConvertTo-Json -Compress) + "`n"
  [System.IO.File]::AppendAllText($Path, $line, [System.Text.UTF8Encoding]::new($false))
}
