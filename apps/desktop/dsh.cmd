@echo off
set "APP_ROOT=%~dp0"
if /I "%~1"=="update" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%update.ps1" %*
    goto :EOF
)
if exist "%APP_ROOT%.update-transaction.json" (
    findstr /C:"\"phase\": \"committed\"" "%APP_ROOT%.update-transaction.json" >nul 2>&1
    if errorlevel 1 (
        findstr /C:"\"phase\": \"rolled-back\"" "%APP_ROOT%.update-transaction.json" >nul 2>&1
        if errorlevel 1 (
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%update.ps1" -RecoverOnly
            if errorlevel 1 exit /b 1
        )
    )
)
if /I "%~1"=="desktop" (
    shift
    call "%APP_ROOT%start-desktop.cmd" %*
    goto :EOF
)
if /I "%~1"=="trust" (
    shift
    powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%setup-shortcuts.ps1" %*
    goto :EOF
)
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node "%APP_ROOT%runtime\resources\app\lib\packaged-bin.js" %*
) else (
    call "%APP_ROOT%start-desktop.cmd" %*
)
