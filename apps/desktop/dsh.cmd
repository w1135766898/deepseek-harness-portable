@echo off
chcp 65001 >nul
if /I "%~1"=="update" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0runtime\update.ps1" %*
    goto :EOF
)

if /I "%~1"=="desktop" (
    shift
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
    goto :EOF
)

if /I "%~1"=="trust" (
    shift
    call "%~dp0⚙️ 创建桌面图标与解除拦截.bat" %*
    goto :EOF
)

call "%~dp0🚀 启动 DeepSeek Harness (推荐网页版).bat" %*
