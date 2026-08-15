# DeepSeek Harness portable installer for Windows x64.
# The installer only accepts a release ZIP whose SHA-256 digest is published
# in the GitHub release asset metadata or in the repository SHA256SUMS.txt.

[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\DeepSeek-Harness",
    [switch]$NoDesktopShortcut,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$REPO = 'wsnxxxs/deepseek-harness-portable'
$APP_NAME = 'DeepSeek Harness'
$RELEASE_MANIFEST_NAME = 'release-manifest.json'

function Write-Header {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ' DeepSeek Harness portable installer' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Test-Prerequisites {
    Write-Host '[1/6] Checking system prerequisites...' -ForegroundColor Yellow
    if ([IntPtr]::Size -ne 8) {
        throw 'DeepSeek Harness requires 64-bit Windows (x64).'
    }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host ('  Node.js detected: ' + (& node -v)) -ForegroundColor Green
    } else {
        Write-Host '  Node.js was not found globally; the portable runtime includes its own Node.js.' -ForegroundColor Gray
    }
}

function Get-LatestReleaseInfo {
    Write-Host '[2/6] Resolving the latest release and its SHA-256 digest...' -ForegroundColor Yellow
    $endpoints = @(
        ('https://api.github.com/repos/' + $REPO + '/releases/latest'),
        ('https://ghfast.top/https://api.github.com/repos/' + $REPO + '/releases/latest')
    )

    foreach ($endpoint in $endpoints) {
        try {
            $headers = @{ 'User-Agent' = 'DeepSeek-Harness-Installer' }
            $release = Invoke-RestMethod -Uri $endpoint -Headers $headers -TimeoutSec 15
            $version = ([string]$release.tag_name -replace '^v', '')
            $zipAsset = @($release.assets | Where-Object {
                $_.name -match ('^DeepSeek-Harness-' + [regex]::Escape($version) + '-win32-x64\.zip$')
            } | Select-Object -First 1)
            if ($zipAsset.Count -eq 0) { continue }

            $digest = $null
            if ([string]$zipAsset[0].digest -match '^sha256:([0-9a-fA-F]{64})$') {
                $digest = $matches[1].ToUpperInvariant()
            } else {
                $tag = [string]$release.tag_name
                $checksumUrls = @(
                    ('https://raw.githubusercontent.com/' + $REPO + '/' + $tag + '/SHA256SUMS.txt'),
                    ('https://raw.githubusercontent.com/' + $REPO + '/main/SHA256SUMS.txt'),
                    ('https://ghfast.top/https://raw.githubusercontent.com/' + $REPO + '/' + $tag + '/SHA256SUMS.txt')
                )
                foreach ($checksumUrl in $checksumUrls) {
                    try {
                        $checksumText = (Invoke-WebRequest -Uri $checksumUrl -UseBasicParsing -TimeoutSec 15).Content
                        $escapedName = [regex]::Escape([string]$zipAsset[0].name)
                        $checksumMatch = [regex]::Match($checksumText, '(?im)^\s*([0-9a-f]{64})\s+\*?' + $escapedName + '\s*$')
                        if ($checksumMatch.Success) {
                            $digest = $checksumMatch.Groups[1].Value.ToUpperInvariant()
                            break
                        }
                    } catch {}
                }
            }
            if (-not $digest) { continue }

            Write-Host ('  Release found: ' + $release.tag_name) -ForegroundColor Green
            return [PSCustomObject]@{
                tag_name = [string]$release.tag_name
                version = $version
                asset_name = [string]$zipAsset[0].name
                asset_url = [string]$zipAsset[0].browser_download_url
                sha256 = $digest
            }
        } catch {}
    }
    throw 'No release with a matching portable ZIP and published SHA-256 digest could be found; installation stopped.'
}

function Download-WithMirrorFailover {
    param(
        [Parameter(Mandatory = $true)]$ReleaseInfo,
        [Parameter(Mandatory = $true)][string]$DestinationZip
    )

    $mirrors = @(
        $ReleaseInfo.asset_url,
        ('https://ghfast.top/' + $ReleaseInfo.asset_url),
        ('https://mirror.ghproxy.com/' + $ReleaseInfo.asset_url),
        ('https://gh-proxy.com/' + $ReleaseInfo.asset_url),
        ('https://gh.ddlc.top/' + $ReleaseInfo.asset_url)
    )
    $errors = @()
    foreach ($url in $mirrors) {
        $hostName = $url
        try {
            Remove-Item -LiteralPath $DestinationZip -Force -ErrorAction SilentlyContinue
            $hostName = ([System.Uri]$url).Host
            Write-Host ('  Downloading from ' + $hostName + ' ...') -ForegroundColor Cyan
            Invoke-WebRequest -Uri $url -OutFile $DestinationZip -UseBasicParsing -TimeoutSec 120
            if (-not (Test-Path -LiteralPath $DestinationZip)) {
                throw 'The download did not create a file.'
            }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $DestinationZip).Hash.ToUpperInvariant()
            if ($actual -ne $ReleaseInfo.sha256) {
                throw ('SHA-256 mismatch (expected ' + $ReleaseInfo.sha256 + ', got ' + $actual + ').')
            }
            $sizeMb = [Math]::Round(((Get-Item -LiteralPath $DestinationZip).Length / 1MB), 2)
            Write-Host ('  Download verified (' + $sizeMb + ' MB).') -ForegroundColor Green
            return
        } catch {
            $errors += $hostName + ': ' + $_.Exception.Message
            Write-Host ('  Download failed; trying the next mirror...') -ForegroundColor Yellow
        }
    }
    throw ('All download mirrors failed digest verification. ' + ($errors -join ' | '))
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
        'runtime\DeepSeek Harness.exe',
        'runtime\resources\app\package.json',
        'runtime\resources\app\lib\packaged-bin.js',
        'runtime\resources\app\node_modules\node-pty\prebuilds\win32-x64\pty.node',
        'runtime\resources\app\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node'
    )
    foreach ($relative in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $relative))) {
            throw ('The release is missing required file: ' + $relative)
        }
    }
    $sharpDir = Join-Path $Root 'runtime\resources\app\node_modules\@img\sharp-win32-x64\lib'
    if (@(Get-ChildItem -LiteralPath $sharpDir -Filter 'sharp-win32-x64-*.node' -File -ErrorAction SilentlyContinue).Count -eq 0) {
        throw 'The release is missing the sharp Windows native module.'
    }
    $releaseManifest = Get-Content -LiteralPath (Join-Path $Root $RELEASE_MANIFEST_NAME) -Raw | ConvertFrom-Json
    foreach ($field in @('distributionVersion', 'desktopVersion', 'kernelVersion')) {
        if (-not $releaseManifest.$field) {
            throw ('The release manifest is missing: ' + $field)
        }
    }
    if ($ExpectedDistributionVersion -and
        (([string]$releaseManifest.distributionVersion -replace '^v', '') -ne ($ExpectedDistributionVersion -replace '^v', ''))) {
        throw ('The release manifest version does not match the release tag: ' + $releaseManifest.distributionVersion)
    }
    $manifest = Get-Content -LiteralPath (Join-Path $Root 'runtime\resources\app\package.json') -Raw | ConvertFrom-Json
    $nodeModules = Join-Path $Root 'runtime\resources\app\node_modules'
    foreach ($dependency in @($manifest.dependencies.PSObject.Properties.Name)) {
        $dependencyPath = Join-Path $nodeModules ($dependency -replace '/', '\')
        if (-not (Test-Path -LiteralPath $dependencyPath)) {
            throw ('The release dependency is missing: ' + $dependency)
        }
    }
}

function Test-ZipEntrySafety {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    # The ZIP is digest-verified, but the digest and the archive come from the
    # same release source. Validate every entry before extraction so a hostile
    # archive can never write outside the destination (same policy as the
    # portable updater's Extract-ReleaseSafe).
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $fullDestination = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
        foreach ($entry in $archive.Entries) {
            $entryName = ([string]$entry.FullName).Replace('/', '\')
            if ([string]::IsNullOrWhiteSpace($entryName)) { continue }
            $isRooted = [System.IO.Path]::IsPathRooted($entryName)
            $hasColon = $entryName -match ':'
            if ($isRooted -or $hasColon -or $entryName.StartsWith('\\')) {
                throw ('Unsafe ZIP entry path: ' + $entry.FullName)
            }
            foreach ($segment in $entryName.Split('\')) {
                if ($segment -eq '..') {
                    throw ('Unsafe ZIP entry path: ' + $entry.FullName)
                }
            }
            $target = [System.IO.Path]::GetFullPath((Join-Path $Destination $entryName))
            if (-not $target.StartsWith($fullDestination, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw ('Unsafe ZIP entry path: ' + $entry.FullName)
            }
        }
    } finally {
        $archive.Dispose()
    }
}

function Extract-And-Install {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$ExpectedDistributionVersion
    )
    Write-Host ('[3/6] Extracting and installing to ' + $InstallDir + ' ...') -ForegroundColor Yellow

    $guid = [Guid]::NewGuid().ToString('N')
    $extractTemp = Join-Path $env:TEMP ('dsh-extract-' + $guid)
    New-Item -ItemType Directory -Path $extractTemp -Force | Out-Null
    try {
        Test-ZipEntrySafety -ZipPath $ZipPath -Destination $extractTemp
        $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
        if ($tar) {
            & tar.exe -xf $ZipPath -C $extractTemp
        } else {
            Expand-Archive -Path $ZipPath -DestinationPath $extractTemp -Force
        }

        $innerDir = Get-ChildItem -Path $extractTemp -Directory | Where-Object { $_.Name -like 'DeepSeek Harness*' } | Select-Object -First 1
        $sourceRoot = if ($innerDir) { $innerDir.FullName } else { $extractTemp }
        Test-PortableLayout -Root $sourceRoot -ExpectedDistributionVersion $ExpectedDistributionVersion

        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        & robocopy.exe $sourceRoot $InstallDir /E /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) {
            throw ('File synchronization failed with Robocopy exit code ' + $LASTEXITCODE + '.')
        }
        Test-PortableLayout -Root $InstallDir -ExpectedDistributionVersion $ExpectedDistributionVersion
    } finally {
        Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Show-SigningNotice {
    Write-Host '[4/6] Checking release signing status...' -ForegroundColor Yellow
    Write-Host '  This community release is not signed by a trusted commercial CA.' -ForegroundColor Gray
    Write-Host '  The installer never creates certificates or changes Windows trust stores.' -ForegroundColor Gray
}

function Create-Shortcuts {
    Write-Host '[5/6] Creating shortcuts and PATH entry...' -ForegroundColor Yellow
    $wshShell = New-Object -ComObject WScript.Shell
    $targetExe = Join-Path $InstallDir 'runtime\DeepSeek Harness.exe'
    $workDir = Join-Path $InstallDir 'runtime'
    if (-not (Test-Path -LiteralPath $targetExe)) {
        $targetExe = Join-Path $InstallDir 'DeepSeek Harness.exe'
        $workDir = $InstallDir
    }
    $iconPath = Join-Path $InstallDir 'runtime\resources\app\assets\deepseek.ico'
    if (-not (Test-Path -LiteralPath $iconPath)) {
        $iconPath = $targetExe
    }

    if (-not $NoDesktopShortcut) {
        $desktopPath = [Environment]::GetFolderPath('Desktop')
        $shortcut = $wshShell.CreateShortcut((Join-Path $desktopPath ($APP_NAME + '.lnk')))
        $shortcut.TargetPath = $targetExe
        $shortcut.WorkingDirectory = $workDir
        $shortcut.Description = 'DeepSeek Harness desktop client'
        $shortcut.IconLocation = $iconPath + ',0'
        $shortcut.WindowStyle = 1
        $shortcut.Save()
    }

    $startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'DeepSeek Harness'
    New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
    $startShortcut = $wshShell.CreateShortcut((Join-Path $startMenuDir ($APP_NAME + '.lnk')))
    $startShortcut.TargetPath = $targetExe
    $startShortcut.WorkingDirectory = $workDir
    $startShortcut.Description = 'DeepSeek Harness desktop client'
    $startShortcut.IconLocation = $iconPath + ',0'
    $startShortcut.WindowStyle = 1
    $startShortcut.Save()

    $webLauncher = Join-Path $InstallDir 'start-web.cmd'
    if (-not (Test-Path -LiteralPath $webLauncher)) {
        $webLauncher = Join-Path $InstallDir '启动网页版.bat'
    }
    if (Test-Path -LiteralPath $webLauncher) {
        $webShortcut = $wshShell.CreateShortcut((Join-Path $startMenuDir ($APP_NAME + ' (web mode).lnk')))
        $webShortcut.TargetPath = $webLauncher
        $webShortcut.WorkingDirectory = $InstallDir
        $webShortcut.IconLocation = $iconPath + ',0'
        $webShortcut.WindowStyle = 7
        $webShortcut.Save()
    }

    $uninstallLauncher = Join-Path $InstallDir 'uninstall.cmd'
    if (Test-Path -LiteralPath $uninstallLauncher) {
        $uninstallShortcut = $wshShell.CreateShortcut((Join-Path $startMenuDir ($APP_NAME + ' (uninstall).lnk')))
        $uninstallShortcut.TargetPath = $uninstallLauncher
        $uninstallShortcut.WorkingDirectory = $InstallDir
        $uninstallShortcut.Description = 'Uninstall DeepSeek Harness'
        $uninstallShortcut.IconLocation = $iconPath + ',0'
        $uninstallShortcut.WindowStyle = 1
        $uninstallShortcut.Save()
    }

    $normalizedInstall = [System.IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    $pathContainsInstall = $false
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
        foreach ($entry in @($userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
            $candidate = $entry.Trim().Trim('"')
            try {
                if (([System.IO.Path]::GetFullPath($candidate).TrimEnd('\')) -eq $normalizedInstall) {
                    $pathContainsInstall = $true
                    break
                }
            } catch {
                # Skip entries that do not normalize (unquoted oddities).
            }
        }
    }
    if (-not $pathContainsInstall) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath + ';' + $InstallDir), [EnvironmentVariableTarget]::User)
        $env:Path += ';' + $InstallDir
    }
}

function Write-Success {
    Write-Host '[6/6] Installation complete.' -ForegroundColor Green
    Write-Host ('Install directory: ' + $InstallDir) -ForegroundColor White
    Write-Host 'Launch from the desktop shortcut or run: dsh' -ForegroundColor White
}

try {
    Write-Header
    Test-Prerequisites
    $releaseInfo = Get-LatestReleaseInfo
    $tempZip = Join-Path $env:TEMP ('DeepSeek-Harness-' + $releaseInfo.version + '.zip')
    Download-WithMirrorFailover -ReleaseInfo $releaseInfo -DestinationZip $tempZip
    Extract-And-Install -ZipPath $tempZip -ExpectedDistributionVersion $releaseInfo.version
    Show-SigningNotice
    Create-Shortcuts
    Write-Success
} catch {
    Write-Host ''
    Write-Host ('Installation failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
