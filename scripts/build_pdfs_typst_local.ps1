$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

& "$PSScriptRoot/build_pdfs_typst_shared.ps1" -Mode "Local"
