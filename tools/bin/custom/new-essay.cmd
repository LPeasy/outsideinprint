@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..\..") do set "REPO_ROOT=%%~fI"
set "SCRIPT_PATH=%REPO_ROOT%\scripts\new_essay.ps1"
set "GENERATED_PWSH=%REPO_ROOT%\tools\bin\generated\pwsh.cmd"

if exist "%GENERATED_PWSH%" (
  call "%GENERATED_PWSH%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" %*
  exit /b %ERRORLEVEL%
)

where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" %*
  exit /b %ERRORLEVEL%
)

echo Unable to find pwsh. Run tools\generate_tool_wrappers.cmd and tools\provision_toolchain.cmd first. 1>&2
exit /b 1
