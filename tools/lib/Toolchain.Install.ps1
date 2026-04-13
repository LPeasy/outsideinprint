Set-StrictMode -Version Latest

function Invoke-ToolProvisioning {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Manifest,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $logPath = Get-ToolLogPath -RepoRoot $RepoRoot -Tool $Tool
    Write-ToolLog -LogPath $logPath -Message ("Provisioning tool '{0}' ({1})" -f $Tool.name, $Tool.kind)

    switch ($Tool.kind) {
        "existing-runtime" {
            Confirm-InstalledTool -Tool $Tool -RepoRoot $RepoRoot -LogPath $logPath
        }
        "machine-wrapper" {
            Confirm-InstalledTool -Tool $Tool -RepoRoot $RepoRoot -LogPath $logPath
        }
        "portable-download" {
            Install-PortableTool -Tool $Tool -RepoRoot $RepoRoot -LogPath $logPath -InstallRoot (Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $Tool.install_path) -UsedFallbackExtract:$false
        }
        "fallback-extract" {
            $fallbackRoot = Get-FallbackInstallRoot -Tool $Tool -RepoRoot $RepoRoot
            Install-PortableTool -Tool $Tool -RepoRoot $RepoRoot -LogPath $logPath -InstallRoot $fallbackRoot -UsedFallbackExtract:$true
        }
        "machine-install" {
            $resolved = Resolve-ToolExecutable -Tool $Tool -RepoRoot $RepoRoot
            $hasFallbackPath = $Tool.PSObject.Properties.Name.Contains("fallback_extract_path") -and -not [string]::IsNullOrWhiteSpace($Tool.fallback_extract_path)
            $hasSource = @(Get-ToolSourceCandidates -Tool $Tool).Count -gt 0
            if ($resolved) {
                Write-ToolLog -LogPath $logPath -Message ("Using existing runtime at {0}" -f $resolved)
            } elseif ($hasFallbackPath -and $hasSource) {
                $fallbackRoot = Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $Tool.fallback_extract_path
                Write-ToolLog -LogPath $logPath -Message "Machine install unavailable. Falling back to repo-local extraction."
                Install-PortableTool -Tool $Tool -RepoRoot $RepoRoot -LogPath $logPath -InstallRoot $fallbackRoot -UsedFallbackExtract:$true
            } elseif ($Tool.required) {
                throw "Required machine-install tool '$($Tool.name)' was not found and has no usable fallback_extract_path/source_candidates configuration."
            } else {
                Write-ToolLog -LogPath $logPath -Message "Optional machine-install tool not present and no fallback was configured."
                return
            }
        }
        default {
            throw "Unsupported tool kind: $($Tool.kind)"
        }
    }

    $validation = Test-ToolValidation -Tool $Tool -RepoRoot $RepoRoot
    if (-not $validation.Success) {
        if ($Tool.required) {
            throw $validation.Message
        }
        Write-ToolLog -LogPath $logPath -Message $validation.Message
        return
    }

    Write-ToolLog -LogPath $logPath -Message ("Validated tool '{0}' at {1}" -f $Tool.name, $validation.Path)
}

function Get-FallbackInstallRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    if ($Tool.PSObject.Properties.Name.Contains("fallback_extract_path") -and -not [string]::IsNullOrWhiteSpace($Tool.fallback_extract_path)) {
        return Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $Tool.fallback_extract_path
    }

    return Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $Tool.install_path
}

function Confirm-InstalledTool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $resolved = Resolve-ToolExecutable -Tool $Tool -RepoRoot $RepoRoot
    if ($resolved) {
        Write-ToolLog -LogPath $LogPath -Message ("Resolved existing tool at {0}" -f $resolved)
        return
    }

    if ($Tool.required) {
        throw "Required tool '$($Tool.name)' could not be resolved."
    }

    Write-ToolLog -LogPath $LogPath -Message "Optional tool could not be resolved."
}

function Install-PortableTool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$LogPath,
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [bool]$UsedFallbackExtract = $false
    )

    $existingPath = Resolve-ToolExecutableFromRoot -Tool $Tool -InstallRoot $InstallRoot -RepoRoot $RepoRoot
    if ($existingPath) {
        Write-ToolLog -LogPath $LogPath -Message ("Using existing repo-local payload at {0}" -f $existingPath)
        Write-ToolLog -LogPath $LogPath -Message ("Tool={0} Version={1} Source=repo-local FallbackExtract={2}" -f $Tool.name, $Tool.version, $UsedFallbackExtract.ToString().ToLowerInvariant())
        return
    }

    $cachePath = Get-ToolCachePath -Tool $Tool
    if ($cachePath -and (Test-Path -LiteralPath $cachePath -PathType Container)) {
        Write-ToolLog -LogPath $LogPath -Message ("Copying payload from shared cache {0}" -f $cachePath)
        Copy-DirectoryTree -Source $cachePath -Destination $InstallRoot
        Write-ToolLog -LogPath $LogPath -Message ("Tool={0} Version={1} Source=shared-cache FallbackExtract={2}" -f $Tool.name, $Tool.version, $UsedFallbackExtract.ToString().ToLowerInvariant())
        return
    }

    $candidates = @(Get-ToolSourceCandidates -Tool $Tool)
    if ($candidates.Count -eq 0) {
        throw "Tool '$($Tool.name)' does not define source_url or source_candidates for portable installation."
    }

    $downloadRoot = Join-Path -Path $RepoRoot -ChildPath "tools\_downloads"
    Ensure-Directory -Path $downloadRoot
    $assetName = Get-ToolAssetName -Tool $Tool
    $downloadPath = Join-Path -Path $downloadRoot -ChildPath $assetName
    $downloadResult = Download-ToolPayload -Tool $Tool -RepoRoot $RepoRoot -DestinationPath $downloadPath -LogPath $LogPath
    Assert-ToolHash -Tool $Tool -DownloadedPath $downloadPath -LogPath $LogPath

    Remove-WorkspaceItemStrict -RepoRoot $RepoRoot -TargetPath $InstallRoot
    Ensure-Directory -Path (Split-Path -Path $InstallRoot -Parent)
    Expand-ToolPayload -ArchivePath $downloadPath -DestinationPath $InstallRoot -LogPath $LogPath
    Write-ToolLog -LogPath $LogPath -Message ("Tool={0} Version={1} Source={2} Candidate={3} FallbackExtract={4}" -f $Tool.name, $Tool.version, $downloadResult.Origin, $downloadResult.Source, $UsedFallbackExtract.ToString().ToLowerInvariant())

    if ($cachePath) {
        Write-ToolLog -LogPath $LogPath -Message ("Updating shared cache at {0}" -f $cachePath)
        Copy-DirectoryTree -Source $InstallRoot -Destination $cachePath
    }
}

function Download-ToolPayload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    Ensure-Directory -Path (Split-Path -Path $DestinationPath -Parent)
    $attemptErrors = [System.Collections.Generic.List[string]]::new()
    foreach ($candidate in (Get-ToolSourceCandidates -Tool $Tool)) {
        try {
            return (Download-ToolPayloadCandidate -Tool $Tool -RepoRoot $RepoRoot -SourceCandidate $candidate -DestinationPath $DestinationPath -LogPath $LogPath)
        } catch {
            $attemptErrors.Add(("{0}: {1}" -f $candidate, $_.Exception.Message))
            Write-ToolLog -LogPath $LogPath -Message ("Source candidate failed: {0}" -f $candidate)
        }
    }

    throw ("All source candidates failed for tool '{0}': {1}" -f $Tool.name, ($attemptErrors -join " | "))
}

function Download-ToolPayloadCandidate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$SourceCandidate,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $expandedSource = Expand-ToolchainString -Value $SourceCandidate
    $localSourcePath = $null
    $origin = $null

    if ($expandedSource.StartsWith("file:///", [System.StringComparison]::OrdinalIgnoreCase)) {
        $localSourcePath = ([uri]$expandedSource).LocalPath
        $origin = "file-uri"
    } elseif ([System.IO.Path]::IsPathRooted($expandedSource)) {
        $localSourcePath = $expandedSource
        $origin = "local-mirror"
    } elseif (-not ($expandedSource -match '^[A-Za-z][A-Za-z0-9+.-]*://')) {
        $localSourcePath = Resolve-ToolchainPath -RepoRoot $RepoRoot -Path $expandedSource
        $origin = "repo-relative"
    } else {
        $origin = "remote-url"
    }

    if ($localSourcePath) {
        if (-not (Test-Path -LiteralPath $localSourcePath -PathType Leaf)) {
            throw "Local payload not found: $localSourcePath"
        }

        Write-ToolLog -LogPath $LogPath -Message ("Copying local payload from {0} to {1}" -f $localSourcePath, $DestinationPath)
        Copy-Item -LiteralPath $localSourcePath -Destination $DestinationPath -Force
        return [pscustomobject]@{
            Origin = $origin
            Source = $SourceCandidate
        }
    }

    $downloader = Get-DownloaderCommand
    if ($downloader) {
        Write-ToolLog -LogPath $LogPath -Message ("Downloading with curl.exe from {0} to {1}" -f $SourceCandidate, $DestinationPath)
        & $downloader --fail --location --silent --show-error --output $DestinationPath $SourceCandidate
        if ($LASTEXITCODE -eq 0) {
            return [pscustomobject]@{
                Origin = $origin
                Source = $SourceCandidate
            }
        }

        Write-ToolLog -LogPath $LogPath -Message "curl.exe download failed. Falling back to Invoke-WebRequest."
    }

    Write-ToolLog -LogPath $LogPath -Message ("Downloading with Invoke-WebRequest from {0} to {1}" -f $SourceCandidate, $DestinationPath)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $SourceCandidate -OutFile $DestinationPath -UseBasicParsing
    return [pscustomobject]@{
        Origin = $origin
        Source = $SourceCandidate
    }
}

function Assert-ToolHash {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Tool,
        [Parameter(Mandatory = $true)]
        [string]$DownloadedPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $hasSha = $Tool.PSObject.Properties.Name.Contains("sha256") -and -not [string]::IsNullOrWhiteSpace($Tool.sha256)
    if (-not $hasSha) {
        Write-ToolLog -LogPath $LogPath -Message "No sha256 provided. Skipping hash verification."
        return
    }

    $hash = (Get-FileHash -LiteralPath $DownloadedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = ([string]$Tool.sha256).ToLowerInvariant()
    if ($hash -ne $expected) {
        throw "SHA-256 mismatch for '$($Tool.name)'. Expected $expected, got $hash."
    }

    Write-ToolLog -LogPath $LogPath -Message "SHA-256 verification succeeded."
}

function Expand-ToolPayload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $lowerPath = $ArchivePath.ToLowerInvariant()
    $extension = [System.IO.Path]::GetExtension($ArchivePath).ToLowerInvariant()
    if ($extension -eq ".zip") {
        Write-ToolLog -LogPath $LogPath -Message ("Extracting zip payload to {0}" -f $DestinationPath)
        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force
        return
    }

    if ($extension -eq ".exe") {
        Write-ToolLog -LogPath $LogPath -Message ("Copying portable executable payload to {0}" -f $DestinationPath)
        Ensure-Directory -Path $DestinationPath
        Copy-Item -LiteralPath $ArchivePath -Destination (Join-Path -Path $DestinationPath -ChildPath ([System.IO.Path]::GetFileName($ArchivePath))) -Force
        return
    }

    if ($lowerPath.EndsWith(".tar.gz") -or $lowerPath.EndsWith(".tgz")) {
        $tarPath = Join-Path -Path $env:SystemRoot -ChildPath "System32\tar.exe"
        if (-not (Test-Path -LiteralPath $tarPath -PathType Leaf)) {
            throw "tar.exe not available to extract $ArchivePath"
        }

        Ensure-Directory -Path $DestinationPath
        Write-ToolLog -LogPath $LogPath -Message ("Extracting tar payload to {0}" -f $DestinationPath)
        & $tarPath -xf $ArchivePath -C $DestinationPath
        if ($LASTEXITCODE -ne 0) {
            throw "tar.exe extraction failed for $ArchivePath"
        }
        return
    }

    throw "Unsupported payload type for $ArchivePath"
}
