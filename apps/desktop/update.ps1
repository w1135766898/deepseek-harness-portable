# ============================================================================
# DeepSeek Harness portable distribution updater
#
# Updates the complete portable runtime from this distribution's GitHub
# release. User data lives in %USERPROFILE%\.dsh and is never part of the
# runtime swap.
# ============================================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$DISTRIBUTION_REPO = 'w1135766898/deepseek-harness-portable'
$SCRIPT_ROOT = $PSScriptRoot
$APP_ROOT = if ((Split-Path -Leaf $SCRIPT_ROOT) -ieq 'runtime') {
    Split-Path -Parent $SCRIPT_ROOT
} else {
    $SCRIPT_ROOT
}
$RUNTIME_DIR = Join-Path $APP_ROOT 'runtime'

function Write-Banner {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '   DeepSeek Harness portable runtime updater                    ' -ForegroundColor Cyan
    Write-Host '   Full release replacement with SHA-256 verification           ' -ForegroundColor Gray
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Get-LocalVersion {
    $manifest = Join-Path $RUNTIME_DIR 'resources\app\package.json'
    if (-not (Test-Path -LiteralPath $manifest)) { return 'unknown' }
    try {
        $json = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
        if ($json.version) { return ('v' + $json.version) }
    } catch {}
    return 'unknown'
}

function Get-ChecksumFromSource {
    param(
        [Parameter(Mandatory = $true)]$Release,
        [Parameter(Mandatory = $true)]$ZipAsset
    )

    if ($ZipAsset.digest -match '^sha256:([0-9a-fA-F]{64})$') {
        return $matches[1].ToUpperInvariant()
    }

    $tag = [string]$Release.tag_name
    $rawUrls = @(
        ('https://raw.githubusercontent.com/' + $DISTRIBUTION_REPO + '/' + $tag + '/SHA256SUMS.txt'),
        ('https://raw.githubusercontent.com/' + $DISTRIBUTION_REPO + '/main/SHA256SUMS.txt'),
        ('https://ghfast.top/https://raw.githubusercontent.com/' + $DISTRIBUTION_REPO + '/' + $tag + '/SHA256SUMS.txt')
    )
    foreach ($url in $rawUrls) {
        try {
            $text = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15).Content
            $escapedName = [regex]::Escape([string]$ZipAsset.name)
            $match = [regex]::Match($text, '(?im)^\s*([0-9a-f]{64})\s+\*?' + $escapedName + '\s*$')
            if ($match.Success) { return $match.Groups[1].Value.ToUpperInvariant() }
        } catch {}
    }
    throw ('No trusted SHA-256 digest was published for ' + $ZipAsset.name + '.')
}

function Get-RemoteRelease {
    $apiUrls = @(
        ('https://api.github.com/repos/' + $DISTRIBUTION_REPO + '/releases/latest'),
        ('https://ghfast.top/https://api.github.com/repos/' + $DISTRIBUTION_REPO + '/releases/latest')
    )
    foreach ($url in $apiUrls) {
        try {
            $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Portable-Updater' }
            $release = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 15
            $zipAsset = @($release.assets | Where-Object {
                $_.name -match '^DeepSeek-Harness-.*-win32-x64\.zip$'
            } | Select-Object -First 1)
            if ($zipAsset.Count -eq 0) { continue }
            $digest = Get-ChecksumFromSource -Release $release -ZipAsset $zipAsset[0]
            return [PSCustomObject]@{
                tag_name = [string]$release.tag_name
                version = ([string]$release.tag_name -replace '^v', '')
                asset_name = [string]$zipAsset[0].name
                asset_url = [string]$zipAsset[0].browser_download_url
                sha256 = $digest
            }
        } catch {}
    }
    throw 'Unable to obtain a portable release and its trusted SHA-256 digest.'
}

function Download-And-Verify {
    param(
        [Parameter(Mandatory = $true)]$Release,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $directUrl = $Release.asset_url
    $urls = @(
        $directUrl,
        ('https://ghfast.top/' + $directUrl),
        ('https://mirror.ghproxy.com/' + $directUrl),
        ('https://gh-proxy.com/' + $directUrl),
        ('https://gh.ddlc.top/' + $directUrl)
    )
    $errors = @()
    foreach ($url in $urls) {
        try {
            Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
            Write-Host ('  -> Downloading from ' + ([System.Uri]$url).Host + ' ...') -ForegroundColor Cyan
            Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -TimeoutSec 120
            if (-not (Test-Path -LiteralPath $Destination)) { throw 'download did not create a file' }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToUpperInvariant()
            if ($actual -ne $Release.sha256) {
                throw ('SHA-256 mismatch: expected ' + $Release.sha256 + ', got ' + $actual)
            }
            Write-Host '  -> Download verified with SHA-256.' -ForegroundColor Green
            return
        } catch {
            $errors += ([System.Uri]$url).Host + ': ' + $_.Exception.Message
        }
    }
    throw ('All release mirrors failed verification. ' + ($errors -join ' | '))
}

function Test-PortableLayout {
    param([Parameter(Mandatory = $true)][string]$Root)

    $required = @(
        'dsh.cmd',
        'update.ps1',
        'setup-shortcuts.ps1',
        'runtime\DeepSeek Harness.exe',
        'runtime\resources\app\package.json',
        'runtime\resources\app\lib\packaged-bin.js',
        'runtime\resources\app\node_modules\node-pty\prebuilds\win32-x64\pty.node',
        'runtime\resources\app\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node'
    )
    foreach ($relative in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $relative))) {
            throw ('Portable release is missing required file: ' + $relative)
        }
    }
    $sharpDir = Join-Path $Root 'runtime\resources\app\node_modules\@img\sharp-win32-x64\lib'
    if (@(Get-ChildItem -LiteralPath $sharpDir -Filter 'sharp-win32-x64-*.node' -File -ErrorAction SilentlyContinue).Count -eq 0) {
        throw 'Portable release is missing the sharp Windows native addon.'
    }

    $manifestPath = Join-Path $Root 'runtime\resources\app\package.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $nodeModules = Join-Path $Root 'runtime\resources\app\node_modules'
    foreach ($dependency in @($manifest.dependencies.PSObject.Properties.Name)) {
        $dependencyPath = Join-Path $nodeModules ($dependency -replace '/', '\')
        if (-not (Test-Path -LiteralPath $dependencyPath)) {
            throw ('Portable release dependency is missing: ' + $dependency)
        }
    }
}

function Stop-RunningProcesses {
    $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*DeepSeek Harness*' }
    if ($processes) {
        Write-Host '  -> Stopping running DeepSeek Harness processes ...' -ForegroundColor Yellow
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 750
    }
}

function Extract-Release {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & tar.exe -xf $ZipPath -C $Destination | Out-Null
        if ($LASTEXITCODE -ne 0) { throw ('archive extraction failed with tar exit code ' + $LASTEXITCODE) }
    } else {
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $Destination -Force
    }
    $inner = @(Get-ChildItem -LiteralPath $Destination -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' })
    $root = if ($inner.Count -eq 1) { $inner[0].FullName } else { $Destination }
    Test-PortableLayout -Root $root
    return $root
}

function Install-ReleaseRoot {
    param([Parameter(Mandatory = $true)][string]$SourceRoot)

    # Keep the backup beside the target so the rename remains atomic even when
    # the portable directory is installed on a drive other than %TEMP%.
    $backup = Join-Path $APP_ROOT ('.runtime-backup-' + [Guid]::NewGuid().ToString('N'))
    Stop-RunningProcesses
    if (Test-Path -LiteralPath $RUNTIME_DIR) {
        Move-Item -LiteralPath $RUNTIME_DIR -Destination $backup
    }
    try {
        Move-Item -LiteralPath (Join-Path $SourceRoot 'runtime') -Destination $RUNTIME_DIR
        foreach ($name in @(
            'dsh.cmd', 'update.ps1', 'setup-shortcuts.ps1', 'start-web.cmd', 'start-desktop.cmd',
            'update.cmd', '启动网页版.bat', '启动桌面窗口.bat', '启动桌面版.bat',
            '在线更新.bat', '创建桌面快捷方式.bat', '一键解除拦截(自签名信任).bat',
            '使用说明.txt', 'smoke-native.cjs'
        )) {
            $source = Join-Path $SourceRoot $name
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $APP_ROOT $name) -Force }
        }
        Test-PortableLayout -Root $APP_ROOT
        Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        if (Test-Path -LiteralPath $RUNTIME_DIR) { Remove-Item -LiteralPath $RUNTIME_DIR -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $RUNTIME_DIR }
        throw
    }
}

try {
    Write-Banner
    $localVersion = Get-LocalVersion
    Write-Host ('  Local version:  ' + $localVersion) -ForegroundColor White
    $release = Get-RemoteRelease
    Write-Host ('  Latest version: ' + $release.tag_name) -ForegroundColor White
    if (-not $Force -and $localVersion -eq $release.tag_name) {
        Write-Host '  Already up to date.' -ForegroundColor Green
        return
    }

    $zipPath = Join-Path $env:TEMP ('DeepSeek-Harness-' + $release.version + '.zip')
    $extractPath = Join-Path $env:TEMP ('dsh-update-' + [Guid]::NewGuid().ToString('N'))
    try {
        Download-And-Verify -Release $release -Destination $zipPath
        $sourceRoot = Extract-Release -ZipPath $zipPath -Destination $extractPath
        Install-ReleaseRoot -SourceRoot $sourceRoot
    } finally {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host ('Update complete: ' + $release.tag_name) -ForegroundColor Green
} catch {
    Write-Host ('Update failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
