@echo off
chcp 65001 >nul
title DeepSeek Harness 网页版启动器
cd /d "%~dp0"

echo ================================================================
echo   🚀 DeepSeek Harness 智能编程与 Agent 运行时 (推荐模式)
echo   正在通过 Node.js 受信任环境启动服务...
echo ================================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%~dp0runtime\resources\app\lib\packaged-bin.js" %*
) else (
    echo [提示] 系统未检测到全局 Node.js，正在切换至原生桌面窗口启动...
    start "" "%~dp0runtime\DeepSeek Harness.exe" %*
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败。如果遇到安全拦截，请先运行【⚙️ 创建桌面图标与解除拦截.bat】。
    echo 推荐安装官方 Node.js (https://nodejs.org) 以获得最佳免拦截体验。
    echo.
    pause
)
