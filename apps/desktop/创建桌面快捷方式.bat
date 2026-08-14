@echo off
title DeepSeek Harness Setup
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\setup-shortcuts.ps1" %*
if %ERRORLEVEL% NEQ 0 pause
