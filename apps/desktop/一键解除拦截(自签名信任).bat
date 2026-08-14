@echo off
chcp 65001 >nul
title DeepSeek Harness - Windows 拦截解除工具 (自签名信任)
cd /d "%~dp0"
echo ========================================================
echo   DeepSeek Harness 本地安全证书一键安装与签名工具
echo   用于解决 Windows 11 智能应用控制 (SAC) 拦截问题
echo ========================================================
echo.
echo 正在生成专属于本机的自签名证书并信任...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Write-Host '[1/4] 生成本机代码签名证书...'; $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=DeepSeekHarnessLocal' -CertStoreLocation 'Cert:\CurrentUser\My'; Write-Host '[2/4] 为可执行文件附加数字签名...'; Set-AuthenticodeSignature -Certificate $cert -FilePath '.\DeepSeek Harness.exe'; Write-Host '[3/4] 导出证书...'; $certPath = \"$env:TEMP\deepseek-harness-$([Guid]::NewGuid().ToString('N')).cer\"; Export-Certificate -Cert $cert -FilePath $certPath | Out-Null; Write-Host '[4/4] 安装证书到受信任的颁发机构与发布者...'; Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null; Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null; Remove-Item $certPath -Force -ErrorAction SilentlyContinue; Write-Host ''; Write-Host '========================================================' -ForegroundColor Green; Write-Host '  [成功] 数字证书已安装并信任！' -ForegroundColor Green; Write-Host '  您现在可以直接双击运行 DeepSeek Harness.exe 启动原生桌面窗口。' -ForegroundColor Green; Write-Host '========================================================' -ForegroundColor Green; } catch { Write-Host ''; Write-Host \"[失败] $($_.Exception.Message)\" -ForegroundColor Red; Write-Host '如果提示权限不足，请右键此文件选择【以管理员身份运行】。' -ForegroundColor Yellow; }"
echo.
pause
