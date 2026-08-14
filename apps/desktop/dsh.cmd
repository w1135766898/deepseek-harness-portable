@echo off
if /I "%~1"=="update" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\update.ps1" %*
    goto :EOF
)
if /I "%~1"=="desktop" (
    shift
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
    goto :EOF
)
if /I "%~1"=="trust" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\setup-shortcuts.ps1" %*
    goto :EOF
)
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%~dp0runtime\resources\app\lib\packaged-bin.js" %*
) else (
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
)
