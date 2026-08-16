@echo off
title DeepSeek Harness
cd /d "%~dp0"
if exist "%~dp0.update-transaction.json" (
    findstr /C:"\"phase\": \"committed\"" "%~dp0.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /C:"\"phase\": \"rolled-back\"" "%~dp0.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -RecoverOnly
            if errorlevel 1 exit /b 1
        )
    )
)
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%~dp0runtime\resources\app\lib\packaged-bin.js" %*
) else (
    call "%~dp0start-desktop.cmd" %*
)
