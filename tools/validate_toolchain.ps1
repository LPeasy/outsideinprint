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
$failures = @()

foreach ($tool in $selectedTools) {
    try {
        $result = Test-ToolValidation -Tool $tool -RepoRoot $repoRoot
        if ($result.Success) {
            Write-Host ("[ok] {0} -> {1}" -f $tool.name, $result.Path)
        } elseif ($tool.required) {
            $failures += $result.Message
            Write-Warning $result.Message
        } else {
            Write-Host ("[skip] {0} -> {1}" -f $tool.name, $result.Message)
        }
    } catch {
        if ($tool.required) {
            $failures += $_.Exception.Message
            Write-Warning $_.Exception.Message
        } else {
            Write-Host ("[skip] {0} -> {1}" -f $tool.name, $_.Exception.Message)
        }
    }
}

if ($failures.Count -gt 0) {
    throw ("Validation failed for {0} required tool(s)." -f $failures.Count)
}

Write-Host "Validation complete."

