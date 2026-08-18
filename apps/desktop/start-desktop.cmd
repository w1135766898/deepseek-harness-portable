@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
title DeepSeek Harness Desktop Launcher
cd /d "%~dp0"

set "DSH_TRANSACTION_PATH=%~dp0.update-transaction.json"
if exist "%DSH_TRANSACTION_PATH%" (
    powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $state = Get-Content -LiteralPath $env:DSH_TRANSACTION_PATH -Raw -Encoding UTF8 | ConvertFrom-Json; $phase = [string]$state.phase; if ($phase -cne 'committed' -and $phase -cne 'rolled-back') { exit 1 }" >nul 2>&1
    if errorlevel 1 (
        echo [DeepSeek Harness] Waiting for the update transaction to finish...
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -RecoverOnly
        if errorlevel 1 goto :recovery_failed
        if exist "%DSH_TRANSACTION_PATH%" (
            powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $state = Get-Content -LiteralPath $env:DSH_TRANSACTION_PATH -Raw -Encoding UTF8 | ConvertFrom-Json; $phase = [string]$state.phase; if ($phase -cne 'committed' -and $phase -cne 'rolled-back') { exit 1 }" >nul 2>&1
            if errorlevel 1 goto :recovery_failed
        )
    )
)

goto :launch_desktop

:recovery_failed
echo [DeepSeek Harness] Could not recover the unfinished update; startup is cancelled.
echo Run the online updater and retry, or keep this window open for diagnostics.
if not defined DSH_GUI_LAUNCHER pause
exit /b 1

:launch_desktop
if not exist "%~dp0DeepSeek Harness Launcher.exe" if exist "%~dp0runtime\DeepSeek Harness Launcher.exe" (
    copy /Y "%~dp0runtime\DeepSeek Harness Launcher.exe" "%~dp0DeepSeek Harness Launcher.exe" >nul 2>&1
)
if exist "%~dp0DeepSeek Harness Launcher.exe" (
    set "DSH_LAUNCH_ROOT=%~dp0"
    powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$module = Join-Path $env:DSH_LAUNCH_ROOT 'updater\updater.psm1'; if (Test-Path -LiteralPath $module -PathType Leaf) { Import-Module -Name $module -Force -DisableNameChecking -WarningAction SilentlyContinue; Sync-DesktopLauncherShortcuts -AppRoot $env:DSH_LAUNCH_ROOT | Out-Null }" >nul 2>&1
    start "" "%~dp0DeepSeek Harness Launcher.exe" %*
    exit /b 0
)
start "" "%~dp0runtime\DeepSeek Harness.exe" %*
