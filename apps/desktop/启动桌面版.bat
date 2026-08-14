@echo off
title DeepSeek Harness Desktop
cd /d "%~dp0runtime"
start "" "%~dp0runtime\DeepSeek Harness.exe" %*
