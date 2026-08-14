# ==============================================================================
# DeepSeek Harness Portable - One-Click Fast Updater (With Domestic Mirror Acceleration)
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$REPO = 'w1135766898/deepseek-harness-portable'
$SCRIPT_ROOT = $PSScriptRoot

# Determine app root
$APP_ROOT = $SCRIPT_ROOT
if ((Split-Path -Leaf $SCRIPT_ROOT) -ieq 'runtime') {
    $APP_ROOT = Split-Path -Parent $SCRIPT_ROOT
}

function Write-Banner {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '   🔄 DeepSeek Harness 在线检查与快速热更新程序                 ' -ForegroundColor Cyan
    Write-Host '   （内置中国大陆多节点智能加速与海外直连双通道）               ' -ForegroundColor Gray
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Get-LocalVersion {
    $paths = @(
        (Join-Path $APP_ROOT 'runtime\resources\app\package.json'),
        (Join-Path $APP_ROOT 'resources\app\package.json')
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                $json = Get-Content $p -Raw | ConvertFrom-Json
                if ($json.version) { return ('v' + $json.version) }
            } catch {}
        }
    }
    return '未知'
}

function Get-RemoteRelease {
    Write-Host '[1/4] 正在连接多节点查询官方最新发布版本 (含国内极速镜像)...' -ForegroundColor Yellow
    
    $endpoints = @(
        'https://registry.npmmirror.com/@deepseek-ai/dsh',
        ('https://api.github.com/repos/' + $REPO + '/releases/latest'),
        ('https://raw.gitmirror.com/' + $REPO + '/main/apps/desktop/package.json'),
        ('https://ghfast.top/https://raw.githubusercontent.com/' + $REPO + '/main/apps/desktop/package.json'),
        'https://registry.npmjs.org/@deepseek-ai/dsh'
    )

    foreach ($ep in $endpoints) {
        try {
            $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Updater' }
            $res = Invoke-RestMethod -Uri $ep -Headers $headers -TimeoutSec 5
            if ($res.'dist-tags'.latest) {
                Write-Host ('  -> [连接成功] 来自官方国内镜像源 (Alibaba Cloud CDN): v' + $res.'dist-tags'.latest) -ForegroundColor Green
                return [PSCustomObject]@{
                    tag_name = ('v' + $res.'dist-tags'.latest)
                    assets = @()
                }
            }
            if ($res.tag_name) {
                Write-Host ('  -> [连接成功] 来自 GitHub 官方发布节点: ' + $res.tag_name) -ForegroundColor Green
                return $res
            }
            if ($res.version) {
                Write-Host ('  -> [连接成功] 来自 Git 国内加速镜像: v' + $res.version) -ForegroundColor Green
                return [PSCustomObject]@{
                    tag_name = ('v' + $res.version)
                    assets = @()
                }
            }
        } catch {}
    }
    
    return [PSCustomObject]@{
        tag_name = 'v0.1.0-rc.5'
        assets = @()
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
    param($RemoteVer)
    Write-Host ('[3/4] 正在下载最新版本 (' + $RemoteVer + ')...') -ForegroundColor Yellow
    
    $fileName = 'DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip'
    $directUrl = 'https://github.com/' + $REPO + '/releases/download/' + $RemoteVer + '/' + $fileName
    
    $mirrors = @(
        $directUrl,
        ('https://ghfast.top/' + $directUrl),
        ('https://mirror.ghproxy.com/' + $directUrl),
        ('https://gh-proxy.com/' + $directUrl),
        ('https://gh.ddlc.top/' + $directUrl)
    )

    $tempZip = Join-Path $env:TEMP $fileName
    $downloadSuccess = $false
    foreach ($url in $mirrors) {
        try {
            $hostName = ([System.Uri]$url).Host
            Write-Host ('  -> 尝试连接更新节点: ' + $hostName + ' ...') -ForegroundColor Cyan
            Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing -TimeoutSec 120
            if ((Test-Path $tempZip) -and (Get-Item $tempZip).Length -gt 10000000) {
                $sizeMb = [Math]::Round(((Get-Item $tempZip).Length / 1MB), 2)
                Write-Host ('  -> [成功] 更新包下载完成 (' + $sizeMb + ' MB)！') -ForegroundColor Green
                $downloadSuccess = $true
                break
            }
        } catch {
            Write-Host ('  -> 节点连接超时，自动切换下一镜像...') -ForegroundColor Yellow
        }
    }

    if (-not $downloadSuccess) {
        throw '所有更新节点均连接失败，请检查网络或代理。'
    }

    Write-Host '[4/4] 正在热替换程序核心 (保留用户配置与会话)...' -ForegroundColor Yellow
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

    Write-Host '  -> 同步运行时与最新功能组件...' -ForegroundColor Cyan
    & robocopy.exe $sourceRoot $APP_ROOT /E /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
    $code = $LASTEXITCODE
    if ($code -ge 8) {
        throw ('文件同步失败，Robocopy 退出码: ' + $code)
    }

    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host ('  🎉 更新成功！已升级至最新版本 ' + $RemoteVer) -ForegroundColor Green
    Write-Host '  您的工作区、偏好配置与历史会话均已完整保留。' -ForegroundColor White
    Write-Host '================================================================' -ForegroundColor Green
    Write-Host ''
}

try {
    Write-Banner
    $localVer = Get-LocalVersion
    Write-Host ('  本地当前版本: ' + $localVer) -ForegroundColor White
    
    $release = Get-RemoteRelease
    $remoteVer = $release.tag_name
    Write-Host ('  远程最新版本: ' + $remoteVer) -ForegroundColor White
    Write-Host ''

    if ($localVer -eq $remoteVer -and -not $Force) {
        Write-Host '================================================================' -ForegroundColor Green
        Write-Host ('  [提示] 当前已经是最新版本 (' + $localVer + ')，无需更新！') -ForegroundColor Green
        Write-Host '  如果需要强制覆盖重新同步，请运行: update.cmd -Force' -ForegroundColor Gray
        Write-Host '================================================================' -ForegroundColor Green
        Write-Host ''
        return
    }

    Stop-RunningProcesses
    Apply-Update -RemoteVer $remoteVer
} catch {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ('  [更新失败] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '================================================================' -ForegroundColor Red
    Write-Host ''
}
