@echo off
title DeepSeek Harness Web Launcher
cd /d "%~dp0"
if exist "%~dp0.update-transaction.json" (
    findstr /R /C:"phase.*committed" "%~dp0.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /R /C:"phase.*rolled-back" "%~dp0.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -RecoverOnly
            if errorlevel 1 exit /b 1
        )
    )
)
call "%~dp0dsh.cmd" web %*
exit /b %ERRORLEVEL%
