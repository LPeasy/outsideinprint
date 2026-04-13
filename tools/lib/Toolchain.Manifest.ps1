Set-StrictMode -Version Latest

function Test-ManifestObjectValue {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return $false
    }

    if ($Value -is [string] -or $Value -is [ValueType] -or $Value -is [System.Array]) {
        return $false
    }

    return $true
}

function Test-ManifestStringArrayField {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ToolName,
        [Parameter(Mandatory = $true)]
        [string]$FieldName,
        [AllowNull()]
        [object]$Value
    )

    if ($Value -isnot [System.Array]) {
        throw "Tool '$ToolName' field '$FieldName' must be an array of strings."
    }

    $values = @(New-StringArray -InputObject $Value)
    if ($values.Count -eq 0) {
        throw "Tool '$ToolName' field '$FieldName' must contain at least one entry."
    }

    foreach ($entry in $values) {
        if ([string]::IsNullOrWhiteSpace($entry)) {
            throw "Tool '$ToolName' field '$FieldName' cannot contain empty entries."
        }
    }
}

function Get-ToolchainManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ManifestPath,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $resolvedPath = Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $ManifestPath
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "Manifest not found: $resolvedPath"
    }

    $manifest = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
    Test-ToolchainManifest -Manifest $manifest
    return $manifest
}

function Test-ToolchainManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Manifest
    )

    $requiredTopLevel = @("schema_version", "platform", "cache_strategy", "tools")
    foreach ($field in $requiredTopLevel) {
        if (-not $Manifest.PSObject.Properties.Name.Contains($field)) {
            throw "Manifest missing required top-level field: $field"
        }
    }

    $schemaVersion = [string]$Manifest.schema_version
    if ((Get-SupportedToolchainSchemaVersions) -notcontains $schemaVersion) {
        throw "Unsupported schema_version '$schemaVersion'. Supported versions: $((Get-SupportedToolchainSchemaVersions) -join ', ')."
    }

    if (($Manifest.platform -isnot [string]) -or [string]::IsNullOrWhiteSpace([string]$Manifest.platform)) {
        throw "Manifest field 'platform' must be a non-empty string."
    }

    if ($Manifest.platform -ne "windows") {
        throw "This template currently supports only platform 'windows'."
    }

    if ($Manifest.cache_strategy -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$Manifest.cache_strategy)) {
        throw "Manifest field 'cache_strategy' must be a non-empty string."
    }

    if ($Manifest.tools -isnot [System.Array]) {
        throw "Manifest field 'tools' must be an array."
    }

    $reservedWrapperNames = @(Get-ReservedToolchainWrapperNames)
    $seenToolNames = @{}
    $seenGeneratedWrapperNames = @{}

    $allowedKinds = @(
        "existing-runtime",
        "machine-wrapper",
        "portable-download",
        "machine-install",
        "fallback-extract"
    )

    foreach ($tool in $Manifest.tools) {
        Test-ToolDefinition -Tool $tool -AllowedKinds $allowedKinds -SchemaVersion $schemaVersion

        $toolName = [string]$tool.name
        if ($seenToolNames.ContainsKey($toolName)) {
            throw "Manifest defines tool '$toolName' more than once."
        }

        $seenToolNames[$toolName] = $true

        foreach ($wrapperName in (Get-GeneratedWrapperNamesForTool -Tool $tool)) {
            if ($reservedWrapperNames -contains $wrapperName) {
                throw "Tool '$toolName' generates wrapper '$wrapperName', which is reserved."
            }

            if ($seenGeneratedWrapperNames.ContainsKey($wrapperName)) {
                throw "Generated wrapper name '$wrapperName' is declared by more than one tool."
            }

            $seenGeneratedWrapperNames[$wrapperName] = $toolName
        }
    }
}

function Get-GeneratedWrapperNamesForTool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $names = [System.Collections.Generic.List[string]]::new()
    $explicitNames = @{}

    if ($Tool.PSObject.Properties.Name.Contains("wrappers")) {
        foreach ($wrapper in @($Tool.wrappers)) {
            if ($wrapper.PSObject.Properties.Name.Contains("name")) {
                $wrapperName = [string]$wrapper.name
                $names.Add($wrapperName)
                $explicitNames[$wrapperName] = $true
            }
        }
    }

    $defaultWrapperName = [string]$Tool.name
    if (-not $explicitNames.ContainsKey($defaultWrapperName)) {
        $names.Add($defaultWrapperName)
    }

    return $names.ToArray()
}

function Test-ToolDefinition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string[]]$AllowedKinds,
        [Parameter(Mandatory = $true)]
        [string]$SchemaVersion
    )

    $requiredFields = @(
        "name",
        "kind",
        "version",
        "required",
        "install_path",
        "launch_path",
        "validate"
    )

    foreach ($field in $requiredFields) {
        if (-not $Tool.PSObject.Properties.Name.Contains($field)) {
            throw "Tool '$($Tool.name)' missing required field: $field"
        }
    }

    if ([string]::IsNullOrWhiteSpace([string]$Tool.name) -or ([string]$Tool.name) -notmatch '^[A-Za-z0-9._-]+$') {
        throw "Tool '$($Tool.name)' has an invalid name. Tool names must match ^[A-Za-z0-9._-]+$."
    }

    if ($AllowedKinds -notcontains $Tool.kind) {
        throw "Tool '$($Tool.name)' uses unsupported kind '$($Tool.kind)'."
    }

    foreach ($field in @("kind", "version", "install_path", "launch_path")) {
        if ($Tool.$field -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$Tool.$field)) {
            throw "Tool '$($Tool.name)' field '$field' must be a non-empty string."
        }
    }

    if ($Tool.required -isnot [bool]) {
        throw "Tool '$($Tool.name)' field 'required' must be a boolean."
    }

    if (-not (Test-ManifestObjectValue -Value $Tool.validate)) {
        throw "Tool '$($Tool.name)' field 'validate' must be an object."
    }

    if (-not $Tool.validate.PSObject.Properties.Name.Contains("arguments")) {
        throw "Tool '$($Tool.name)' validate block must contain 'arguments'."
    }

    Test-ManifestStringArrayField -ToolName ([string]$Tool.name) -FieldName "validate.arguments" -Value $Tool.validate.arguments

    if ($Tool.validate.PSObject.Properties.Name.Contains("match_regex")) {
        if ($Tool.validate.match_regex -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$Tool.validate.match_regex)) {
            throw "Tool '$($Tool.name)' validate.match_regex must be a non-empty string when provided."
        }
    }

    if ($SchemaVersion -eq "1.0") {
        foreach ($field in @("source_candidates", "wrappers")) {
            if ($Tool.PSObject.Properties.Name.Contains($field)) {
                throw "Tool '$($Tool.name)' uses '$field', which requires schema_version '1.1'."
            }
        }
    }

    if ($Tool.PSObject.Properties.Name.Contains("env")) {
        if (-not (Test-ManifestObjectValue -Value $Tool.env)) {
            throw "Tool '$($Tool.name)' field 'env' must be an object."
        }
    }

    if ($Tool.PSObject.Properties.Name.Contains("source_url")) {
        if ($Tool.source_url -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$Tool.source_url)) {
            throw "Tool '$($Tool.name)' field 'source_url' must be a non-empty string when provided."
        }
    }

    if ($Tool.PSObject.Properties.Name.Contains("source_candidates")) {
        Test-ManifestStringArrayField -ToolName ([string]$Tool.name) -FieldName "source_candidates" -Value $Tool.source_candidates
    }

    if ($Tool.PSObject.Properties.Name.Contains("machine_candidates")) {
        Test-ManifestStringArrayField -ToolName ([string]$Tool.name) -FieldName "machine_candidates" -Value $Tool.machine_candidates
    }

    if ($Tool.PSObject.Properties.Name.Contains("notes")) {
        if ($Tool.notes -isnot [string]) {
            throw "Tool '$($Tool.name)' field 'notes' must be a string when provided."
        }
    }

    if ($Tool.PSObject.Properties.Name.Contains("wrappers")) {
        if ($Tool.wrappers -isnot [System.Array]) {
            throw "Tool '$($Tool.name)' field 'wrappers' must be an array."
        }
        Test-ToolWrappers -Tool $Tool
    }
}

function Test-ToolWrappers {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool
    )

    $seenNames = @{}
    foreach ($wrapper in @($Tool.wrappers)) {
        if (-not $wrapper.PSObject.Properties.Name.Contains("name")) {
            throw "Tool '$($Tool.name)' contains a wrapper without a name."
        }

        $wrapperName = [string]$wrapper.name
        if ($wrapperName -notmatch '^[A-Za-z0-9._-]+$') {
            throw "Tool '$($Tool.name)' wrapper '$wrapperName' contains unsupported characters."
        }

        if ($seenNames.ContainsKey($wrapperName)) {
            throw "Tool '$($Tool.name)' defines wrapper '$wrapperName' more than once."
        }

        $seenNames[$wrapperName] = $true

        $wrapperMode = if ($wrapper.PSObject.Properties.Name.Contains("mode")) { [string]$wrapper.mode } else { "direct" }
        if (@("direct", "gui-headless") -notcontains $wrapperMode) {
            throw "Tool '$($Tool.name)' wrapper '$wrapperName' uses unsupported mode '$wrapperMode'."
        }

        $profileStrategy = if ($wrapper.PSObject.Properties.Name.Contains("profile_strategy")) { [string]$wrapper.profile_strategy } else { "none" }
        if (@("none", "repo-local") -notcontains $profileStrategy) {
            throw "Tool '$($Tool.name)' wrapper '$wrapperName' uses unsupported profile_strategy '$profileStrategy'."
        }

        if ($profileStrategy -eq "repo-local" -and -not $wrapper.PSObject.Properties.Name.Contains("profile_subpath")) {
            throw "Tool '$($Tool.name)' wrapper '$wrapperName' uses repo-local profiles but does not define profile_subpath."
        }

        if ($wrapper.PSObject.Properties.Name.Contains("profile_subpath")) {
            $profileSubpath = [string]$wrapper.profile_subpath
            if ([string]::IsNullOrWhiteSpace($profileSubpath)) {
                throw "Tool '$($Tool.name)' wrapper '$wrapperName' field 'profile_subpath' must be a non-empty string."
            }
        }

        if ($wrapper.PSObject.Properties.Name.Contains("default_arguments")) {
            Test-ManifestStringArrayField -ToolName ([string]$Tool.name) -FieldName ("wrappers.{0}.default_arguments" -f $wrapperName) -Value $wrapper.default_arguments
        }

        foreach ($booleanField in @("isolate_appdata", "isolate_temp")) {
            if ($wrapper.PSObject.Properties.Name.Contains($booleanField) -and $wrapper.$booleanField -isnot [bool]) {
                throw "Tool '$($Tool.name)' wrapper '$wrapperName' field '$booleanField' must be a boolean."
            }
        }

        if ($wrapper.PSObject.Properties.Name.Contains("env")) {
            if (-not (Test-ManifestObjectValue -Value $wrapper.env)) {
                throw "Tool '$($Tool.name)' wrapper '$wrapperName' field 'env' must be an object."
            }
        }
    }
}
