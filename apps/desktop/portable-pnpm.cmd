@echo off
setlocal
set "APP_ROOT=%~dp0"
set "RUNTIME_EXE=%APP_ROOT%runtime\DeepSeek Harness.exe"
set "PNPM_ENTRY=%APP_ROOT%runtime\resources\app\node_modules\pnpm\bin\pnpm.cjs"

if not exist "%RUNTIME_EXE%" (
    echo DeepSeek Harness runtime was not found: %RUNTIME_EXE% 1>&2
    exit /b 1
)
if not exist "%PNPM_ENTRY%" (
    echo Embedded pnpm was not found: %PNPM_ENTRY% 1>&2
    exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%RUNTIME_EXE%" "%PNPM_ENTRY%" %*
exit /b %ERRORLEVEL%
