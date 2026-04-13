[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ToolName,
    [string]$WrapperName,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -Parent
. (Join-Path -Path $repoRoot -ChildPath "tools\lib\Toolchain.Wrapper.ps1")

if ($null -eq $Arguments) {
    $Arguments = @()
}

if ($Arguments.Count -gt 0 -and $Arguments[0] -eq "--") {
    if ($Arguments.Count -eq 1) {
        $Arguments = @()
    } else {
        $Arguments = $Arguments[1..($Arguments.Count - 1)]
    }
}

if ($Arguments.Count -eq 0) {
    Invoke-StableToolWrapper -RepoRoot $repoRoot -ToolName $ToolName -WrapperName $WrapperName
} else {
    Invoke-StableToolWrapper -RepoRoot $repoRoot -ToolName $ToolName -WrapperName $WrapperName -WrapperArguments $Arguments
}
