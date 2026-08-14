# ==============================================================================
# DeepSeek Harness Portable - One-Click Fast Updater
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$REPO = 'w1135766898/deepseek-harness-portable'
$CURRENT_DIR = $PSScriptRoot

function Write-Banner {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '         DeepSeek Harness 在线检查与快速热更新程序              ' -ForegroundColor Cyan
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Get-LocalVersion {
    $pkgJson = Join-Path $CURRENT_DIR 'resources\app\package.json'
    if (Test-Path $pkgJson) {
        try {
            $json = Get-Content $pkgJson -Raw | ConvertFrom-Json
            if ($json.version) { return ('v' + $json.version) }
        } catch {}
    }
    return '未知'
}

function Get-RemoteRelease {
    Write-Host '[1/4] 正在连接 GitHub 查询最新发布版本...' -ForegroundColor Yellow
    $apiUrl = 'https://api.github.com/repos/' + $REPO + '/releases/latest'
    $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Updater' }
    try {
        $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 15
        return $release
    } catch {
        throw ('无法获取远程版本信息，请检查网络连接或稍后重试: ' + $_.Exception.Message)
    }
}

function Stop-RunningProcesses {
    Write-Host '[2/4] 检查并暂停正在运行的 DeepSeek Harness 实例...' -ForegroundColor Yellow
    $procs = Get-Process | Where-Object { $_.ProcessName -like '*DeepSeek Harness*' }
    if ($procs) {
        Write-Host '  -> 正在关闭后台运行中的实例...' -ForegroundColor Gray
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Apply-Update {
    param($Release)
    $remoteVer = $Release.tag_name
    Write-Host ('[3/4] 正在下载最新版本 (' + $remoteVer + ')...') -ForegroundColor Yellow
    
    $zipAsset = $Release.assets | Where-Object { $_.name -like '*win32-x64.zip' } | Select-Object -First 1
    if (-not $zipAsset) {
        throw '未找到匹配的 Windows x64 发布包资产。'
    }
    
    $tempZip = Join-Path $env:TEMP $zipAsset.name
    Write-Host ('  -> 下载地址: ' + $zipAsset.browser_download_url) -ForegroundColor Gray
    
    try {
        Start-BitsTransfer -Source $zipAsset.browser_download_url -Destination $tempZip -Description 'Downloading DeepSeek Harness Update' -ErrorAction Stop
    } catch {
        Invoke-WebRequest -Uri $zipAsset.browser_download_url -OutFile $tempZip -UseBasicParsing
    }
    
    Write-Host '[4/4] 正在热替换程序核心 (保留用户数据)...' -ForegroundColor Yellow
    $guid = [Guid]::NewGuid().ToString('N')
    $tempExtract = Join-Path $env:TEMP ('dsh-update-' + $guid)
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null
    
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & tar.exe -xf $tempZip -C $tempExtract
    } else {
        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    }

    $innerDir = Get-ChildItem -Path $tempExtract -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' } | Select-Object -First 1
    $sourceRoot = if ($innerDir) { $innerDir.FullName } else { $tempExtract }

    Write-Host '  -> 同步核心运行时与最新组件...' -ForegroundColor Cyan
    & robocopy.exe $sourceRoot $CURRENT_DIR /E /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw ('文件同步失败，Robocopy 退出码: ' + $code)
    }

    # Cleanup temp
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host ('  🎉 更新成功！已升级至最新版本 ' + $remoteVer) -ForegroundColor Green
    Write-Host '  您的工作区、配置与历史会话均已完整保留。' -ForegroundColor White
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host ''
}

try {
    Write-Banner
    $localVer = Get-LocalVersion
    Write-Host ('  本地当前版本: ' + $localVer) -ForegroundColor White
    
    $release = Get-RemoteRelease
    $remoteVer = $release.tag_name
    Write-Host ('  GitHub最新版本: ' + $remoteVer) -ForegroundColor White
    Write-Host ''

    if ($localVer -eq $remoteVer -and -not $Force) {
        Write-Host '================================================================' -ForegroundColor Green
        Write-Host ('  [提示] 当前已经是最新版本 (' + $localVer + ')，无需更新！') -ForegroundColor Green
        Write-Host '  如果需要强制重新覆盖更新，请运行: update.cmd -Force' -ForegroundColor Gray
        Write-Host '================================================================' -ForegroundColor Green
        Write-Host ''
        return
    }

    Stop-RunningProcesses
    Apply-Update -Release $release
} catch {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ('  [更新失败] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ''
}
