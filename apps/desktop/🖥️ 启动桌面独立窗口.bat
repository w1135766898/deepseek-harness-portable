@echo off
chcp 65001 >nul
title DeepSeek Harness 原生独立窗口
cd /d "%~dp0runtime"

echo ================================================================
echo   🖥️ DeepSeek Harness 原生独立桌面窗口
echo   正在启动原生客户端与系统托盘...
echo ================================================================
echo.

start "" "%~dp0runtime\DeepSeek Harness.exe" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [提示] 启动受阻。如果是 Windows 11 智能应用控制 (SAC) 拦截，
    echo 请返回上级目录双击运行【⚙️ 创建桌面图标与解除拦截.bat】完成本机信任。
    echo.
    pause
)
