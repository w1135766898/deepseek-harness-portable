@echo off
chcp 65001 >nul
if /I "%~1"=="update" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
    goto :EOF
)

if /I "%~1"=="desktop" (
    shift
    call "%~dp0start-desktop.cmd" %*
    goto :EOF
)

call "%~dp0start-web.cmd" %*
