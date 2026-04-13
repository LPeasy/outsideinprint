@echo off
setlocal
set "SYS_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%SYS_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\invoke-tool.ps1" -ToolName "hugo" -WrapperName "hugo" %*
exit /b %ERRORLEVEL%
