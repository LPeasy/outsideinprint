Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $repoRoot "scripts/dashboard_process_tools.ps1")

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Get-PowerShellExecutablePath {
  $processPath = (Get-Process -Id $PID).Path
  if (-not [string]::IsNullOrWhiteSpace($processPath)) {
    return $processPath
  }

  $command = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $command = Get-Command powershell -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Could not resolve a PowerShell executable path for process-launch regression testing."
}

$normalizedEnvironment = Get-NormalizedChildEnvironment -SourceEntries @(
  [pscustomobject]@{ Key = "PATH"; Value = "C:\Windows\System32;C:\Tools" },
  [pscustomobject]@{ Key = "Path"; Value = "C:\Tools;C:\Users\lawto\bin" },
  [pscustomobject]@{ Key = "TEMP"; Value = "C:\Temp" }
)

Assert-True ($normalizedEnvironment.Contains("Path")) "Expected PATH/Path collisions to normalize into a single Path entry."
Assert-True (-not $normalizedEnvironment.Contains("PATH")) "Expected normalized child environment not to retain a duplicate PATH entry."
Assert-True (($normalizedEnvironment["Path"] -split [regex]::Escape([string][System.IO.Path]::PathSeparator)).Count -eq 3) "Expected normalized Path value to merge unique segments from PATH and Path."
Assert-True ([string]$normalizedEnvironment["TEMP"] -eq "C:\Temp") "Expected non-path environment values to remain unchanged."

$powerShellPath = Get-PowerShellExecutablePath
$captured = Invoke-CapturedProcess -FilePath $powerShellPath -ArgumentList @(
  "-NoProfile",
  "-Command",
  "Write-Output 'dashboard stdout'; [Console]::Error.Write('dashboard stderr'); exit 7"
)

Assert-True ($captured.ExitCode -eq 7) "Expected captured process to preserve the child exit code."
Assert-True ($captured.StdOut -match "dashboard stdout") "Expected captured process to return stdout content."
Assert-True ($captured.StdErr -match "dashboard stderr") "Expected captured process to return stderr content."

$browserResolution = Resolve-DashboardBrowserPath -PreferredPath "C:\definitely-missing-browser.exe"
Assert-True ($browserResolution.CheckedPaths.Count -ge 1) "Expected browser resolution to report checked candidate paths."
Assert-True (-not $browserResolution.Found -or (Test-Path $browserResolution.Path -PathType Leaf)) "Expected browser resolution either to miss cleanly or return an existing file."

$scratchPath = New-DashboardScratchPath -Prefix "oip-dashboard-browser"
Assert-True ($scratchPath.StartsWith([System.IO.Path]::GetTempPath(), [System.StringComparison]::OrdinalIgnoreCase)) "Expected dashboard scratch paths to live under the system temp root."
Assert-True ($scratchPath -match 'oip-dashboard-browser-[0-9a-f]{32}$') "Expected dashboard scratch paths to include the requested prefix plus a GUID suffix."

$launchCheck = Test-DashboardBrowserHeadlessLaunch -BrowserPath $powerShellPath
Assert-True (-not $launchCheck.Success) "Expected a non-browser executable to fail the dashboard browser headless-launch probe."
Assert-True ($launchCheck.ExitCode -ne 0) "Expected a failed browser headless-launch probe to report a nonzero exit code."
Assert-True ($launchCheck.UserDataDir -match 'oip-dashboard-browser-probe-[0-9a-f]{32}\\profile$') "Expected browser headless-launch probes to report their scratch profile path."

Write-Host "Dashboard process tool tests passed."
$global:LASTEXITCODE = 0
exit 0
