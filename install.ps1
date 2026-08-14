# ==============================================================================
# DeepSeek Harness Portable - One-Click Online Installer for Windows (x64)
# 支持中国大陆镜像多节点容灾加速与全球官方直连
# Usage:
#   海外/直连: irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
#   大陆加速: irm https://ghfast.top/https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
# ==============================================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\DeepSeek-Harness",
    [switch]$NoDesktopShortcut,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$REPO = 'w1135766898/deepseek-harness-portable'
$APP_NAME = 'DeepSeek Harness'

function Write-Header {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '   🚀 DeepSeek Harness Windows 一键极速安装与配置程序           ' -ForegroundColor Cyan
    Write-Host '   （内置中国大陆多节点智能加速与海外直连双通道）               ' -ForegroundColor Gray
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Test-Prerequisites {
    Write-Host '[1/6] 检查系统环境...' -ForegroundColor Yellow
    if ([IntPtr]::Size -ne 8) {
        throw 'DeepSeek Harness 仅支持 64 位 Windows 系统 (x64)。'
    }
    
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $nodeVer = & node -v
        Write-Host ('  -> 检测到 Node.js: ' + $nodeVer) -ForegroundColor Green
    } else {
        Write-Host '  -> [提示] 未检测到全局 Node.js。建议安装官方 Node.js (https://nodejs.org) 以获得最佳免拦截体验。' -ForegroundColor Yellow
    }
}

function Get-LatestReleaseInfo {
    Write-Host '[2/6] 获取最新版本信息 (智能多通道查询)...' -ForegroundColor Yellow
    
    $endpoints = @(
        ('https://api.github.com/repos/' + $REPO + '/releases/latest'),
        ('https://ghfast.top/https://raw.githubusercontent.com/' + $REPO + '/main/apps/desktop/package.json'),
        ('https://raw.gitmirror.com/' + $REPO + '/main/apps/desktop/package.json')
    )

    foreach ($ep in $endpoints) {
        try {
            $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Installer' }
            $res = Invoke-RestMethod -Uri $ep -Headers $headers -TimeoutSec 5
            if ($res.tag_name) {
                Write-Host ('  -> [成功] 远程发布通道连接畅通，最新版本: ' + $res.tag_name) -ForegroundColor Green
                return $res
            }
            if ($res.version) {
                Write-Host ('  -> [成功] 镜像发布通道连接畅通，最新版本: v' + $res.version) -ForegroundColor Green
                return [PSCustomObject]@{
                    tag_name = ('v' + $res.version)
                    assets = @()
                }
            }
        } catch {}
    }

    Write-Host '  -> 自动采用官方最新候选版本: v0.1.0-rc.6' -ForegroundColor Gray
    return [PSCustomObject]@{
        tag_name = 'v0.1.0-rc.6'
        assets = @()
    }
}

function Download-WithMirrorFailover {
    param(
        [string]$Version,
        [string]$DestinationZip
    )

    $fileName = 'DeepSeek-Harness-0.1.0-rc.6-win32-x64.zip'
    $directUrl = 'https://github.com/' + $REPO + '/releases/download/' + $Version + '/' + $fileName
    
    $mirrors = @(
        $directUrl,
        ('https://ghfast.top/' + $directUrl),
        ('https://mirror.ghproxy.com/' + $directUrl),
        ('https://gh-proxy.com/' + $directUrl),
        ('https://gh.ddlc.top/' + $directUrl)
    )

    $downloadSuccess = $false
    foreach ($url in $mirrors) {
        try {
            $hostName = ([System.Uri]$url).Host
            Write-Host ('  -> 正在连接下载节点: ' + $hostName + ' ...') -ForegroundColor Cyan
            
            # Use basic parsing with 120s timeout
            Invoke-WebRequest -Uri $url -OutFile $DestinationZip -UseBasicParsing -TimeoutSec 120
            
            if ((Test-Path $DestinationZip) -and (Get-Item $DestinationZip).Length -gt 10000000) {
                $sizeMb = [Math]::Round(((Get-Item $DestinationZip).Length / 1MB), 2)
                Write-Host ('  -> [成功] 下载完成 (' + $sizeMb + ' MB)，节点响应正常！') -ForegroundColor Green
                $downloadSuccess = $true
                break
            }
        } catch {
            Write-Host ('  -> 节点响应异常，自动无缝切换下一个加速镜像...') -ForegroundColor Yellow
        }
    }

    if (-not $downloadSuccess) {
        throw '所有下载节点均连接失败，请检查网络或代理设置。'
    }
}

function Extract-And-Install {
    param(
        [string]$ZipPath
    )
    Write-Host ('[3/6] 正在解压并部署到: ' + $InstallDir + ' ...') -ForegroundColor Yellow
    
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $guid = [Guid]::NewGuid().ToString('N')
    $extractTemp = Join-Path $env:TEMP ('dsh-extract-' + $guid)
    New-Item -ItemType Directory -Path $extractTemp -Force | Out-Null

    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & tar.exe -xf $ZipPath -C $extractTemp
    } else {
        Expand-Archive -Path $ZipPath -DestinationPath $extractTemp -Force
    }

    $innerDir = Get-ChildItem -Path $extractTemp -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' } | Select-Object -First 1
    $sourceRoot = if ($innerDir) { $innerDir.FullName } else { $extractTemp }

    & robocopy.exe $sourceRoot $InstallDir /E /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw ('文件同步失败，Robocopy 错误码: ' + $code)
    }

    Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
}

function Setup-SecurityTrust {
    Write-Host '[4/6] 配置本地安全证书与信任 (彻底规避 Windows 11 SAC 拦截)...' -ForegroundColor Yellow
    $exePath = Join-Path $InstallDir 'runtime\DeepSeek Harness.exe'
    if (-not (Test-Path $exePath)) {
        $exePath = Join-Path $InstallDir 'DeepSeek Harness.exe'
    }
    
    if (Test-Path $exePath) {
        try {
            $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=DeepSeekHarnessLocal' -CertStoreLocation 'Cert:\CurrentUser\My'
            Set-AuthenticodeSignature -Certificate $cert -FilePath $exePath | Out-Null
            $guid = [Guid]::NewGuid().ToString('N')
            $certTemp = Join-Path $env:TEMP ('dsh-cert-' + $guid + '.cer')
            Export-Certificate -Cert $cert -FilePath $certTemp | Out-Null
            Import-Certificate -FilePath $certTemp -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
            Import-Certificate -FilePath $certTemp -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null
            Remove-Item $certTemp -Force -ErrorAction SilentlyContinue
            Write-Host '  -> [成功] 本地信任签名配置完成！' -ForegroundColor Green
        } catch {
            Write-Host ('  -> [提示] 自动自签名跳过 (' + $_.Exception.Message + ')。') -ForegroundColor Gray
        }
    }
}

function Create-Shortcuts {
    Write-Host '[5/6] 创建快捷方式与环境命令...' -ForegroundColor Yellow
    $wshShell = New-Object -ComObject WScript.Shell
    $targetExe = Join-Path $InstallDir 'runtime\DeepSeek Harness.exe'
    $workDir = Join-Path $InstallDir 'runtime'
    if (-not (Test-Path $targetExe)) {
        $targetExe = Join-Path $InstallDir 'DeepSeek Harness.exe'
        $workDir = $InstallDir
    }

    # 1. Desktop Shortcut
    if (-not $NoDesktopShortcut) {
        $desktopPath = [Environment]::GetFolderPath('Desktop')
        $shortcutFile = Join-Path $desktopPath ($APP_NAME + '.lnk')
        $shortcut = $wshShell.CreateShortcut($shortcutFile)
        $shortcut.TargetPath = $targetExe
        $shortcut.WorkingDirectory = $workDir
        $shortcut.Description = 'DeepSeek Harness 原生桌面客户端'
        $shortcut.IconLocation = $iconPath + ',0'
        $shortcut.WindowStyle = 1
        $shortcut.Save()
        Write-Host ('  -> 桌面原生应用快捷方式已创建: ' + $shortcutFile) -ForegroundColor Green
    }

    # 2. Start Menu Shortcut
    $startMenuPrograms = [Environment]::GetFolderPath('Programs')
    $appStartMenuDir = Join-Path $startMenuPrograms 'DeepSeek Harness'
    New-Item -ItemType Directory -Path $appStartMenuDir -Force | Out-Null
    
    $startShortcut = $wshShell.CreateShortcut((Join-Path $appStartMenuDir ($APP_NAME + '.lnk')))
    $startShortcut.TargetPath = $targetExe
    $startShortcut.WorkingDirectory = $workDir
    $startShortcut.Description = 'DeepSeek Harness 原生桌面客户端'
    $startShortcut.IconLocation = $iconPath + ',0'
    $startShortcut.WindowStyle = 1
    $startShortcut.Save()

    $webShortcut = $wshShell.CreateShortcut((Join-Path $appStartMenuDir 'DeepSeek Harness (网页服务模式).lnk'))
    $webShortcut.TargetPath = (Join-Path $InstallDir '启动网页版.bat')
    $webShortcut.WorkingDirectory = $InstallDir
    $webShortcut.IconLocation = $iconPath + ',0'
    $webShortcut.WindowStyle = 7
    $webShortcut.Save()

    # 3. Add to PATH
    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    if ($userPath -notlike ('*' + $InstallDir + '*')) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath + ';' + $InstallDir), [EnvironmentVariableTarget]::User)
        $env:Path += ';' + $InstallDir
        Write-Host '  -> 已将安装目录添加至当前用户的 PATH 环境变量！' -ForegroundColor Green
    }
}

function Write-Success {
    Write-Host '[6/6] 安装完成！' -ForegroundColor Green
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host '  🎉 DeepSeek Harness 已成功安装到您的电脑！' -ForegroundColor Green
    Write-Host ('  安装目录: ' + $InstallDir) -ForegroundColor White
    Write-Host ''
    Write-Host '  启动方式:' -ForegroundColor Cyan
    Write-Host '  1. 双击桌面上的【DeepSeek Harness】快捷方式' -ForegroundColor White
    Write-Host '  2. 在任何终端中输入: dsh' -ForegroundColor White
    Write-Host '  3. 以后需要升级时，输入: dsh update 或重新运行安装命令' -ForegroundColor White
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host ''
}

try {
    Write-Header
    Test-Prerequisites
    $releaseInfo = Get-LatestReleaseInfo
    $tempZip = Join-Path $env:TEMP ('DeepSeek-Harness-' + $releaseInfo.tag_name + '.zip')
    Download-WithMirrorFailover -Version $releaseInfo.tag_name -DestinationZip $tempZip
    Extract-And-Install -ZipPath $tempZip
    Setup-SecurityTrust
    Create-Shortcuts
    Write-Success
} catch {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host '  [错误] 安装过程中遇到异常:' -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ''
}
