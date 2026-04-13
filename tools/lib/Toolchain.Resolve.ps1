Set-StrictMode -Version Latest

function Get-ToolDefinitionByName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Manifest,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $tool = $Manifest.tools | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if (-not $tool) {
        throw "Tool '$Name' not found in manifest."
    }

    return $tool
}

function Get-ToolInstallRoots {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $roots = [System.Collections.Generic.List[string]]::new()
    $pathsToCheck = @($Tool.install_path)
    if ($Tool.PSObject.Properties.Name.Contains("fallback_extract_path")) {
        $pathsToCheck += $Tool.fallback_extract_path
    }

    foreach ($pathValue in $pathsToCheck) {
        if (-not [string]::IsNullOrWhiteSpace($pathValue)) {
            $resolved = Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $pathValue
            if (-not $roots.Contains($resolved)) {
                $roots.Add($resolved)
            }
        }
    }

    return $roots.ToArray()
}

function Resolve-ToolExecutableFromRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $launchPath = Expand-ToolchainString -Value $Tool.launch_path
    if ([System.IO.Path]::IsPathRooted($launchPath)) {
        $candidate = [System.IO.Path]::GetFullPath($launchPath)
    } else {
        $candidate = [System.IO.Path]::GetFullPath((Join-Path -Path $InstallRoot -ChildPath $launchPath))
    }

    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return $candidate
    }

    $repoRelativeCandidate = Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $Tool.launch_path
    if (Test-Path -LiteralPath $repoRelativeCandidate -PathType Leaf) {
        return $repoRelativeCandidate
    }

    return $null
}

function Get-ExpandedMachineCandidates {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $candidates = [System.Collections.Generic.List[string]]::new()
    $rawCandidates = @()
    if ($Tool.PSObject.Properties.Name.Contains("machine_candidates")) {
        $rawCandidates = @($Tool.machine_candidates)
    }

    foreach ($candidate in $rawCandidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $expanded = Expand-ToolchainString -Value ([string]$candidate)
        if (Test-Path -LiteralPath $expanded -PathType Leaf) {
            $fullPath = [System.IO.Path]::GetFullPath($expanded)
            if (-not (Test-DisallowedShimPath -Path $fullPath)) {
                $candidates.Add($fullPath)
            }
        }
    }

    return $candidates.ToArray()
}

function Resolve-ToolExecutable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    foreach ($root in (Get-ToolInstallRoots -Tool $Tool -RepoRoot $RepoRoot)) {
        $candidate = Resolve-ToolExecutableFromRoot -Tool $Tool -InstallRoot $root -RepoRoot $RepoRoot
        if ($candidate) {
            return $candidate
        }
    }

    foreach ($candidate in (Get-ExpandedMachineCandidates -Tool $Tool)) {
        return $candidate
    }

    return $null
}

function Get-ToolRuntimeEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $map = @{}
    if ($Tool.PSObject.Properties.Name.Contains("env")) {
        foreach ($property in $Tool.env.PSObject.Properties) {
            $map[$property.Name] = [string](Expand-ToolchainString -Value $property.Value)
        }
    }

    return $map
}

function Get-ToolSourceCandidates {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($Tool.PSObject.Properties.Name.Contains("source_candidates")) {
        foreach ($candidate in (New-StringArray -InputObject $Tool.source_candidates)) {
            if (-not [string]::IsNullOrWhiteSpace($candidate)) {
                $candidates.Add([string]$candidate)
            }
        }
    } elseif ($Tool.PSObject.Properties.Name.Contains("source_url") -and -not [string]::IsNullOrWhiteSpace($Tool.source_url)) {
        $candidates.Add([string]$Tool.source_url)
    }

    return $candidates.ToArray()
}

function Get-ToolAssetName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    if ($Tool.PSObject.Properties.Name.Contains("asset_name") -and -not [string]::IsNullOrWhiteSpace($Tool.asset_name)) {
        return [string]$Tool.asset_name
    }

    $firstCandidate = (Get-ToolSourceCandidates -Tool $Tool | Select-Object -First 1)
    if (-not $firstCandidate) {
        throw "Tool '$($Tool.name)' does not provide a source_url or source_candidates entry for asset name resolution."
    }

    $expanded = Expand-ToolchainString -Value $firstCandidate
    if ($expanded.StartsWith("file:///", [System.StringComparison]::OrdinalIgnoreCase)) {
        return [System.IO.Path]::GetFileName(([uri]$expanded).LocalPath)
    }

    if ([System.IO.Path]::IsPathRooted($expanded) -or -not ($expanded -match '^[A-Za-z][A-Za-z0-9+.-]*://')) {
        return [System.IO.Path]::GetFileName($expanded)
    }

    return [System.IO.Path]::GetFileName(([uri]$expanded).AbsolutePath)
}

function Get-ToolWrapperDefinitions {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $definitions = [System.Collections.Generic.List[object]]::new()
    $seenNames = @{}

    if ($Tool.PSObject.Properties.Name.Contains("wrappers")) {
        foreach ($wrapper in @($Tool.wrappers)) {
            $normalized = Convert-ToToolWrapperDefinition -Tool $Tool -Wrapper $wrapper
            $definitions.Add($normalized)
            $seenNames[$normalized.name] = $true
        }
    }

    if (-not $seenNames.ContainsKey([string]$Tool.name)) {
        $definitions.Add((New-DefaultToolWrapperDefinition -Tool $Tool))
    }

    return $definitions.ToArray()
}

function Get-ToolWrapperDefinitionByName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$WrapperName
    )

    foreach ($definition in (Get-ToolWrapperDefinitions -Tool $Tool)) {
        if ($definition.name -eq $WrapperName) {
            return $definition
        }
    }

    throw "Wrapper '$WrapperName' not found for tool '$($Tool.name)'."
}

function New-DefaultToolWrapperDefinition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    return [pscustomobject]@{
        name             = [string]$Tool.name
        mode             = "direct"
        default_arguments = @()
        profile_strategy = "none"
        profile_subpath  = [string]$Tool.name
        isolate_appdata  = $false
        isolate_temp     = $false
        env              = @{}
        implicit         = $true
    }
}

function Convert-ToToolWrapperDefinition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Wrapper
    )

    $mode = if ($Wrapper.PSObject.Properties.Name.Contains("mode")) { [string]$Wrapper.mode } else { "direct" }
    $profileStrategy = if ($Wrapper.PSObject.Properties.Name.Contains("profile_strategy")) { [string]$Wrapper.profile_strategy } else { "none" }
    $profileSubpath = if ($Wrapper.PSObject.Properties.Name.Contains("profile_subpath")) { [string]$Wrapper.profile_subpath } else { [string]$Wrapper.name }
    $defaultArguments = @()
    if ($Wrapper.PSObject.Properties.Name.Contains("default_arguments")) {
        $defaultArguments = New-StringArray -InputObject $Wrapper.default_arguments
    }

    $envMap = @{}
    if ($Wrapper.PSObject.Properties.Name.Contains("env")) {
        $envMap = Convert-ObjectToHashtable -InputObject $Wrapper.env
    }

    return [pscustomobject]@{
        name              = [string]$Wrapper.name
        mode              = $mode
        default_arguments = $defaultArguments
        profile_strategy  = $profileStrategy
        profile_subpath   = $profileSubpath
        isolate_appdata   = ($Wrapper.PSObject.Properties.Name.Contains("isolate_appdata") -and [bool]$Wrapper.isolate_appdata)
        isolate_temp      = ($Wrapper.PSObject.Properties.Name.Contains("isolate_temp") -and [bool]$Wrapper.isolate_temp)
        env               = $envMap
        implicit          = $false
    }
}

function Invoke-ToolProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [hashtable]$Environment,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    $savedValues = @{}
    foreach ($entry in $Environment.GetEnumerator()) {
        $savedValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }

    $exitCode = 0
    try {
        Push-Location $WorkingDirectory
        $output = & $ExecutablePath @Arguments 2>&1
        if (Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue) {
            $exitCode = $global:LASTEXITCODE
        }
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output   = ($output | Out-String).Trim()
        }
    } finally {
        Pop-Location
        foreach ($entry in $savedValues.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
        }
    }
}

function Test-ToolValidation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $executablePath = Resolve-ToolExecutable -Tool $Tool -RepoRoot $RepoRoot
    if (-not $executablePath) {
        return [pscustomobject]@{
            Success = $false
            Path    = $null
            Message = "Unable to resolve executable for tool '$($Tool.name)'."
        }
    }

    $environment = Get-ToolRuntimeEnvironment -Tool $Tool
    $arguments = New-StringArray -InputObject $Tool.validate.arguments
    try {
        $processResult = Invoke-ToolProcess -ExecutablePath $executablePath -Arguments $arguments -Environment $environment -WorkingDirectory $RepoRoot
    } catch {
        return [pscustomobject]@{
            Success = $false
            Path    = $executablePath
            Message = "Validation command failed for tool '$($Tool.name)': $($_.Exception.Message)"
        }
    }

    if ($processResult.ExitCode -ne 0) {
        return [pscustomobject]@{
            Success = $false
            Path    = $executablePath
            Message = "Validation command failed for tool '$($Tool.name)' with exit code $($processResult.ExitCode)."
        }
    }

    $matchRegex = $null
    if ($Tool.validate.PSObject.Properties.Name.Contains("match_regex")) {
        $matchRegex = [string]$Tool.validate.match_regex
    }

    if ($matchRegex -and ($processResult.Output -notmatch $matchRegex)) {
        return [pscustomobject]@{
            Success = $false
            Path    = $executablePath
            Message = "Validation output did not match regex for tool '$($Tool.name)'."
        }
    }

    return [pscustomobject]@{
        Success = $true
        Path    = $executablePath
        Message = "Validation succeeded."
    }
}
