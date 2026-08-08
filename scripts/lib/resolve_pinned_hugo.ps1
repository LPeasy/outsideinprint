Set-StrictMode -Version Latest

function Resolve-OipPinnedHugo {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [string]$ExpectedVersion = '0.164.0'
  )

  $isWindowsHost = [System.IO.Path]::DirectorySeparatorChar -eq '\'
  $command = $null
  $source = $null

  if ($isWindowsHost) {
    $wrapper = Join-Path $RepoRoot 'tools\bin\generated\hugo.cmd'
    if (Test-Path -LiteralPath $wrapper -PathType Leaf) {
      $command = $wrapper
      $source = 'repo-wrapper'
    }
  }
  else {
    $resolved = Get-Command hugo -CommandType Application -ErrorAction SilentlyContinue
    if ($resolved) {
      $command = $resolved.Source
      $source = 'path-non-windows'
    }
  }

  if ([string]::IsNullOrWhiteSpace($command)) {
    return [pscustomobject]@{
      Available = $false
      Command = $null
      Version = $null
      Source = $source
      Reason = if ($isWindowsHost) { 'repo-local Hugo wrapper is missing' } else { 'Hugo is not available in PATH on this non-Windows host' }
    }
  }

  try {
    $global:LASTEXITCODE = 0
    $version = ((& $command version 2>&1) | Out-String).Trim()
    $exitCode = $global:LASTEXITCODE
  }
  catch {
    return [pscustomobject]@{
      Available = $false
      Command = $command
      Version = $null
      Source = $source
      Reason = "Hugo version check failed: $($_.Exception.Message)"
    }
  }

  if ($exitCode -ne 0 -or $version -notmatch "^hugo v$([regex]::Escape($ExpectedVersion)).*\+extended") {
    return [pscustomobject]@{
      Available = $false
      Command = $command
      Version = $version
      Source = $source
      Reason = "expected Hugo Extended $ExpectedVersion, got: $version"
    }
  }

  return [pscustomobject]@{
    Available = $true
    Command = $command
    Version = $version
    Source = $source
    Reason = ''
  }
}
