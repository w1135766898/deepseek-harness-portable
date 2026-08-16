@echo off
setlocal
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
set "RUNTIME_EXE=%APP_ROOT%runtime\DeepSeek Harness.exe"
set "PACKAGED_WEB=%APP_ROOT%runtime\resources\app\lib\packaged-bin.js"
set "DSH_CLI=%APP_ROOT%runtime\resources\app\node_modules\@deepseek-ai\dsh\lib\bin.js"
set "PATH=%APP_ROOT%;%PATH%"

if not exist "%RUNTIME_EXE%" (
    echo DeepSeek Harness runtime was not found: %RUNTIME_EXE% 1>&2
    exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"

if "%~1"=="" (
    "%RUNTIME_EXE%" "%PACKAGED_WEB%"
    exit /b %ERRORLEVEL%
)
if /I "%~1"=="web" (
    "%RUNTIME_EXE%" "%PACKAGED_WEB%" %*
    exit /b %ERRORLEVEL%
)
set "FIRST_ARG=%~1"
if "%FIRST_ARG:~0,1%"=="-" (
    "%RUNTIME_EXE%" "%PACKAGED_WEB%" %*
    exit /b %ERRORLEVEL%
)
if not exist "%DSH_CLI%" (
    echo Embedded dsh CLI was not found: %DSH_CLI% 1>&2
    exit /b 1
)
"%RUNTIME_EXE%" "%DSH_CLI%" %*
exit /b %ERRORLEVEL%
