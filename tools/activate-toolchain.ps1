[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$pathsToAdd = @(
    (Join-Path -Path $repoRoot -ChildPath "tools\bin\custom"),
    (Join-Path -Path $repoRoot -ChildPath "tools\bin\generated"),
    (Join-Path -Path $repoRoot -ChildPath "tools\bin")
)

foreach ($path in $pathsToAdd) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "Toolchain bin directory not found: $path"
    }
}

$pathParts = @($env:PATH -split ';' | Where-Object { $_ -and $_.Trim() -ne "" })
foreach ($path in [System.Linq.Enumerable]::Reverse([string[]]$pathsToAdd)) {
    if ($pathParts -notcontains $path) {
        $env:PATH = "$path;$env:PATH"
    }
}

Write-Host ("Toolchain activated for PowerShell: {0}" -f ($pathsToAdd -join "; "))
