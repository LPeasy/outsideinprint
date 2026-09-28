[CmdletBinding()]
param(
    [string]$ManifestPath = "tools/toolchain.manifest.json",
    [string[]]$Tools = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Common.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Manifest.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Resolve.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Install.ps1")

$repoRoot = Get-ToolchainRepoRoot -ScriptRoot $PSScriptRoot
$manifest = Get-ToolchainManifest -ManifestPath $ManifestPath -RepoRoot $repoRoot
$selectedTools = @($manifest.tools)
if ($Tools.Count -gt 0) {
    foreach ($name in $Tools) {
        if ($name -notin @($manifest.tools | ForEach-Object { $_.name })) {
            throw "Unknown tool in -Tools: $name"
        }
    }
    $selectedTools = @($manifest.tools | Where-Object { $_.name -in $Tools })
}

foreach ($tool in $selectedTools) {
    Invoke-ToolProvisioning -Tool $tool -Manifest $manifest -RepoRoot $repoRoot
}

Write-Host "Provisioning complete."

