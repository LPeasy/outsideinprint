Set-StrictMode -Version Latest

function Get-ToolchainRepoRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptRoot
    )

    return (Split-Path -Path $ScriptRoot -Parent)
}

function Get-SupportedToolchainSchemaVersions {
    [CmdletBinding()]
    param()

    return @("1.0", "1.1")
}

function Get-ReservedToolchainWrapperNames {
    [CmdletBinding()]
    param()

    return @(
        "invoke-tool",
        "activate-toolchain",
        "generate_tool_wrappers",
        "provision_toolchain",
        "validate_toolchain"
    )
}

function Expand-ToolchainString {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    return [Environment]::ExpandEnvironmentVariables($Value)
}

function Resolve-ToolchainPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $expanded = Expand-ToolchainString -Value $Path
    if ([System.IO.Path]::IsPathRooted($expanded)) {
        return [System.IO.Path]::GetFullPath($expanded)
    }

    return [System.IO.Path]::GetFullPath((Join-Path -Path $RepoRoot -ChildPath $expanded))
}

function Ensure-Directory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $Path -Force
    }
}

function Test-PathInsideRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Candidate
    )

    $resolvedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $resolvedCandidate = [System.IO.Path]::GetFullPath($Candidate)
    return $resolvedCandidate.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)
}

function Remove-WorkspaceItemStrict {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    if (-not (Test-PathInsideRoot -Root $RepoRoot -Candidate $TargetPath)) {
        throw "Refusing to delete outside repo root: $TargetPath"
    }

    if (Test-Path -LiteralPath $TargetPath) {
        Remove-Item -LiteralPath $TargetPath -Recurse -Force
    }
}

function Get-ToolLogPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $logRoot = Join-Path -Path $RepoRoot -ChildPath "tools\_install_logs"
    Ensure-Directory -Path $logRoot
    $safeName = ($Tool.name -replace '[^A-Za-z0-9._-]', '_')
    $safeVersion = ($Tool.version -replace '[^A-Za-z0-9._-]', '_')
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    return Join-Path -Path $logRoot -ChildPath "$timestamp-$safeName-$safeVersion.log"
}

function Write-ToolLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$LogPath,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $line = "[{0}] {1}" -f (Get-Date -Format "s"), $Message
    Add-Content -LiteralPath $LogPath -Value $line
    Write-Host $line
}

function Copy-DirectoryTree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Source path not found: $Source"
    }

    Ensure-Directory -Path (Split-Path -Path $Destination -Parent)
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Get-ToolCacheRoot {
    [CmdletBinding()]
    param()

    if ([string]::IsNullOrWhiteSpace($env:CODEX_TOOLCACHE)) {
        return $null
    }

    return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($env:CODEX_TOOLCACHE))
}

function Get-ToolCachePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $cacheRoot = Get-ToolCacheRoot
    if (-not $cacheRoot) {
        return $null
    }

    $safeName = ($Tool.name -replace '[^A-Za-z0-9._-]', '_')
    $safeVersion = ($Tool.version -replace '[^A-Za-z0-9._-]', '_')
    return Join-Path -Path $cacheRoot -ChildPath "$safeName\$safeVersion"
}

function Test-DisallowedShimPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $expanded = [System.IO.Path]::GetFullPath($Path)
    return $expanded -like "*\AppData\Local\Microsoft\WindowsApps\*"
}

function Get-SystemPowerShellPath {
    [CmdletBinding()]
    param()

    return [System.IO.Path]::GetFullPath((Join-Path -Path $env:SystemRoot -ChildPath "System32\WindowsPowerShell\v1.0\powershell.exe"))
}

function Get-DownloaderCommand {
    [CmdletBinding()]
    param()

    $curlCandidate = Join-Path -Path $env:SystemRoot -ChildPath "System32\curl.exe"
    if (Test-Path -LiteralPath $curlCandidate -PathType Leaf) {
        return $curlCandidate
    }

    return $null
}

function Convert-ToFileUri {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return ([System.Uri]([System.IO.Path]::GetFullPath($Path))).AbsoluteUri
}

function Get-GeneratedWrapperRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    return Join-Path -Path $RepoRoot -ChildPath "tools\bin\generated"
}

function Get-CustomWrapperRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    return Join-Path -Path $RepoRoot -ChildPath "tools\bin\custom"
}

function Get-ToolchainWorkRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    return Join-Path -Path $RepoRoot -ChildPath "tools\_work"
}

function Get-WrapperProfileRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$ProfileSubpath
    )

    return Join-Path -Path (Get-ToolchainWorkRoot -RepoRoot $RepoRoot) -ChildPath ("profiles\{0}" -f $ProfileSubpath)
}

function Get-WrapperAppDataRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$WrapperName
    )

    return Join-Path -Path (Get-ToolchainWorkRoot -RepoRoot $RepoRoot) -ChildPath ("appdata\{0}" -f $WrapperName)
}

function Get-WrapperTempRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$WrapperName
    )

    return Join-Path -Path (Get-ToolchainWorkRoot -RepoRoot $RepoRoot) -ChildPath ("temp\{0}" -f $WrapperName)
}

function New-StringArray {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$InputObject
    )

    $values = [System.Collections.Generic.List[string]]::new()
    foreach ($value in @($InputObject)) {
        if ($null -ne $value) {
            $values.Add([string]$value)
        }
    }

    return $values.ToArray()
}

function Convert-ObjectToHashtable {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$InputObject
    )

    $map = @{}
    if ($null -eq $InputObject) {
        return $map
    }

    foreach ($property in $InputObject.PSObject.Properties) {
        $map[$property.Name] = [string]$property.Value
    }

    return $map
}
