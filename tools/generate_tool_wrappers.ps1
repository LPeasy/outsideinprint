[CmdletBinding()]
param(
    [string]$ManifestPath = "tools/toolchain.manifest.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Common.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Manifest.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Resolve.ps1")

$repoRoot = Get-ToolchainRepoRoot -ScriptRoot $PSScriptRoot
$manifest = Get-ToolchainManifest -ManifestPath $ManifestPath -RepoRoot $repoRoot
$generatedRoot = Get-GeneratedWrapperRoot -RepoRoot $repoRoot
$customRoot = Get-CustomWrapperRoot -RepoRoot $repoRoot

Ensure-Directory -Path $generatedRoot
Ensure-Directory -Path $customRoot

$reservedNames = @(Get-ReservedToolchainWrapperNames)
$wrappers = [System.Collections.Generic.List[object]]::new()
$seenNames = @{}

foreach ($tool in $manifest.tools) {
    foreach ($wrapper in (Get-ToolWrapperDefinitions -Tool $tool)) {
        $wrapperName = [string]$wrapper.name
        if ($reservedNames -contains $wrapperName) {
            throw "Wrapper name '$wrapperName' is reserved."
        }

        if ($seenNames.ContainsKey($wrapperName)) {
            throw "Wrapper name '$wrapperName' is declared by more than one tool."
        }

        $seenNames[$wrapperName] = $true
        $wrappers.Add([pscustomobject]@{
            ToolName    = [string]$tool.name
            WrapperName = $wrapperName
        })
    }
}

Get-ChildItem -LiteralPath $generatedRoot -Filter *.cmd -File -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
}

foreach ($wrapper in $wrappers) {
    $wrapperPath = Join-Path -Path $generatedRoot -ChildPath ("{0}.cmd" -f $wrapper.WrapperName)
    $content = @"
@echo off
setlocal
set "SYS_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%SYS_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\invoke-tool.ps1" -ToolName "$($wrapper.ToolName)" -WrapperName "$($wrapper.WrapperName)" %*
exit /b %ERRORLEVEL%
"@
    Set-Content -LiteralPath $wrapperPath -Value $content
}

if (-not (Test-Path -LiteralPath (Join-Path -Path $generatedRoot -ChildPath ".gitkeep") -PathType Leaf)) {
    Set-Content -LiteralPath (Join-Path -Path $generatedRoot -ChildPath ".gitkeep") -Value ""
}

if (-not (Test-Path -LiteralPath (Join-Path -Path $customRoot -ChildPath ".gitkeep") -PathType Leaf)) {
    Set-Content -LiteralPath (Join-Path -Path $customRoot -ChildPath ".gitkeep") -Value ""
}

Write-Host ("Generated {0} wrapper(s) in {1}" -f $wrappers.Count, $generatedRoot)
