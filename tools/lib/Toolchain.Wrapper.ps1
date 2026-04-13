Set-StrictMode -Version Latest

. (Join-Path -Path $PSScriptRoot -ChildPath "Toolchain.Common.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "Toolchain.Manifest.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "Toolchain.Resolve.ps1")

function Invoke-StableToolWrapper {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$ToolName,
        [AllowNull()]
        [string]$WrapperName,
        [AllowNull()]
        [object]$WrapperArguments
    )

    $WrapperArguments = @(New-StringArray -InputObject $WrapperArguments)

    $manifest = Get-ToolchainManifest -ManifestPath "tools/toolchain.manifest.json" -RepoRoot $RepoRoot
    $tool = Get-ToolDefinitionByName -Manifest $manifest -Name $ToolName

    if ([string]::IsNullOrWhiteSpace($WrapperName)) {
        $WrapperName = [string]$Tool.name
    }

    if ($WrapperArguments.Count -gt 0 -and $WrapperArguments[0] -eq "--toolchain-which") {
        $resolved = Resolve-ToolExecutable -Tool $tool -RepoRoot $RepoRoot
        if (-not $resolved) {
            throw "Unable to resolve executable for '$ToolName'."
        }
        Write-Output $resolved
        return
    }

    if ($WrapperArguments.Count -gt 0 -and $WrapperArguments[0] -eq "--toolchain-validate") {
        $result = Test-ToolValidation -Tool $tool -RepoRoot $RepoRoot
        if (-not $result.Success) {
            throw $result.Message
        }
        Write-Output ("{0} -> {1}" -f $ToolName, $result.Path)
        return
    }

    $resolvedPath = Resolve-ToolExecutable -Tool $tool -RepoRoot $RepoRoot
    if (-not $resolvedPath) {
        throw "Unable to resolve executable for '$ToolName'. Run tools\\generate_tool_wrappers.cmd, then tools\\provision_toolchain.cmd, or update machine_candidates."
    }

    $wrapper = Get-ToolWrapperDefinitionByName -Tool $tool -WrapperName $WrapperName
    $profile = Get-WrapperProfileContext -RepoRoot $RepoRoot -Tool $tool -Wrapper $wrapper
    $environment = Get-WrapperEnvironment -Tool $tool -Wrapper $wrapper -RepoRoot $RepoRoot -ProfileContext $profile
    $launchArguments = Get-WrapperArguments -Wrapper $wrapper -Arguments $WrapperArguments -RepoRoot $RepoRoot -ProfileContext $profile

    $savedValues = @{}
    foreach ($entry in $environment.GetEnumerator()) {
        $savedValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }

    $exitCode = 0
    try {
        & $resolvedPath @launchArguments
        if (Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue) {
            $exitCode = $global:LASTEXITCODE
        }
    } finally {
        foreach ($entry in $savedValues.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
        }
    }

    if ($exitCode -ne 0) {
        exit $exitCode
    }
}

function Get-WrapperProfileContext {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Wrapper
    )

    if ($Wrapper.profile_strategy -ne "repo-local") {
        return @{
            ProfileDir = $null
            ProfileUri = $null
        }
    }

    $profileDir = Get-WrapperProfileRoot -RepoRoot $RepoRoot -ProfileSubpath ([string]$Wrapper.profile_subpath)
    Ensure-Directory -Path $profileDir
    return @{
        ProfileDir = [System.IO.Path]::GetFullPath($profileDir)
        ProfileUri = Convert-ToFileUri -Path $profileDir
    }
}

function Expand-WrapperTemplate {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [string]$Value,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$ProfileContext
    )

    $expanded = Expand-ToolchainString -Value $Value
    if ([string]::IsNullOrWhiteSpace($expanded)) {
        return $expanded
    }

    if ($ProfileContext.ContainsKey("ProfileDir") -and $ProfileContext["ProfileDir"]) {
        $expanded = $expanded.Replace("{profile_dir}", [string]$ProfileContext["ProfileDir"])
    }

    if ($ProfileContext.ContainsKey("ProfileUri") -and $ProfileContext["ProfileUri"]) {
        $expanded = $expanded.Replace("{profile_uri}", [string]$ProfileContext["ProfileUri"])
    }

    return $expanded.Replace("{repo_root}", $RepoRoot)
}

function Get-WrapperEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Wrapper,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$ProfileContext
    )

    $environment = Get-ToolRuntimeEnvironment -Tool $Tool
    foreach ($entry in $Wrapper.env.GetEnumerator()) {
        $environment[$entry.Key] = Expand-WrapperTemplate -Value ([string]$entry.Value) -RepoRoot $RepoRoot -ProfileContext $ProfileContext
    }

    if ($Wrapper.profile_strategy -eq "repo-local" -and $ProfileContext["ProfileDir"]) {
        $profileDir = [string]$ProfileContext["ProfileDir"]
        $environment["USERPROFILE"] = $profileDir

        if ($Wrapper.isolate_appdata) {
            $appDataRoot = Get-WrapperAppDataRoot -RepoRoot $RepoRoot -WrapperName ([string]$Wrapper.name)
            $localAppData = Join-Path -Path $appDataRoot -ChildPath "Local"
            $roamingAppData = Join-Path -Path $appDataRoot -ChildPath "Roaming"
            Ensure-Directory -Path $localAppData
            Ensure-Directory -Path $roamingAppData
            $environment["LOCALAPPDATA"] = $localAppData
            $environment["APPDATA"] = $roamingAppData
        }

        if ($Wrapper.isolate_temp) {
            $tempRoot = Get-WrapperTempRoot -RepoRoot $RepoRoot -WrapperName ([string]$Wrapper.name)
            Ensure-Directory -Path $tempRoot
            $environment["TEMP"] = $tempRoot
            $environment["TMP"] = $tempRoot
        }
    }

    return $environment
}

function Get-WrapperArguments {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Wrapper,
        [AllowNull()]
        [object]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$ProfileContext
    )

    $Arguments = @(New-StringArray -InputObject $Arguments)
    $allArguments = [System.Collections.Generic.List[string]]::new()
    foreach ($argument in $Wrapper.default_arguments) {
        $allArguments.Add((Expand-WrapperTemplate -Value ([string]$argument) -RepoRoot $RepoRoot -ProfileContext $ProfileContext))
    }

    foreach ($argument in $Arguments) {
        $allArguments.Add((Expand-WrapperTemplate -Value ([string]$argument) -RepoRoot $RepoRoot -ProfileContext $ProfileContext))
    }

    return $allArguments.ToArray()
}
