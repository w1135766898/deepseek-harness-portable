[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
    $scriptDir = $PSScriptRoot
    $appRoot = if ((Split-Path -Leaf $scriptDir) -ieq 'runtime') { Split-Path -Parent $scriptDir } else { $scriptDir }
    $runtimeDir = Join-Path $appRoot 'runtime'
    $exe = Join-Path $runtimeDir 'DeepSeek Harness.exe'
    $ico = Join-Path $runtimeDir 'resources\app\assets\deepseek.ico'
    if (-not (Test-Path $ico)) { $ico = $exe }

    Write-Host ''
    Write-Host '================================================' -ForegroundColor Cyan
    Write-Host '  DeepSeek Harness 桌面图标创建与 Windows 信任配置 ' -ForegroundColor Cyan
    Write-Host '================================================' -ForegroundColor Cyan
    Write-Host ''
    
    Write-Host '[1/3] 配置本地自签名证书与信任 (解除 Windows 11 SAC 拦截)...' -ForegroundColor Yellow
    if (Test-Path $exe) {
        $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=DeepSeekHarnessLocal' -CertStoreLocation 'Cert:\CurrentUser\My'
        Set-AuthenticodeSignature -Certificate $cert -FilePath $exe | Out-Null
        $guid = [Guid]::NewGuid().ToString('N')
        $certPath = Join-Path $env:TEMP ('dsh-' + $guid + '.cer')
        Export-Certificate -Cert $cert -FilePath $certPath | Out-Null
        Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
        Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null
        Remove-Item $certPath -Force -ErrorAction SilentlyContinue
        Write-Host '  -> [成功] 本地信任签名已注入！' -ForegroundColor Green
    }

    Write-Host '[2/3] 创建桌面快捷方式...' -ForegroundColor Yellow
    $wsh = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcut = $wsh.CreateShortcut((Join-Path $desktop 'DeepSeek Harness.lnk'))
    $shortcut.TargetPath = (Join-Path $appRoot '启动网页版.bat')
    $shortcut.WorkingDirectory = $appRoot
    $shortcut.IconLocation = ($ico + ',0')
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host '  -> [成功] 桌面快捷方式已创建！' -ForegroundColor Green

    Write-Host '[3/3] 写入当前用户 PATH 环境变量...' -ForegroundColor Yellow
    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    if ($userPath -notlike ('*' + $appRoot + '*')) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath + ';' + $appRoot), [EnvironmentVariableTarget]::User)
    }
    Write-Host '  -> [成功] PATH 环境变量已配置！' -ForegroundColor Green

    Write-Host ''
    Write-Host '================================================' -ForegroundColor Green
    Write-Host '  🎉 全部配置完成！' -ForegroundColor Green
    Write-Host '  您现在可以直接双击桌面图标启动 DeepSeek Harness。' -ForegroundColor White
    Write-Host '================================================' -ForegroundColor Green
    Write-Host ''
} catch {
    Write-Host ''
    Write-Host ('[错误] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
}
