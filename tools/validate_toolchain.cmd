@echo off
setlocal
set "SYS_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%SYS_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0validate_toolchain.ps1" %*
exit /b %ERRORLEVEL%

