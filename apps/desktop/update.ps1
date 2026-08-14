# ============================================================================
# DeepSeek Harness portable distribution updater
#
# Updates the complete portable runtime from this distribution's GitHub
# release. User data lives in %USERPROFILE%\.dsh and is never part of the
# runtime swap.
# ============================================================================

[CmdletBinding()]
param(
    [switch]$Force,
    [string]$StatusFile,
    [string]$FromVersion,
    [string]$TargetVersion,
    [string]$PackagePath,
    [string]$ExpectedSha256,
    [switch]$LaunchAfterUpdate
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$DISTRIBUTION_REPO = 'wsnxxxs/deepseek-harness-portable'
$RELEASE_MANIFEST_NAME = 'release-manifest.json'
$GITHUB_MIRROR_PREFIXES = @(
    '',
    'https://ghfast.top/',
    'https://mirror.ghproxy.com/',
    'https://gh-proxy.com/',
    'https://gh.ddlc.top/'
)
$SCRIPT_ROOT = $PSScriptRoot
$APP_ROOT = if ((Split-Path -Leaf $SCRIPT_ROOT) -ieq 'runtime') {
    Split-Path -Parent $SCRIPT_ROOT
} else {
    $SCRIPT_ROOT
}
$RUNTIME_DIR = Join-Path $APP_ROOT 'runtime'
if ([string]::IsNullOrWhiteSpace($StatusFile) -and $env:APPDATA) {
    $StatusFile = Join-Path $env:APPDATA 'DeepSeek Harness\update-status.json'
}

function Write-Banner {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '   DeepSeek Harness portable runtime updater                    ' -ForegroundColor Cyan
    Write-Host '   Full release replacement with SHA-256 verification           ' -ForegroundColor Gray
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Read-JsonIfPresent {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Get-MirrorUrls {
    param([Parameter(Mandatory = $true)][string]$Url)

    foreach ($prefix in $GITHUB_MIRROR_PREFIXES) {
        if ([string]::IsNullOrEmpty($prefix)) {
            $Url
        } else {
            $prefix + $Url
        }
    }
}

function Write-UpdateStatus {
    param(
        [Parameter(Mandatory = $true)][string]$State,
        [Parameter(Mandatory = $true)][string]$Stage,
        [string]$Message,
        [string]$From,
        [string]$Target
    )

    if ([string]::IsNullOrWhiteSpace($StatusFile)) { return }
    try {
        $existing = Read-JsonIfPresent $StatusFile
        $now = [DateTime]::UtcNow.ToString('o')
        $startedAt = if ($existing -and $existing.startedAt) {
            [string]$existing.startedAt
        } else {
            $now
        }
        $effectiveFrom = if (-not [string]::IsNullOrWhiteSpace($From)) {
            $From
        } elseif ($existing -and $existing.fromVersion) {
            [string]$existing.fromVersion
        } else {
            ''
        }
        $effectiveTarget = if (-not [string]::IsNullOrWhiteSpace($Target)) {
            $Target
        } elseif ($existing -and $existing.targetVersion) {
            [string]$existing.targetVersion
        } else {
            ''
        }
        $payload = [ordered]@{
            state = $State
            fromVersion = $effectiveFrom
            targetVersion = $effectiveTarget
            stage = $Stage
            message = if ($Message) { $Message } else { '' }
            updatedAt = $now
            startedAt = $startedAt
            processId = $PID
        }
        $parent = Split-Path -Parent $StatusFile
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        $temporary = $StatusFile + '.' + $PID + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
        $encoding = New-Object System.Text.UTF8Encoding($false)
        try {
            [System.IO.File]::WriteAllText(
                $temporary,
                ($payload | ConvertTo-Json -Depth 4),
                $encoding
            )
            if (Test-Path -LiteralPath $StatusFile) {
                try {
                    [System.IO.File]::Replace($temporary, $StatusFile, $null, $true)
                } catch {
                    Move-Item -LiteralPath $temporary -Destination $StatusFile -Force
                }
            } else {
                Move-Item -LiteralPath $temporary -Destination $StatusFile -Force
            }
        } finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host ('  -> Unable to persist update status: ' + $_.Exception.Message) -ForegroundColor DarkYellow
    }
}

function Get-LocalReleaseInfo {
    $releaseManifest = Read-JsonIfPresent (Join-Path $APP_ROOT $RELEASE_MANIFEST_NAME)
    $packageManifest = Read-JsonIfPresent (Join-Path $RUNTIME_DIR 'resources\app\package.json')
    $distributionVersion = $null
    $desktopVersion = $null
    $kernelVersion = $null
    if ($releaseManifest -and $releaseManifest.distributionVersion) {
        $distributionVersion = [string]$releaseManifest.distributionVersion
    } elseif ($packageManifest -and $packageManifest.distributionVersion) {
        $distributionVersion = [string]$packageManifest.distributionVersion
    } elseif ($packageManifest -and $packageManifest.version) {
        $distributionVersion = [string]$packageManifest.version
    }
    if ($releaseManifest -and $releaseManifest.desktopVersion) {
        $desktopVersion = [string]$releaseManifest.desktopVersion
    } elseif ($packageManifest -and $packageManifest.version) {
        $desktopVersion = [string]$packageManifest.version
    }
    if ($releaseManifest -and $releaseManifest.kernelVersion) {
        $kernelVersion = [string]$releaseManifest.kernelVersion
    }
    return [PSCustomObject]@{
        distributionVersion = if ($distributionVersion) { $distributionVersion } else { '0.0.0' }
        desktopVersion = if ($desktopVersion) { $desktopVersion } else { 'unknown' }
        kernelVersion = if ($kernelVersion) { $kernelVersion } else { 'unknown' }
    }
}

function Normalize-Version {
    param([Parameter(Mandatory = $true)][string]$Version)
    return ($Version -replace '^v', '').Trim()
}

function Compare-Semver {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right
    )
    $leftMatch = [regex]::Match((Normalize-Version $Left), '^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$')
    $rightMatch = [regex]::Match((Normalize-Version $Right), '^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$')
    if (-not $leftMatch.Success -or -not $rightMatch.Success) {
        return [string]::CompareOrdinal((Normalize-Version $Left), (Normalize-Version $Right))
    }
    for ($index = 1; $index -le 3; $index++) {
        $comparison = [int]$leftMatch.Groups[$index].Value - [int]$rightMatch.Groups[$index].Value
        if ($comparison -ne 0) { return $comparison }
    }
    $leftPre = $leftMatch.Groups[4].Value
    $rightPre = $rightMatch.Groups[4].Value
    if ($leftPre -eq $rightPre) { return 0 }
    if ([string]::IsNullOrEmpty($leftPre)) { return 1 }
    if ([string]::IsNullOrEmpty($rightPre)) { return -1 }
    $leftFields = $leftPre.Split('.')
    $rightFields = $rightPre.Split('.')
    for ($index = 0; $index -lt [Math]::Max($leftFields.Count, $rightFields.Count); $index++) {
        if ($index -ge $leftFields.Count) { return -1 }
        if ($index -ge $rightFields.Count) { return 1 }
        if ($leftFields[$index] -eq $rightFields[$index]) { continue }
        $leftNumeric = $leftFields[$index] -match '^\d+$'
        $rightNumeric = $rightFields[$index] -match '^\d+$'
        if ($leftNumeric -and $rightNumeric) { return ([int]$leftFields[$index] - [int]$rightFields[$index]) }
        if ($leftNumeric -ne $rightNumeric) { return $(if ($leftNumeric) { -1 } else { 1 }) }
        return [string]::CompareOrdinal($leftFields[$index], $rightFields[$index])
    }
    return 0
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
    $rawUrls = @()
    foreach ($baseUrl in @(
        ('https://raw.githubusercontent.com/' + $DISTRIBUTION_REPO + '/' + $tag + '/SHA256SUMS.txt'),
        ('https://raw.githubusercontent.com/' + $DISTRIBUTION_REPO + '/main/SHA256SUMS.txt')
    )) {
        $rawUrls += @(Get-MirrorUrls $baseUrl)
    }
    foreach ($url in $rawUrls) {
        try {
            $text = (Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 8).Content
            $escapedName = [regex]::Escape([string]$ZipAsset.name)
            $match = [regex]::Match($text, '(?im)^\s*([0-9a-f]{64})\s+\*?' + $escapedName + '\s*$')
            if ($match.Success) { return $match.Groups[1].Value.ToUpperInvariant() }
        } catch {}
    }
    throw ('No trusted SHA-256 digest was published for ' + $ZipAsset.name + '.')
}

function Get-RemoteRelease {
    $apiUrls = @(Get-MirrorUrls ('https://api.github.com/repos/' + $DISTRIBUTION_REPO + '/releases/latest'))
    $release = $null
    $zipAsset = $null
    foreach ($url in $apiUrls) {
        try {
            $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Portable-Updater' }
            $candidate = Invoke-RestMethod -Uri $url -Headers $headers -MaximumRedirection 5 -TimeoutSec 8
            $version = ([string]$candidate.tag_name -replace '^v', '')
            $candidateAsset = @($candidate.assets | Where-Object {
                $_.name -match ('^DeepSeek-Harness-' + [regex]::Escape($version) + '-win32-x64\.zip$')
            } | Select-Object -First 1)
            if ($candidateAsset.Count -eq 0) { continue }
            $release = $candidate
            $zipAsset = $candidateAsset[0]
            break
        } catch {}
    }
    if (-not $release -or -not $zipAsset) {
        throw 'Unable to obtain a matching portable release from the configured API sources.'
    }

    $version = ([string]$release.tag_name -replace '^v', '')
    $digest = Get-ChecksumFromSource -Release $release -ZipAsset $zipAsset
    return [PSCustomObject]@{
        tag_name = [string]$release.tag_name
        version = $version
        asset_name = [string]$zipAsset.name
        asset_url = [string]$zipAsset.browser_download_url
        sha256 = $digest
    }
}

function Get-RemoteReleaseByVersion {
    param([Parameter(Mandatory = $true)][string]$Version)

    $normalizedVersion = Normalize-Version $Version
    $tag = 'v' + $normalizedVersion
    $assetName = 'DeepSeek-Harness-' + $normalizedVersion + '-win32-x64.zip'
    $zipAsset = [PSCustomObject]@{
        name = $assetName
        digest = ''
    }
    $release = [PSCustomObject]@{
        tag_name = $tag
    }
    $digest = Get-ChecksumFromSource -Release $release -ZipAsset $zipAsset
    return [PSCustomObject]@{
        tag_name = $tag
        version = $normalizedVersion
        asset_name = $assetName
        asset_url = 'https://github.com/' + $DISTRIBUTION_REPO + '/releases/download/' + $tag + '/' + $assetName
        sha256 = $digest
    }
}

function Verify-LocalPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedDigest
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw ('The prepared update package was not found: ' + $Path)
    }
    $expected = ($ExpectedDigest -replace '^sha256:', '').Trim().ToUpperInvariant()
    if ($expected -notmatch '^[0-9A-F]{64}$') {
        throw 'The prepared update package does not have a valid SHA-256 digest.'
    }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToUpperInvariant()
    if ($actual -ne $expected) {
        throw ('SHA-256 mismatch: expected ' + $expected + ', got ' + $actual)
    }
}

function Download-And-Verify {
    param(
        [Parameter(Mandatory = $true)]$Release,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $directUrl = $Release.asset_url
    $urls = @(Get-MirrorUrls $directUrl)
    $errors = @()
    foreach ($url in $urls) {
        try {
            Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
            Write-UpdateStatus -State 'downloading' -Stage 'download' -Message ('Downloading from ' + ([System.Uri]$url).Host) -From $FromVersion -Target $TargetVersion
            Write-Host ('  -> Downloading from ' + ([System.Uri]$url).Host + ' ...') -ForegroundColor Cyan
            Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30
            if (-not (Test-Path -LiteralPath $Destination)) { throw 'download did not create a file' }
            Write-UpdateStatus -State 'verifying' -Stage 'verify' -Message 'Verifying the downloaded ZIP with SHA-256.' -From $FromVersion -Target $TargetVersion
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
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$ExpectedDistributionVersion
    )

    $required = @(
        $RELEASE_MANIFEST_NAME,
        'dsh.cmd',
        'uninstall.cmd',
        'uninstall.ps1',
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

    $releaseManifest = Get-Content -LiteralPath (Join-Path $Root $RELEASE_MANIFEST_NAME) -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($field in @('distributionVersion', 'desktopVersion', 'kernelVersion')) {
        if (-not $releaseManifest.$field) {
            throw ('The release manifest is missing: ' + $field)
        }
    }
    if ($ExpectedDistributionVersion) {
        $actualDistributionVersion = Normalize-Version ([string]$releaseManifest.distributionVersion)
        $expectedDistributionVersion = Normalize-Version $ExpectedDistributionVersion
        if ($actualDistributionVersion -ne $expectedDistributionVersion) {
            throw ('The release manifest version does not match the release tag: ' + $releaseManifest.distributionVersion)
        }
    }

    $manifestPath = Join-Path $Root 'runtime\resources\app\package.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $nodeModules = Join-Path $Root 'runtime\resources\app\node_modules'
    foreach ($dependency in @($manifest.dependencies.PSObject.Properties.Name)) {
        $dependencyPath = Join-Path $nodeModules ($dependency -replace '/', '\')
        if (-not (Test-Path -LiteralPath $dependencyPath)) {
            throw ('Portable release dependency is missing: ' + $dependency)
        }
    }
}

function Get-RunningHarnessProcesses {
    return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*DeepSeek Harness*' })
}

function Wait-ForHarnessExit {
    param([int]$TimeoutSeconds = 20)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ((Get-RunningHarnessProcesses).Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
}

function Stop-RunningProcesses {
    Write-UpdateStatus -State 'replacing' -Stage 'swap' -Message 'Waiting for the desktop shell to exit.' -From $FromVersion -Target $TargetVersion
    Wait-ForHarnessExit
    $processes = Get-RunningHarnessProcesses
    if ($processes.Count -gt 0) {
        Write-Host '  -> Graceful exit timed out; stopping DeepSeek Harness processes ...' -ForegroundColor Yellow
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 750
    }
    if ((Get-RunningHarnessProcesses).Count -gt 0) {
        throw 'DeepSeek Harness is still running and the runtime cannot be replaced.'
    }
}

function Extract-Release {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$ExpectedDistributionVersion
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
    Test-PortableLayout -Root $root -ExpectedDistributionVersion $ExpectedDistributionVersion
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
            'release-manifest.json', 'dsh.cmd', 'uninstall.cmd', 'uninstall.ps1', 'update.ps1', 'setup-shortcuts.ps1', 'start-web.cmd', 'start-desktop.cmd',
            'update.cmd', '启动网页版.bat', '启动桌面窗口.bat', '启动桌面版.bat',
            '在线更新.bat', '创建桌面快捷方式.bat', '一键解除拦截(自签名信任).bat',
            '使用说明.txt', '使用说明.en.txt', 'smoke-native.cjs'
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

function Start-UpdatedDesktop {
    if (-not $LaunchAfterUpdate) { return }
    $desktopExecutable = Join-Path $APP_ROOT 'runtime\DeepSeek Harness.exe'
    if (-not (Test-Path -LiteralPath $desktopExecutable)) {
        Write-Host '  -> Update completed, but the desktop executable was not found for automatic restart.' -ForegroundColor DarkYellow
        return
    }
    try {
        Start-Process -FilePath $desktopExecutable -WorkingDirectory $APP_ROOT -WindowStyle Hidden | Out-Null
        Write-Host '  -> Desktop shell restarted.' -ForegroundColor Green
    } catch {
        Write-Host ('  -> Update completed, but automatic restart failed: ' + $_.Exception.Message) -ForegroundColor DarkYellow
    }
}

$currentStage = 'launch'
try {
    Write-Banner
    $localInfo = Get-LocalReleaseInfo
    if ([string]::IsNullOrWhiteSpace($FromVersion)) {
        $FromVersion = $localInfo.distributionVersion
    }
    $currentStage = 'check'
    Write-UpdateStatus -State 'checking' -Stage $currentStage -Message 'Checking for the latest portable release.' -From $FromVersion -Target $TargetVersion
    Write-Host ('  Local distribution: ' + $localInfo.distributionVersion) -ForegroundColor White
    Write-Host ('  Local desktop:      ' + $localInfo.desktopVersion) -ForegroundColor Gray
    Write-Host ('  Local kernel:       ' + $localInfo.kernelVersion) -ForegroundColor Gray
    $usingPreparedPackage = -not [string]::IsNullOrWhiteSpace($PackagePath)
    if ($usingPreparedPackage) {
        if ([string]::IsNullOrWhiteSpace($TargetVersion)) {
            $packageName = Split-Path -Leaf $PackagePath
            $packageMatch = [regex]::Match($packageName, '^DeepSeek-Harness-(.+)-win32-x64\.zip$')
            if ($packageMatch.Success) { $TargetVersion = $packageMatch.Groups[1].Value }
        }
        if ([string]::IsNullOrWhiteSpace($TargetVersion)) { throw 'A target version is required for a prepared update package.' }
        if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) { throw 'A SHA-256 digest is required for a prepared update package.' }
        $normalizedTarget = Normalize-Version $TargetVersion
        $release = [PSCustomObject]@{
            tag_name = 'v' + $normalizedTarget
            version = $normalizedTarget
            asset_name = Split-Path -Leaf $PackagePath
            asset_url = ''
            sha256 = $ExpectedSha256
        }
        Write-UpdateStatus -State 'verifying' -Stage 'verify' -Message 'Verifying the prepared update package.' -From $FromVersion -Target $TargetVersion
        Verify-LocalPackage -Path $PackagePath -ExpectedDigest $ExpectedSha256
    } else {
        if (-not [string]::IsNullOrWhiteSpace($TargetVersion)) {
            $release = Get-RemoteReleaseByVersion -Version $TargetVersion
            $TargetVersion = $release.version
        } else {
            $release = Get-RemoteRelease
            $TargetVersion = $release.version
        }
    }
    Write-UpdateStatus -State 'checking' -Stage $currentStage -Message ('Latest portable release: ' + $release.tag_name) -From $FromVersion -Target $TargetVersion
    Write-Host ('  Latest distribution: ' + $release.tag_name) -ForegroundColor White
    $versionComparison = Compare-Semver -Left $release.version -Right $localInfo.distributionVersion
    if (-not $Force -and $versionComparison -le 0) {
        Write-UpdateStatus -State 'idle' -Stage $currentStage -Message 'Already up to date.' -From $FromVersion -Target $TargetVersion
        Write-Host '  Already up to date.' -ForegroundColor Green
        return
    }

    $zipPath = if ($usingPreparedPackage) {
        [System.IO.Path]::GetFullPath($PackagePath)
    } else {
        Join-Path $env:TEMP ('DeepSeek-Harness-' + $release.version + '.zip')
    }
    $extractPath = Join-Path $env:TEMP ('dsh-update-' + [Guid]::NewGuid().ToString('N'))
    try {
        if (-not $usingPreparedPackage) {
            $currentStage = 'download'
            Write-UpdateStatus -State 'downloading' -Stage $currentStage -Message 'Downloading the portable release.' -From $FromVersion -Target $TargetVersion
            Download-And-Verify -Release $release -Destination $zipPath
        }
        $currentStage = 'extract'
        Write-UpdateStatus -State 'extracting' -Stage $currentStage -Message 'Extracting and validating the portable release.' -From $FromVersion -Target $TargetVersion
        $sourceRoot = Extract-Release -ZipPath $zipPath -Destination $extractPath -ExpectedDistributionVersion $release.version
        $currentStage = 'swap'
        Write-UpdateStatus -State 'replacing' -Stage $currentStage -Message 'Waiting for the desktop shell and replacing runtime.' -From $FromVersion -Target $TargetVersion
        Install-ReleaseRoot -SourceRoot $sourceRoot
    } finally {
        if (-not $usingPreparedPackage) {
            Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        } elseif ($env:TEMP) {
            try {
                $tempRoot = ([System.IO.Path]::GetFullPath($env:TEMP)).TrimEnd('\') + '\'
                $packageFullPath = [System.IO.Path]::GetFullPath($PackagePath)
                if ($packageFullPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    Remove-Item -LiteralPath $packageFullPath -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }
        Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-UpdateStatus -State 'completed' -Stage 'completed' -Message ('Updated to ' + $release.tag_name + '.') -From $FromVersion -Target $TargetVersion
    Write-Host ('Update complete: ' + $release.tag_name) -ForegroundColor Green
    Start-UpdatedDesktop
} catch {
    $failureMessage = $_.Exception.Message
    Write-UpdateStatus -State 'failed' -Stage $currentStage -Message $failureMessage -From $FromVersion -Target $TargetVersion
    Write-Host ('Update failed: ' + $failureMessage) -ForegroundColor Red
    exit 1
}
