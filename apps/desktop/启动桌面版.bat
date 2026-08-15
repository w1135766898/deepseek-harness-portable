@echo off
chcp 65001 >nul
title DeepSeek Harness Desktop
cd /d "%~dp0"

if exist "%~dp0.update-transaction.json" (
    findstr /C:"\"phase\": \"committed\"" "%~dp0.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /C:"\"phase\": \"rolled-back\"" "%~dp0.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            echo [DeepSeek Harness] 正在完成版本升级替换（预计 1~2 秒），请稍候...
            timeout /t 2 /nobreak >nul 2>&1
        )
    )
)

start "" "%~dp0runtime\DeepSeek Harness.exe" %*
