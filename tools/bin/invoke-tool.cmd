@echo off
setlocal
if "%~1"=="" (
    echo Usage: invoke-tool.cmd TOOLNAME [args...]
    exit /b 1
)
set "SYS_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "TOOL_NAME=%~1"
shift
"%SYS_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0invoke-tool.ps1" -ToolName "%TOOL_NAME%" %*
exit /b %ERRORLEVEL%
