@echo off
chcp 65001 >nul
title DeepSeek Harness Desktop Launcher
cd /d "%~dp0"
echo ========================================================
echo   DeepSeek Harness 原生窗口启动器 (免拦截模式)
echo   正在通过官方 Electron 运行时启动独立桌面窗口...
echo ========================================================
npx electron resources/app %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败。请确保系统已安装 Node.js (推荐 v22 或 v24): https://nodejs.org
    echo.
    pause
)
