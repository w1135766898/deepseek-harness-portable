@echo off
chcp 65001 >nul
title DeepSeek Harness Desktop Launcher
cd /d "%~dp0"

if exist "%~dp0.update-transaction.json" (
    findstr /R /C:"phase.*committed" "%~dp0.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /R /C:"phase.*rolled-back" "%~dp0.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            echo [DeepSeek Harness] 正在等待版本升级事务完成并检查回滚状态，请稍候...
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -RecoverOnly
            if errorlevel 1 (
                echo [DeepSeek Harness] 无法安全恢复未完成的升级。为避免损坏安装，本次启动已取消。
                echo 请运行“在线更新.bat”重试，或保留窗口中的错误信息以便诊断。
                pause
                exit /b 1
            )
        )
    )
)

start "" "%~dp0runtime\DeepSeek Harness.exe" %*
