@echo off
chcp 65001 >nul
title DeepSeek Harness 在线检查与热更新
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\update.ps1" %*
echo.
pause
