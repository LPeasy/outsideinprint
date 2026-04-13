@echo off
setlocal
set "REPO_ROOT=%~dp0.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
set "BIN_CUSTOM=%REPO_ROOT%\tools\bin\custom"
set "BIN_GENERATED=%REPO_ROOT%\tools\bin\generated"
set "BIN_STATIC=%REPO_ROOT%\tools\bin"
set "NEW_PATH=%PATH%"
echo %NEW_PATH% | find /I "%BIN_STATIC%" >nul
if errorlevel 1 set "NEW_PATH=%BIN_STATIC%;%NEW_PATH%"
echo %NEW_PATH% | find /I "%BIN_GENERATED%" >nul
if errorlevel 1 set "NEW_PATH=%BIN_GENERATED%;%NEW_PATH%"
echo %NEW_PATH% | find /I "%BIN_CUSTOM%" >nul
if errorlevel 1 set "NEW_PATH=%BIN_CUSTOM%;%NEW_PATH%"
endlocal & (
    set "PATH=%NEW_PATH%"
    echo Toolchain activated for cmd.exe: %REPO_ROOT%\tools\bin\custom; %REPO_ROOT%\tools\bin\generated; %REPO_ROOT%\tools\bin
)
