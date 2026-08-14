# ==============================================================================
# DeepSeek Harness Portable - One-Click Online Installer for Windows (x64)
# Usage:
#   irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
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
    Write-Host '         DeepSeek Harness Windows 一键安装与配置程序            ' -ForegroundColor Cyan
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
        Write-Host '  -> [提示] 未检测到 Node.js。推荐安装官方 Node.js (https://nodejs.org) 以获得最佳兼容性与免拦截体验。' -ForegroundColor Yellow
    }
}

function Get-LatestReleaseInfo {
    Write-Host '[2/6] 获取 GitHub 最新发布版本信息...' -ForegroundColor Yellow
    $apiUrl = 'https://api.github.com/repos/' + $REPO + '/releases/latest'
    try {
        $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Installer' }
        $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 15
        return $release
    } catch {
        Write-Host '  -> 无法连接到 GitHub Releases API，尝试直接获取主分支分发配置...' -ForegroundColor Yellow
        return [PSCustomObject]@{
            tag_name = 'v0.1.0-rc.5'
            assets = @(
                [PSCustomObject]@{
                    name = 'DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip'
                    browser_download_url = 'https://github.com/' + $REPO + '/releases/download/v0.1.0-rc.5/DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip'
                }
            )
        }
    }
}

function Download-And-Extract {
    param($Release)
    $version = $Release.tag_name
    Write-Host ('[3/6] 准备安装版本: ' + $version + ' ...') -ForegroundColor Yellow
    
    $zipAsset = $Release.assets | Where-Object { $_.name -like '*win32-x64.zip' } | Select-Object -First 1
    if (-not $zipAsset) {
        $downloadUrl = 'https://github.com/' + $REPO + '/releases/download/' + $version + '/DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip'
        $zipName = 'DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip'
    } else {
        $downloadUrl = $zipAsset.browser_download_url
        $zipName = $zipAsset.name
    }

    $tempZip = Join-Path $env:TEMP $zipName
    Write-Host ('  -> 正在下载分发包 (' + $zipName + ')...') -ForegroundColor Cyan
    
    try {
        Start-BitsTransfer -Source $downloadUrl -Destination $tempZip -Description 'Downloading DeepSeek Harness' -ErrorAction Stop
    } catch {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    }
    
    Write-Host ('  -> 正在解压至: ' + $InstallDir + ' ...') -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

    $guid = [Guid]::NewGuid().ToString('N')
    $extractTemp = Join-Path $env:TEMP ('dsh-extract-' + $guid)
    New-Item -ItemType Directory -Path $extractTemp -Force | Out-Null
    
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & tar.exe -xf $tempZip -C $extractTemp
    } else {
        Expand-Archive -Path $tempZip -DestinationPath $extractTemp -Force
    }

    $innerDir = Get-ChildItem -Path $extractTemp -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' } | Select-Object -First 1
    $sourceRoot = if ($innerDir) { $innerDir.FullName } else { $extractTemp }

    & robocopy.exe $sourceRoot $InstallDir /E /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw ('文件复制失败，Robocopy 退出码: ' + $code)
    }

    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
}

function Setup-SecurityTrust {
    Write-Host '[4/6] 配置本地安全证书与签名 (绕过 Windows 11 SAC 拦截)...' -ForegroundColor Yellow
    $exePath = Join-Path $InstallDir 'DeepSeek Harness.exe'
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
            Write-Host ('  -> [提示] 自动自签名跳过 (' + $_.Exception.Message + ')，可通过 start-web.cmd 直接启动。') -ForegroundColor Gray
        }
    }
}

function Create-Shortcuts {
    Write-Host '[5/6] 创建快捷方式与环境命令...' -ForegroundColor Yellow
    $wshShell = New-Object -ComObject WScript.Shell
    $iconPath = Join-Path $InstallDir 'resources\app\assets\deepseek.ico'
    if (-not (Test-Path $iconPath)) {
        $iconPath = Join-Path $InstallDir 'DeepSeek Harness.exe'
    }

    # 1. Desktop Shortcut
    if (-not $NoDesktopShortcut) {
        $desktopPath = [Environment]::GetFolderPath('Desktop')
        $shortcutFile = Join-Path $desktopPath ($APP_NAME + '.lnk')
        $shortcut = $wshShell.CreateShortcut($shortcutFile)
        $shortcut.TargetPath = Join-Path $InstallDir 'start-web.cmd'
        $shortcut.WorkingDirectory = $InstallDir
        $shortcut.Description = 'DeepSeek Harness 智能编程与 Agent 运行时'
        $shortcut.IconLocation = $iconPath + ',0'
        $shortcut.WindowStyle = 7
        $shortcut.Save()
        Write-Host ('  -> 桌面快捷方式已创建: ' + $shortcutFile) -ForegroundColor Green
    }

    # 2. Start Menu Shortcut
    $startMenuPrograms = [Environment]::GetFolderPath('Programs')
    $appStartMenuDir = Join-Path $startMenuPrograms 'DeepSeek Harness'
    New-Item -ItemType Directory -Path $appStartMenuDir -Force | Out-Null
    
    $startShortcut = $wshShell.CreateShortcut((Join-Path $appStartMenuDir ($APP_NAME + '.lnk')))
    $startShortcut.TargetPath = Join-Path $InstallDir 'start-web.cmd'
    $startShortcut.WorkingDirectory = $InstallDir
    $startShortcut.Description = 'DeepSeek Harness 智能编程与 Agent 运行时'
    $startShortcut.IconLocation = $iconPath + ',0'
    $startShortcut.WindowStyle = 7
    $startShortcut.Save()

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
    Download-And-Extract -Release $releaseInfo
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
