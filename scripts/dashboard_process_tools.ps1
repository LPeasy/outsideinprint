Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsWindowsPlatform {
  return [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

function Get-EnvironmentEntryParts {
  param([object]$Entry)

  if ($Entry -is [System.Collections.DictionaryEntry]) {
    return [pscustomobject]@{
      Key = [string]$Entry.Key
      Value = [string]$Entry.Value
    }
  }

  if (($Entry -is [psobject]) -and $Entry.PSObject.Properties["Key"] -and $Entry.PSObject.Properties["Value"]) {
    return [pscustomobject]@{
      Key = [string]$Entry.Key
      Value = [string]$Entry.Value
    }
  }

  throw "Unsupported environment entry type '$($Entry.GetType().FullName)'."
}

function Merge-PathVariableValues {
  param(
    [string]$Existing,
    [string]$Incoming
  )

  $comparer = if (Test-IsWindowsPlatform) { [System.StringComparer]::OrdinalIgnoreCase } else { [System.StringComparer]::Ordinal }
  $seen = [System.Collections.Generic.HashSet[string]]::new($comparer)
  $segments = New-Object System.Collections.Generic.List[string]

  foreach ($value in @($Existing, $Incoming)) {
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }

    foreach ($segment in ($value -split [regex]::Escape([string][System.IO.Path]::PathSeparator))) {
      $trimmed = $segment.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
      }

      if ($seen.Add($trimmed)) {
        $segments.Add($trimmed)
      }
    }
  }

  return [string]::Join([string][System.IO.Path]::PathSeparator, $segments)
}

function ConvertTo-ProcessArgument {
  param([AllowEmptyString()][string]$Argument)

  if ($null -eq $Argument -or $Argument.Length -eq 0) {
    return '""'
  }

  if ($Argument -notmatch '[\s"]') {
    return $Argument
  }

  $builder = New-Object System.Text.StringBuilder
  $null = $builder.Append('"')
  $backslashCount = 0

  foreach ($char in $Argument.ToCharArray()) {
    if ($char -eq '\') {
      $backslashCount++
      continue
    }

    if ($char -eq '"') {
      if ($backslashCount -gt 0) {
        $null = $builder.Append(('\' * ($backslashCount * 2)))
        $backslashCount = 0
      }
      $null = $builder.Append('\"')
      continue
    }

    if ($backslashCount -gt 0) {
      $null = $builder.Append(('\' * $backslashCount))
      $backslashCount = 0
    }

    $null = $builder.Append($char)
  }

  if ($backslashCount -gt 0) {
    $null = $builder.Append(('\' * ($backslashCount * 2)))
  }

  $null = $builder.Append('"')
  return $builder.ToString()
}

function ConvertTo-ProcessArgumentString {
  param([string[]]$ArgumentList = @())

  return (@($ArgumentList | ForEach-Object { ConvertTo-ProcessArgument -Argument ([string]$_) }) -join ' ')
}

function New-DashboardScratchPath {
  param([string]$Prefix = "oip-dashboard")

  $safePrefix = if ([string]::IsNullOrWhiteSpace($Prefix)) { "oip-dashboard" } else { $Prefix.Trim() }
  return (Join-Path ([System.IO.Path]::GetTempPath()) ($safePrefix + "-" + [guid]::NewGuid().ToString("N")))
}

function Get-NormalizedChildEnvironment {
  param(
    [object[]]$SourceEntries,
    [object[]]$OverrideEntries = @()
  )

  if (-not $PSBoundParameters.ContainsKey("SourceEntries")) {
    $SourceEntries = @([System.Environment]::GetEnvironmentVariables().GetEnumerator())
  }

  $environment = [System.Collections.Specialized.OrderedDictionary]::new()

  foreach ($entry in @($SourceEntries) + @($OverrideEntries)) {
    if ($null -eq $entry) {
      continue
    }

    $parts = Get-EnvironmentEntryParts -Entry $entry
    if ([string]::IsNullOrWhiteSpace($parts.Key)) {
      continue
    }

    $normalizedKey = if ($parts.Key -ieq "PATH") { "Path" } else { $parts.Key }
    if ($normalizedKey -eq "Path" -and $environment.Contains("Path")) {
      $environment["Path"] = Merge-PathVariableValues -Existing ([string]$environment["Path"]) -Incoming $parts.Value
      continue
    }

    $environment[$normalizedKey] = $parts.Value
  }

  return $environment
}

function Get-DashboardBrowserCandidates {
  param([string[]]$AdditionalCandidates = @())

  $allCandidates = @($AdditionalCandidates) + @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  $comparer = [System.StringComparer]::OrdinalIgnoreCase
  $seen = [System.Collections.Generic.HashSet[string]]::new($comparer)
  $unique = New-Object System.Collections.Generic.List[string]

  foreach ($candidate in $allCandidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    if ($seen.Add($candidate)) {
      $unique.Add($candidate)
    }
  }

  return @($unique)
}

function Resolve-DashboardBrowserPath {
  param([string]$PreferredPath)

  $checked = New-Object System.Collections.Generic.List[string]
  $candidates = Get-DashboardBrowserCandidates -AdditionalCandidates @($PreferredPath)

  foreach ($candidate in $candidates) {
    $checked.Add($candidate)
    if (Test-Path -Path $candidate -PathType Leaf) {
      return [pscustomobject]@{
        Found = $true
        Path = $candidate
        CheckedPaths = @($checked)
      }
    }
  }

  return [pscustomobject]@{
    Found = $false
    Path = ""
    CheckedPaths = @($checked)
  }
}

function Test-DashboardBrowserHeadlessLaunch {
  param(
    [string]$BrowserPath,
    [string]$TargetUrl = "about:blank"
  )

  if ([string]::IsNullOrWhiteSpace($BrowserPath)) {
    throw "Test-DashboardBrowserHeadlessLaunch requires a BrowserPath."
  }

  $scratchRoot = New-DashboardScratchPath -Prefix "oip-dashboard-browser-probe"
  try {
    $userDataDir = Join-Path $scratchRoot "profile"
    $userDataParent = Split-Path -Parent $userDataDir
    if ($userDataParent -and -not (Test-Path $userDataParent)) {
      New-Item -ItemType Directory -Path $userDataParent -Force | Out-Null
    }

    $result = Invoke-CapturedProcess -FilePath $BrowserPath -ArgumentList @(
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-crash-reporter",
      "--disable-breakpad",
      "--allow-file-access-from-files",
      "--user-data-dir=$userDataDir",
      "--virtual-time-budget=5000",
      "--dump-dom",
      $TargetUrl
    )

    return [pscustomobject]@{
      Success = ($result.ExitCode -eq 0)
      ExitCode = $result.ExitCode
      StdOut = [string]$result.StdOut
      StdErr = [string]$result.StdErr
      UserDataDir = $userDataDir
    }
  }
  finally {
    if (Test-Path $scratchRoot) {
      Remove-Item -Recurse -Force $scratchRoot -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-CapturedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = (Get-Location).Path,
    [object[]]$EnvironmentEntries,
    [object[]]$EnvironmentOverrides = @()
  )

  if ([string]::IsNullOrWhiteSpace($FilePath)) {
    throw "Invoke-CapturedProcess requires a FilePath."
  }

  $processStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $processStartInfo.FileName = $FilePath
  $processStartInfo.WorkingDirectory = $WorkingDirectory
  $processStartInfo.UseShellExecute = $false
  $processStartInfo.CreateNoWindow = $true
  $processStartInfo.RedirectStandardOutput = $true
  $processStartInfo.RedirectStandardError = $true
  $processStartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $processStartInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

  if ($processStartInfo.PSObject.Properties.Name -contains "ArgumentList") {
    foreach ($argument in $ArgumentList) {
      $processStartInfo.ArgumentList.Add([string]$argument)
    }
  }
  else {
    $processStartInfo.Arguments = ConvertTo-ProcessArgumentString -ArgumentList $ArgumentList
  }

  $normalizedEnvironment = if ($PSBoundParameters.ContainsKey("EnvironmentEntries")) {
    Get-NormalizedChildEnvironment -SourceEntries $EnvironmentEntries -OverrideEntries $EnvironmentOverrides
  }
  else {
    Get-NormalizedChildEnvironment -OverrideEntries $EnvironmentOverrides
  }

  $processEnvironment = $null
  if (($processStartInfo.PSObject.Properties.Name -contains "Environment") -and $null -ne $processStartInfo.Environment) {
    $processEnvironment = $processStartInfo.Environment
  }
  else {
    $processEnvironment = $processStartInfo.EnvironmentVariables
  }

  $processEnvironment.Clear()
  foreach ($key in $normalizedEnvironment.Keys) {
    $processEnvironment[$key] = [string]$normalizedEnvironment[$key]
  }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $processStartInfo

  if (-not $process.Start()) {
    throw "Failed to start process '$FilePath'."
  }

  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout
    StdErr = $stderr
  }
}
