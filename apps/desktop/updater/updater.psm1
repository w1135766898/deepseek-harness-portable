# ============================================================================
# DeepSeek Harness portable runtime updater module
# ============================================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
foreach ($compressionAssembly in @('System.IO.Compression', 'System.IO.Compression.FileSystem', 'System.IO.Compression.ZipFile')) {
    try { Add-Type -AssemblyName $compressionAssembly -ErrorAction Stop } catch {}
}

$DISTRIBUTION_REPO = 'wsnxxxs/deepseek-harness-portable'
$RELEASE_MANIFEST_NAME = 'release-manifest.json'
$TRANSACTION_FILE_NAME = '.update-transaction.json'
$BACKUPS_DIR_NAME = '.update-backups'
$UPDATE_PROBE_TIMEOUT_SECONDS = 90

$GITHUB_MIRROR_PREFIXES = @(
    '',
    'https://gh-proxy.com/',
    'https://ghfast.top/',
    'https://gh.ddlc.top/',
    'https://ghps.cc/'
)

$MODULE_ROOT = $PSScriptRoot
$payloadScript = Join-Path $PSScriptRoot 'release-payload.ps1'
if (Test-Path -LiteralPath $payloadScript) {
    . $payloadScript
} else {
    $global:RELEASE_PAYLOAD = @(
        'release-manifest.json', 'dsh.cmd', 'uninstall.cmd', 'uninstall.ps1', 'update.ps1', 'update.cmd',
        'setup-shortcuts.ps1', 'start-web.cmd', 'start-desktop.cmd', '启动网页版.bat', '启动桌面窗口.bat',
        '启动桌面版.bat', '在线更新.bat', '创建桌面快捷方式.bat', '一键解除拦截(自签名信任).bat',
        '使用说明.txt', '使用说明.en.txt', 'smoke-native.cjs',
        'updater\updater.psm1', 'updater\release-payload.ps1'
    )
}

function Write-Banner {
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '   DeepSeek Harness portable runtime updater                    ' -ForegroundColor Cyan
    Write-Host '   Transactional release upgrade & rollback engine              ' -ForegroundColor Gray
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Read-JsonIfPresent {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Write-JsonAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Data
    )

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $temporary = $Path + '.' + $PID + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $encoding = New-Object System.Text.UTF8Encoding($false)
    try {
        $json = $Data | ConvertTo-Json -Depth 6
        [System.IO.File]::WriteAllText($temporary, $json, $encoding)
        if (Test-Path -LiteralPath $Path) {
            try {
                [System.IO.File]::Replace($temporary, $Path, $null, $true)
            } catch {
                Move-Item -LiteralPath $temporary -Destination $Path -Force
            }
        } else {
            Move-Item -LiteralPath $temporary -Destination $Path -Force
        }
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-ParentDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
}

function Get-ReleasePayloadPresent {
    param([Parameter(Mandatory = $true)][string]$Root)
    $present = @()
    foreach ($item in $global:RELEASE_PAYLOAD) {
        $path = Join-Path $Root $item
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $present += $item
        }
    }
    return $present
}

function Write-ReleasePayloadState {
    param(
        [Parameter(Mandatory = $true)][string]$BackupDir,
        [Parameter(Mandatory = $true)][string[]]$Present
    )
    Write-JsonAtomic -Path (Join-Path $BackupDir '.payload-state.json') -Data ([ordered]@{
        schemaVersion = 1
        files = @($Present)
    })
}

function Get-ReleasePayloadState {
    param([Parameter(Mandatory = $true)][string]$BackupDir)
    $state = Read-JsonIfPresent (Join-Path $BackupDir '.payload-state.json')
    if ($state -and $null -ne $state.files) {
        return @($state.files | ForEach-Object { [string]$_ })
    }
    return @(Get-ReleasePayloadPresent -Root $BackupDir)
}

function Backup-ReleasePayload {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$BackupDir
    )
    $present = @(Get-ReleasePayloadPresent -Root $SourceRoot)
    foreach ($item in $present) {
        $source = Join-Path $SourceRoot $item
        $destination = Join-Path $BackupDir $item
        Ensure-ParentDirectory -Path $destination
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
    Write-ReleasePayloadState -BackupDir $BackupDir -Present $present
    return $present
}

function Sync-ReleasePayload {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot
    )
    foreach ($item in $global:RELEASE_PAYLOAD) {
        $source = Join-Path $SourceRoot $item
        $destination = Join-Path $DestinationRoot $item
        if (Test-Path -LiteralPath $source -PathType Leaf) {
            if (Test-Path -LiteralPath $destination -PathType Container) {
                Remove-Item -LiteralPath $destination -Recurse -Force
            }
            Ensure-ParentDirectory -Path $destination
            Copy-Item -LiteralPath $source -Destination $destination -Force
        } elseif (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
    }
}

function Restore-ReleasePayload {
    param(
        [Parameter(Mandatory = $true)][string]$BackupDir,
        [Parameter(Mandatory = $true)][string]$DestinationRoot
    )
    $statePath = Join-Path $BackupDir '.payload-state.json'
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
        foreach ($item in $global:RELEASE_PAYLOAD) {
            $destination = Join-Path $DestinationRoot $item
            if (Test-Path -LiteralPath $destination) {
                Remove-Item -LiteralPath $destination -Recurse -Force
            }
        }
    }
    foreach ($item in @(Get-ReleasePayloadState -BackupDir $BackupDir)) {
        $source = Join-Path $BackupDir $item
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw ('Rollback backup is missing release payload file: ' + $item)
        }
        $destination = Join-Path $DestinationRoot $item
        Ensure-ParentDirectory -Path $destination
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

function Normalize-Version {
    param([Parameter(Mandatory = $true)][string]$Version)
    return ($Version -replace '^v', '').Trim()
}

function Resolve-SemverCli {
    param([string]$AppRoot = '')

    $roots = @()
    if (-not [string]::IsNullOrWhiteSpace($AppRoot)) {
        $roots += [System.IO.Path]::GetFullPath($AppRoot)
    }
    $roots += [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

    $nodeCommand = Get-Command -Name @('node.exe', 'node') -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $nodePath = if ($nodeCommand) { [string]$nodeCommand.Source } else { '' }

    foreach ($root in @($roots | Select-Object -Unique)) {
        $cliCandidates = @(
            (Join-Path $root 'runtime\resources\app\src\semver-cli.cjs'),
            (Join-Path $root 'src\semver-cli.cjs')
        )
        foreach ($cliPath in $cliCandidates) {
            if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) { continue }

            $portableNode = Join-Path $root 'runtime\DeepSeek Harness.exe'
            if (Test-Path -LiteralPath $portableNode -PathType Leaf) {
                return [PSCustomObject]@{ executable = $portableNode; cli = $cliPath; electron = $true }
            }
            if (-not [string]::IsNullOrWhiteSpace($nodePath)) {
                return [PSCustomObject]@{ executable = $nodePath; cli = $cliPath; electron = $false }
            }
        }
    }

    throw 'The canonical semver-cli.cjs implementation is unavailable.'
}

function Compare-Version {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right,
        [string]$AppRoot = ''
    )

    $invocation = Resolve-SemverCli -AppRoot $AppRoot
    $previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
    try {
        if ($invocation.electron) { $env:ELECTRON_RUN_AS_NODE = '1' }
        $argumentList = @(
            ('"' + $invocation.cli + '"')
            'compare'
            ('"' + $Left + '"')
            ('"' + $Right + '"')
        ) -join ' '
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $invocation.executable
        $startInfo.Arguments = $argumentList
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        if ($invocation.electron) { $startInfo.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1' }
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        if (-not $process.Start()) { throw 'Unable to start the canonical semver CLI.' }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $output = @()
        if (-not [string]::IsNullOrWhiteSpace($stdout)) { $output += $stdout }
        if (-not [string]::IsNullOrWhiteSpace($stderr)) { $output += $stderr }
        $exitCode = $process.ExitCode
        $process.Dispose()
    } catch {
        throw ('SemVer comparison failed: ' + $_.Exception.Message)
    } finally {
        if ($invocation.electron) {
            if ($null -eq $previousElectronRunAsNode) {
                Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
            } else {
                $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode
            }
        }
    }

    $text = (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
    if ($exitCode -ne 0) {
        throw ('Invalid SemVer: ' + $text)
    }
    if ($text -notmatch '^(-1|0|1)$') {
        throw ('Canonical semver-cli returned an invalid comparison result: ' + $text)
    }
    return [int]$text
}

function Assert-ValidVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Version,
        [string]$AppRoot = ''
    )
    $normalized = Normalize-Version $Version
    try {
        $null = Compare-Version -Left $normalized -Right $normalized -AppRoot $AppRoot
    } catch {
        throw ('Invalid SemVer: ' + $Version)
    }
    return $normalized
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
        [string]$StatusFile = '',
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
        $startedAt = if ($existing -and $existing.startedAt) { [string]$existing.startedAt } else { $now }
        $effectiveFrom = if (-not [string]::IsNullOrWhiteSpace($From)) { $From } elseif ($existing -and $existing.fromVersion) { [string]$existing.fromVersion } else { '' }
        $effectiveTarget = if (-not [string]::IsNullOrWhiteSpace($Target)) { $Target } elseif ($existing -and $existing.targetVersion) { [string]$existing.targetVersion } else { '' }

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
        Write-JsonAtomic -Path $StatusFile -Data $payload
    } catch {
        Write-Host ('  -> Unable to persist update status: ' + $_.Exception.Message) -ForegroundColor DarkYellow
    }
}

function Get-LocalReleaseInfo {
    param([Parameter(Mandatory = $true)][string]$AppRoot)
    $releaseManifest = Read-JsonIfPresent (Join-Path $AppRoot $RELEASE_MANIFEST_NAME)
    $packageManifest = Read-JsonIfPresent (Join-Path $AppRoot 'runtime\resources\app\package.json')
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
            try { $version = Assert-ValidVersion -Version ([string]$candidate.tag_name) } catch { continue }
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
    $normalizedVersion = Assert-ValidVersion -Version $Version
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

function Find-CachedUpdatePackage {
    param(
        [Parameter(Mandatory = $true)][string]$TargetVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedDigest
    )

    # Look for a ZIP the desktop shell already downloaded into
    # %TEMP%\deepseek-harness-updates (e.g. left behind by a failed in-app
    # restart flow). Only a package whose SHA-256 matches the published digest
    # for the target release is reused, so a tampered or partial download can
    # never be applied.
    if ([string]::IsNullOrWhiteSpace($env:TEMP)) { return '' }
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    $updateDir = Join-Path $tempRoot 'deepseek-harness-updates'
    if (-not (Test-Path -LiteralPath $updateDir -PathType Container)) { return '' }

    $expected = ($ExpectedDigest -replace '^sha256:', '').Trim().ToUpperInvariant()
    if ($expected -notmatch '^[0-9A-F]{64}$') { return '' }

    $pattern = '^DeepSeek-Harness-' + [regex]::Escape($TargetVersion) + '-\d+\.zip$'
    $candidates = @(
        Get-ChildItem -LiteralPath $updateDir -Filter 'DeepSeek-Harness-*.zip' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $pattern } |
            Sort-Object LastWriteTime -Descending
    )
    foreach ($candidate in $candidates) {
        try {
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate.FullName).Hash.ToUpperInvariant()
            if ($actual -eq $expected) {
                Write-Host ('  -> Reusing previously downloaded update package: ' + $candidate.Name) -ForegroundColor Green
                return $candidate.FullName
            }
        } catch {}
    }
    return ''
}

function Download-And-Verify {
    param(
        [Parameter(Mandatory = $true)]$Release,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string]$StatusFile,
        [string]$FromVersion,
        [string]$TargetVersion
    )

    $directUrl = $Release.asset_url
    $urls = @(Get-MirrorUrls $directUrl)
    $errors = @()
    foreach ($url in $urls) {
        try {
            Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
            Write-UpdateStatus -StatusFile $StatusFile -State 'downloading' -Stage 'download' -Message ('Downloading from ' + ([System.Uri]$url).Host) -From $FromVersion -Target $TargetVersion
            Write-Host ('  -> Downloading from ' + ([System.Uri]$url).Host + ' ...') -ForegroundColor Cyan
            Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30
            if (-not (Test-Path -LiteralPath $Destination)) { throw 'download did not create a file' }
            Write-UpdateStatus -StatusFile $StatusFile -State 'verifying' -Stage 'verify' -Message 'Verifying the downloaded ZIP with SHA-256.' -From $FromVersion -Target $TargetVersion
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

function Test-PathSafety {
    param(
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [Parameter(Mandatory = $true)][string]$AllowedRoot
    )

    $fullTarget = [System.IO.Path]::GetFullPath($TargetPath)
    $fullRoot = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\')
    $rootPrefix = $fullRoot + '\'
    if ($fullTarget -ne $fullRoot -and -not $fullTarget.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ('Path traversal violation: ' + $TargetPath + ' is outside ' + $AllowedRoot)
    }
}

function Test-ZipEntrySafety {
    param(
        [Parameter(Mandatory = $true)]$Entry,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    $entryName = ([string]$Entry.FullName).Replace('/', '\')
    if ([string]::IsNullOrWhiteSpace($entryName)) { return }
    $isRooted = [System.IO.Path]::IsPathRooted($entryName)
    $hasDrivePrefix = $entryName -match '^[A-Za-z]:'
    $isUncPath = $entryName.StartsWith('\\')
    $hasColon = $entryName -match ':'
    if ($isRooted -or $hasDrivePrefix -or $isUncPath -or $hasColon) {
        throw ('Unsafe ZIP entry path: ' + $Entry.FullName)
    }
    foreach ($segment in $entryName.Split('\')) {
        if ($segment -eq '..') {
            throw ('Unsafe ZIP entry path: ' + $Entry.FullName)
        }
    }
    $target = [System.IO.Path]::GetFullPath((Join-Path $Destination $entryName))
    Test-PathSafety -TargetPath $target -AllowedRoot $Destination
}

function Extract-ReleaseSafe {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$ExpectedDistributionVersion
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            Test-ZipEntrySafety -Entry $entry -Destination $Destination
        }
    } finally {
        $archive.Dispose()
    }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Destination)

    # Validate extracted files bounds
    foreach ($item in (Get-ChildItem -LiteralPath $Destination -Recurse)) {
        Test-PathSafety -TargetPath $item.FullName -AllowedRoot $Destination
    }

    $inner = @(Get-ChildItem -LiteralPath $Destination -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' })
    $root = if ($inner.Count -eq 1) { $inner[0].FullName } else { $Destination }
    Test-PortableLayout -Root $root -ExpectedDistributionVersion $ExpectedDistributionVersion
    return $root
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
        'update.cmd',
        'setup-shortcuts.ps1',
        'updater\updater.psm1',
        'updater\release-payload.ps1',
        'runtime\DeepSeek Harness.exe',
        'runtime\resources\app\package.json',
        'runtime\resources\app\lib\packaged-bin.js',
        'runtime\resources\app\src\semver.cjs',
        'runtime\resources\app\src\semver-cli.cjs',
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

function Test-ProcessPathUnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessPath,
        [Parameter(Mandatory = $true)][string]$Root
    )
    try {
        $fullPath = [System.IO.Path]::GetFullPath($ProcessPath)
        $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
        return $fullPath -eq $fullRoot -or $fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
        return $false
    }
}

function Stop-ProcessTree {
    param(
        [int]$EnginePid = 0,
        [int]$ShellPid = 0,
        [string]$AppRoot = '',
        [int]$TimeoutSeconds = 15
    )

    if ($EnginePid -gt 0 -and $EnginePid -ne $PID) {
        try { & taskkill.exe /PID $EnginePid /T /F | Out-Null } catch {}
    }
    if ($ShellPid -gt 0 -and $ShellPid -ne $PID) {
        # Do NOT use /T on ShellPid: the updater PowerShell process was spawned by the
        # desktop shell, so taskkill /T on ShellPid would kill the updater itself.
        try { & taskkill.exe /PID $ShellPid /F | Out-Null } catch {}
    }

    $requestedPids = @($EnginePid, $ShellPid) | Where-Object { $_ -gt 0 -and $_ -ne $PID } | Select-Object -Unique
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        $running = @()
        foreach ($pidToCheck in $requestedPids) {
            if (Get-Process -Id $pidToCheck -ErrorAction SilentlyContinue) {
                $running += $pidToCheck
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($AppRoot)) {
            $running += @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
                try {
                    $_.Id -ne $PID -and $_.Path -and (Test-ProcessPathUnderRoot -ProcessPath $_.Path -Root $AppRoot)
                } catch { $false }
            } | ForEach-Object { $_.Id })
        }
        $running = @($running | Where-Object { $_ -ne $PID } | Select-Object -Unique)
        if ($running.Count -eq 0) { return $true }
        if ((Get-Date) -ge $deadline) {
            throw ('Processes did not exit before the timeout: ' + ($running -join ', '))
        }
        foreach ($pidToStop in $running) {
            if ($pidToStop -eq $ShellPid) {
                try { & taskkill.exe /PID $pidToStop /F | Out-Null } catch {}
            } else {
                try { & taskkill.exe /PID $pidToStop /T /F | Out-Null } catch {}
            }
        }
        Start-Sleep -Milliseconds 500
    }
}

function Install-ReleaseWithTransaction {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$FromVersion,
        [Parameter(Mandatory = $true)][string]$TargetVersion,
        [string]$StatusFile = '',
        [int]$EnginePid = 0,
        [int]$ShellPid = 0,
        [switch]$LaunchAfterUpdate
    )

    $normalizedFromVersion = Assert-ValidVersion -Version $FromVersion -AppRoot $AppRoot
    $normalizedTargetVersion = Assert-ValidVersion -Version $TargetVersion -AppRoot $AppRoot
    $FromVersion = $normalizedFromVersion
    $TargetVersion = $normalizedTargetVersion
    $transactionId = [Guid]::NewGuid().ToString('N')
    $backupsBase = Join-Path $AppRoot $BACKUPS_DIR_NAME
    $backupDir = Join-Path $backupsBase ($normalizedFromVersion + '-' + $transactionId)
    $transactionPath = Join-Path $AppRoot $TRANSACTION_FILE_NAME
    $runtimeDir = Join-Path $AppRoot 'runtime'
    $mutationStarted = $false
    $probeFile = ''

    $transactionState = [ordered]@{
        schemaVersion = 1
        transactionId = $transactionId
        fromVersion = $FromVersion
        targetVersion = $TargetVersion
        phase = 'preparing'
        backupPath = $backupDir
        startedAt = [DateTime]::UtcNow.ToString('o')
    }

    try {
        Write-UpdateStatus -StatusFile $StatusFile -State 'replacing' -Stage 'swap' -Message 'Stopping running processes and backing up existing runtime.' -From $FromVersion -Target $TargetVersion
        Stop-ProcessTree -EnginePid $EnginePid -ShellPid $ShellPid -AppRoot $AppRoot

        # Copy the old runtime instead of moving it so the rollback slot stays
        # complete even if the replacement is interrupted.
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        if (Test-Path -LiteralPath $runtimeDir -PathType Container) {
            Copy-Item -LiteralPath $runtimeDir -Destination (Join-Path $backupDir 'runtime') -Recurse -Force
        }
        $presentPayload = @(Backup-ReleasePayload -SourceRoot $AppRoot -BackupDir $backupDir)
        $transactionState['payloadFiles'] = $presentPayload
        $transactionState.phase = 'backed-up'
        Write-JsonAtomic -Path $transactionPath -Data $transactionState
        $mutationStarted = $true

        # Swap the runtime and synchronise every release-owned root file.
        if (Test-Path -LiteralPath $runtimeDir) {
            Remove-Item -LiteralPath $runtimeDir -Recurse -Force
        }
        Move-Item -LiteralPath (Join-Path $SourceRoot 'runtime') -Destination $runtimeDir
        Sync-ReleasePayload -SourceRoot $SourceRoot -DestinationRoot $AppRoot

        # 3. Verify static layout
        Test-PortableLayout -Root $AppRoot -ExpectedDistributionVersion $TargetVersion
        $transactionState.phase = 'layout-verified'
        Write-JsonAtomic -Path $transactionPath -Data $transactionState

        # 4. Probe & Health Check if Launch requested
        if ($LaunchAfterUpdate) {
            $probeFile = Join-Path $env:TEMP ('dsh-probe-' + $transactionId + '.json')
            $desktopExe = Join-Path $AppRoot 'runtime\DeepSeek Harness.exe'
            try {
                $process = Start-Process -FilePath $desktopExe -ArgumentList @(
                    '--update-probe-file', $probeFile,
                    '--update-transaction', $transactionId
                ) -WorkingDirectory $AppRoot -PassThru

                $deadline = (Get-Date).AddSeconds($UPDATE_PROBE_TIMEOUT_SECONDS)
                $healthy = $false
                while ((Get-Date) -lt $deadline) {
                    if ($process.HasExited) {
                        throw ('Updated shell process exited prematurely with code ' + $process.ExitCode)
                    }
                    if (Test-Path -LiteralPath $probeFile) {
                        $probe = Read-JsonIfPresent $probeFile
                        $probeVersionMatches = $false
                        if ($probe -and $probe.version) {
                            try {
                                $probeVersionMatches = (Compare-Version -Left ([string]$probe.version) -Right $TargetVersion -AppRoot $AppRoot) -eq 0
                            } catch { $probeVersionMatches = $false }
                        }
                        $probeIsValid = $probe -and $probe.state -eq 'ready' -and $probe.transactionId -eq $transactionId -and $probeVersionMatches -and ([int]$probe.pid -eq $process.Id) -and -not [string]::IsNullOrWhiteSpace([string]$probe.harnessUrl)
                        if ($probeIsValid) {
                            $healthy = $true
                            break
                        }
                    }
                    Start-Sleep -Milliseconds 500
                }
                if (-not $healthy) {
                    throw 'Health check probe timed out or reported an invalid updated process.'
                }
            } finally {
                Remove-Item -LiteralPath $probeFile -Force -ErrorAction SilentlyContinue
            }
        }

        # 5. Commit transaction & retain rollback slot
        $transactionState.phase = 'committed'
        Write-JsonAtomic -Path $transactionPath -Data $transactionState
        Write-UpdateStatus -StatusFile $StatusFile -State 'completed' -Stage 'completed' -Message ('Updated to ' + $TargetVersion + '.') -From $FromVersion -Target $TargetVersion
        Write-Host ('Update successfully completed to ' + $TargetVersion) -ForegroundColor Green

        # Retain this backup as previous rollback slot, purge older slots
        $previousSlots = @(Get-ChildItem -LiteralPath $backupsBase -Directory | Where-Object { $_.FullName -ne $backupDir })
        foreach ($old in $previousSlots) {
            Remove-Item -LiteralPath $old.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $err = $_.Exception.Message
        Write-Host ('Update failed: ' + $err + '. Initiating rollback ...') -ForegroundColor Red
        if (-not $mutationStarted) {
            Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
            throw
        }
        try {
            Invoke-Rollback -AppRoot $AppRoot -BackupDir $backupDir -StatusFile $StatusFile -FromVersion $FromVersion -TargetVersion $TargetVersion
        } catch {
            throw ('Update failed and automatic rollback failed: ' + $_.Exception.Message)
        }
        throw
    }
}

function Invoke-Rollback {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$BackupDir = '',
        [string]$StatusFile = '',
        [string]$FromVersion = '',
        [string]$TargetVersion = '',
        [switch]$RelaunchAfterRollback
    )

    $backupsBase = Join-Path $AppRoot $BACKUPS_DIR_NAME
    if ([string]::IsNullOrWhiteSpace($BackupDir)) {
        if (-not (Test-Path -LiteralPath $backupsBase)) {
            throw 'No rollback backup slot was found.'
        }
        $slots = @(Get-ChildItem -LiteralPath $backupsBase -Directory | Sort-Object CreationTime -Descending)
        if ($slots.Count -eq 0) {
            throw 'No rollback backup slot was found in .update-backups.'
        }
        $BackupDir = $slots[0].FullName
    }

    Test-PathSafety -TargetPath $BackupDir -AllowedRoot $AppRoot
    if (-not (Test-Path -LiteralPath (Join-Path $BackupDir 'runtime') -PathType Container)) {
        throw 'Rollback backup is missing the runtime directory.'
    }
    Stop-ProcessTree -AppRoot $AppRoot

    $runtimeDir = Join-Path $AppRoot 'runtime'
    if (Test-Path -LiteralPath $runtimeDir) {
        Remove-Item -LiteralPath $runtimeDir -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $BackupDir 'runtime') -Destination $runtimeDir -Recurse -Force
    Restore-ReleasePayload -BackupDir $BackupDir -DestinationRoot $AppRoot

    $transactionPath = Join-Path $AppRoot $TRANSACTION_FILE_NAME
    $transactionState = [ordered]@{
        schemaVersion = 1
        phase = 'rolled-back'
        backupPath = $BackupDir
        updatedAt = [DateTime]::UtcNow.ToString('o')
    }
    Write-JsonAtomic -Path $transactionPath -Data $transactionState
    $restoredVersion = ''
    try {
        $restoredManifest = Read-JsonIfPresent (Join-Path $AppRoot $RELEASE_MANIFEST_NAME)
        if ($restoredManifest -and $restoredManifest.distributionVersion) {
            $restoredVersion = Normalize-Version ([string]$restoredManifest.distributionVersion)
        }
    } catch {}
    if ($StatusFile) {
        Write-UpdateStatus -StatusFile $StatusFile -State 'rolled-back' -Stage 'rollback' `
            -Message ('Rolled back to ' + $restoredVersion + '.') `
            -From $FromVersion -Target $restoredVersion
    }
    Write-Host 'Rollback complete: previous version runtime and manifests restored.' -ForegroundColor Green

    if ($RelaunchAfterRollback) {
        $desktopExe = Join-Path $AppRoot 'runtime\DeepSeek Harness.exe'
        if (Test-Path -LiteralPath $desktopExe) {
            Start-Process -FilePath $desktopExe -WorkingDirectory $AppRoot | Out-Null
        }
    }
}

function Recover-PendingTransaction {
    param(
        [Parameter(Mandatory = $true)][string]$AppRoot,
        [string]$StatusFile = ''
    )
    $transactionPath = Join-Path $AppRoot $TRANSACTION_FILE_NAME
    $state = Read-JsonIfPresent $transactionPath
    if (-not $state -or $state.phase -in @('committed', 'rolled-back')) { return }
    $backupPath = [string]$state.backupPath
    if ([string]::IsNullOrWhiteSpace($backupPath) -or -not (Test-Path -LiteralPath $backupPath -PathType Container)) {
        throw 'An incomplete update transaction has no usable rollback backup.'
    }
    Write-Host 'Recovering an incomplete update transaction before continuing ...' -ForegroundColor Yellow
    Invoke-Rollback -AppRoot $AppRoot -BackupDir $backupPath -StatusFile $StatusFile -From ([string]$state.fromVersion) -TargetVersion ([string]$state.targetVersion)
}

function Invoke-Updater {
    param(
        [switch]$Force,
        [string]$StatusFile,
        [string]$FromVersion,
        [string]$TargetVersion,
        [string]$PackagePath,
        [string]$ExpectedSha256,
        [string]$StagingPath,
        [switch]$LaunchAfterUpdate,
        [int]$EnginePid = 0,
        [int]$ShellPid = 0,
        [switch]$Rollback,
        [switch]$RelaunchAfterRollback,
        [string]$AppRoot = ''
    )

    if ([string]::IsNullOrWhiteSpace($AppRoot)) {
        $SCRIPT_ROOT = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MODULE_ROOT) { $MODULE_ROOT } else { $PWD.Path }
        $AppRoot = if ((Split-Path -Leaf $SCRIPT_ROOT) -ieq 'runtime' -or (Split-Path -Leaf $SCRIPT_ROOT) -ieq 'updater') {
            Split-Path -Parent $SCRIPT_ROOT
        } else {
            $SCRIPT_ROOT
        }
    }
    $APP_ROOT = [System.IO.Path]::GetFullPath($AppRoot)
    if ([string]::IsNullOrWhiteSpace($StatusFile) -and $env:APPDATA) {
        $StatusFile = Join-Path $env:APPDATA 'DeepSeek Harness\update-status.json'
    }

    Recover-PendingTransaction -AppRoot $APP_ROOT -StatusFile $StatusFile

    if ($Rollback) {
        Write-Banner
        Write-Host 'Executing manual rollback to previous version ...' -ForegroundColor Yellow
        $localInfo = Get-LocalReleaseInfo -AppRoot $APP_ROOT
        Invoke-Rollback -AppRoot $APP_ROOT -StatusFile $StatusFile `
            -FromVersion $localInfo.distributionVersion `
            -RelaunchAfterRollback:$RelaunchAfterRollback
        return
    }

    $currentStage = 'launch'
    try {
        Write-Banner
        $localInfo = Get-LocalReleaseInfo -AppRoot $APP_ROOT
        if ([string]::IsNullOrWhiteSpace($FromVersion)) {
            $FromVersion = $localInfo.distributionVersion
        }
        $currentStage = 'check'
        Write-UpdateStatus -StatusFile $StatusFile -State 'checking' -Stage $currentStage -Message 'Checking for the latest portable release.' -From $FromVersion -Target $TargetVersion
        Write-Host ('  Local distribution: ' + $localInfo.distributionVersion) -ForegroundColor White
        Write-Host ('  Local desktop:      ' + $localInfo.desktopVersion) -ForegroundColor Gray
        Write-Host ('  Local kernel:       ' + $localInfo.kernelVersion) -ForegroundColor Gray

        $usingStaging = $false
        if (-not [string]::IsNullOrWhiteSpace($StagingPath) -and (Test-Path -LiteralPath $StagingPath -PathType Container)) {
            try {
                $stagingTargetVersion = if (-not [string]::IsNullOrWhiteSpace($TargetVersion)) { $TargetVersion } else { '' }
                Test-PortableLayout -Root $StagingPath -ExpectedDistributionVersion $stagingTargetVersion
                $usingStaging = $true
            } catch {
                $usingStaging = $false
            }
        }

        if ($usingStaging) {
            if ([string]::IsNullOrWhiteSpace($TargetVersion)) {
                $stagedManifest = Read-JsonIfPresent (Join-Path $StagingPath $RELEASE_MANIFEST_NAME)
                if ($stagedManifest -and $stagedManifest.distributionVersion) {
                    $TargetVersion = [string]$stagedManifest.distributionVersion
                }
            }
            $TargetVersion = Normalize-Version $TargetVersion
            Write-UpdateStatus -StatusFile $StatusFile -State 'replacing' -Stage 'swap' -Message 'Applying pre-extracted update package.' -From $FromVersion -Target $TargetVersion
            Write-Host ('  Using pre-extracted update staging: ' + $StagingPath) -ForegroundColor Green
            $currentStage = 'swap'
            try {
                Install-ReleaseWithTransaction -AppRoot $APP_ROOT -SourceRoot $StagingPath -FromVersion $FromVersion -TargetVersion $TargetVersion -StatusFile $StatusFile -EnginePid $EnginePid -ShellPid $ShellPid -LaunchAfterUpdate:$LaunchAfterUpdate
            } finally {
                Remove-Item -LiteralPath $StagingPath -Recurse -Force -ErrorAction SilentlyContinue
                if (-not [string]::IsNullOrWhiteSpace($PackagePath)) {
                    Remove-Item -LiteralPath $PackagePath -Force -ErrorAction SilentlyContinue
                }
            }
            return
        }

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
            Write-UpdateStatus -StatusFile $StatusFile -State 'verifying' -Stage 'verify' -Message 'Verifying the prepared update package.' -From $FromVersion -Target $TargetVersion
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

        Write-UpdateStatus -StatusFile $StatusFile -State 'checking' -Stage $currentStage -Message ('Latest portable release: ' + $release.tag_name) -From $FromVersion -Target $TargetVersion
        Write-Host ('  Latest distribution: ' + $release.tag_name) -ForegroundColor White
        $versionComparison = Compare-Version -Left $release.version -Right $localInfo.distributionVersion -AppRoot $APP_ROOT
        if (-not $Force -and $versionComparison -le 0) {
            Write-UpdateStatus -StatusFile $StatusFile -State 'idle' -Stage $currentStage -Message 'Already up to date.' -From $FromVersion -Target $TargetVersion
            Write-Host '  Already up to date.' -ForegroundColor Green
            return
        }

        # Reuse a package the desktop shell already downloaded and verified
        # (e.g. left in %TEMP%\deepseek-harness-updates by a failed in-app
        # restart), so a console update after a failed in-app flow does not
        # re-download the same ZIP. The digest check makes reuse safe.
        if (-not $usingPreparedPackage) {
            $cachedPackage = Find-CachedUpdatePackage -TargetVersion $release.version -ExpectedDigest $release.sha256
            if (-not [string]::IsNullOrWhiteSpace($cachedPackage)) {
                $PackagePath = $cachedPackage
                $ExpectedSha256 = $release.sha256
                $usingPreparedPackage = $true
                Write-UpdateStatus -StatusFile $StatusFile -State 'verifying' -Stage 'verify' -Message 'Verifying the previously downloaded update package.' -From $FromVersion -Target $TargetVersion
                Verify-LocalPackage -Path $PackagePath -ExpectedDigest $ExpectedSha256
            }
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
                Download-And-Verify -Release $release -Destination $zipPath -StatusFile $StatusFile -FromVersion $FromVersion -TargetVersion $TargetVersion
            }
            $currentStage = 'extract'
            Write-UpdateStatus -StatusFile $StatusFile -State 'extracting' -Stage $currentStage -Message 'Extracting and validating the portable release.' -From $FromVersion -Target $TargetVersion
            $sourceRoot = Extract-ReleaseSafe -ZipPath $zipPath -Destination $extractPath -ExpectedDistributionVersion $release.version
            $currentStage = 'swap'
            Install-ReleaseWithTransaction -AppRoot $APP_ROOT -SourceRoot $sourceRoot -FromVersion $FromVersion -TargetVersion $TargetVersion -StatusFile $StatusFile -EnginePid $EnginePid -ShellPid $ShellPid -LaunchAfterUpdate:$LaunchAfterUpdate
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
    } catch {
        $failureMessage = $_.Exception.Message
        Write-UpdateStatus -StatusFile $StatusFile -State 'failed' -Stage $currentStage -Message $failureMessage -From $FromVersion -Target $TargetVersion
        Write-Host ('Update failed: ' + $failureMessage) -ForegroundColor Red
        exit 1
    }
}

Export-ModuleMember -Function `
    Normalize-Version, `
    Compare-Version, `
    Get-MirrorUrls, `
    Write-UpdateStatus, `
    Get-LocalReleaseInfo, `
    Get-ChecksumFromSource, `
    Get-RemoteRelease, `
    Get-RemoteReleaseByVersion, `
    Verify-LocalPackage, `
    Find-CachedUpdatePackage, `
    Download-And-Verify, `
    Test-PathSafety, `
    Test-PortableLayout, `
    Stop-ProcessTree, `
    Extract-ReleaseSafe, `
    Install-ReleaseWithTransaction, `
    Invoke-Rollback, `
    Recover-PendingTransaction, `
    Invoke-Updater
