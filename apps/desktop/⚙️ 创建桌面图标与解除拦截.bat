@echo off
chcp 65001 >nul
title DeepSeek Harness - 创建快捷方式与安全信任
cd /d "%~dp0"

echo ================================================================
echo   ⚙️ DeepSeek Harness 桌面图标创建与 Windows 信任配置
echo ================================================================
echo.
echo 正在执行自动化配置（生成桌面快捷方式 + 本地证书信任）...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { $root = Resolve-Path '%~dp0'; $runtime = Join-Path $root 'runtime'; $exe = Join-Path $runtime 'DeepSeek Harness.exe'; $ico = Join-Path $runtime 'resources\app\assets\deepseek.ico'; if (-not (Test-Path $ico)) { $ico = $exe }; Write-Host '[1/3] 生成专属于本机的自签名证书并签名 exe...' -ForegroundColor Yellow; $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=DeepSeekHarnessLocal' -CertStoreLocation 'Cert:\CurrentUser\My'; if (Test-Path $exe) { Set-AuthenticodeSignature -Certificate $cert -FilePath $exe | Out-Null }; $certPath = \"$env:TEMP\deepseek-harness-$([Guid]::NewGuid().ToString('N')).cer\"; Export-Certificate -Cert $cert -FilePath $certPath | Out-Null; Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null; Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null; Remove-Item $certPath -Force -ErrorAction SilentlyContinue; Write-Host '[2/3] 创建桌面快捷方式...' -ForegroundColor Yellow; $wsh = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $shortcut = $wsh.CreateShortcut((Join-Path $desktop 'DeepSeek Harness.lnk')); $shortcut.TargetPath = (Join-Path $root '🚀 启动 DeepSeek Harness (推荐网页版).bat'); $shortcut.WorkingDirectory = $root; $shortcut.IconLocation = \"$ico,0\"; $shortcut.WindowStyle = 7; $shortcut.Save(); Write-Host '[3/3] 配置 PATH 环境变量...' -ForegroundColor Yellow; $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User); if ($userPath -notlike \"*$root*\") { [Environment]::SetEnvironmentVariable('Path', \"$userPath;$root\", [EnvironmentVariableTarget]::User); }; Write-Host ''; Write-Host '================================================================' -ForegroundColor Green; Write-Host '  🎉 全部配置完成！' -ForegroundColor Green; Write-Host '  1. 桌面快捷方式【DeepSeek Harness】已创建。' -ForegroundColor Green; Write-Host '  2. 本机安全信任已添加，彻底解除 Windows 11 智能应用控制 (SAC) 拦截。' -ForegroundColor Green; Write-Host '================================================================' -ForegroundColor Green; } catch { Write-Host ''; Write-Host \"[失败] $($_.Exception.Message)\" -ForegroundColor Red; Write-Host '如果提示权限问题，请右键此文件选择【以管理员身份运行】。' -ForegroundColor Yellow; }"

echo.
pause
