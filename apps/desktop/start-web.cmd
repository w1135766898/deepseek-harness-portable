@echo off
title DeepSeek Harness Web Launcher
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%~dp0runtime\resources\app\lib\packaged-bin.js" %*
) else (
    echo Node.js was not found. Launching the desktop shell instead.
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
)
