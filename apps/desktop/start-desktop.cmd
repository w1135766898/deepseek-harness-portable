@echo off
chcp 65001 >nul
title DeepSeek Harness Desktop Launcher
cd /d "%~dp0"

if exist "%~dp0.update-transaction.json" (
    findstr /R /C:"phase.*committed" "%~dp0.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /R /C:"phase.*rolled-back" "%~dp0.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            echo [DeepSeek Harness] Waiting for the update transaction to finish...
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -RecoverOnly
            if errorlevel 1 (
                echo [DeepSeek Harness] Could not recover the unfinished update; startup is cancelled.
                echo Run the online updater and retry, or keep this window open for diagnostics.
                pause
                exit /b 1
            )
        )
    )
)

start "" "%~dp0runtime\DeepSeek Harness.exe" %*
