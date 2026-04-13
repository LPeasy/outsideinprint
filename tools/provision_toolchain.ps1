[CmdletBinding()]
param(
    [string]$ManifestPath = "tools/toolchain.manifest.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Common.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Manifest.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Resolve.ps1")
. (Join-Path -Path $PSScriptRoot -ChildPath "lib\Toolchain.Install.ps1")

$repoRoot = Get-ToolchainRepoRoot -ScriptRoot $PSScriptRoot
$manifest = Get-ToolchainManifest -ManifestPath $ManifestPath -RepoRoot $repoRoot

foreach ($tool in $manifest.tools) {
    Invoke-ToolProvisioning -Tool $tool -Manifest $manifest -RepoRoot $repoRoot
}

Write-Host "Provisioning complete."

