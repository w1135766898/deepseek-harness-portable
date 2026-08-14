@echo off
chcp 65001 >nul
title DeepSeek Harness Web Launcher
cd /d "%~dp0"
echo ========================================================
echo   DeepSeek Harness 网页版启动器 (防拦截模式)
echo   正在通过受信任的 Node 运行时启动核心引擎...
echo ========================================================
node resources\app\lib\packaged-bin.js %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败。请确保系统已安装 Node.js (推荐 v22 或 v24): https://nodejs.org
    echo.
    pause
)
