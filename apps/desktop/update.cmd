@echo off
chcp 65001 >nul
title DeepSeek Harness Updater
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
echo.
pause
