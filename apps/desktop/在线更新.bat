@echo off
title DeepSeek Harness Updater
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
if %ERRORLEVEL% NEQ 0 pause
