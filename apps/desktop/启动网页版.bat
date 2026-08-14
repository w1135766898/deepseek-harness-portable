@echo off
title DeepSeek Harness
cd /d "%~dp0"
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%~dp0runtime\resources\app\lib\packaged-bin.js" %*
) else (
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
)
