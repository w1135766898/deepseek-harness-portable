@echo off
title DeepSeek Harness - signing information
echo.
echo A self-signed certificate does not make an application trusted by
echo Microsoft Smart App Control or SmartScreen. This script deliberately
echo does not create certificates or modify Windows trust stores.
echo.
echo Verify the release SHA-256 value in SHA256SUMS.txt and use a release
echo signed by a trusted commercial CA or an enterprise signing policy when
echo your environment requires a trusted executable.
echo.
pause
exit /b 1
