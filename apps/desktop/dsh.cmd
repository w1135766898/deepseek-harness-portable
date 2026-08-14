@echo off
set "APP_ROOT=%~dp0"
if /I "%~1"=="update" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%update.ps1" %*
    goto :EOF
)
if /I "%~1"=="desktop" (
    shift
    start "" "%APP_ROOT%runtime\DeepSeek Harness.exe" %*
    goto :EOF
)
if /I "%~1"=="trust" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%setup-shortcuts.ps1" %*
    goto :EOF
)
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%APP_ROOT%runtime\resources\app\lib\packaged-bin.js" %*
) else (
    start "" "%APP_ROOT%runtime\DeepSeek Harness.exe" %*
)
