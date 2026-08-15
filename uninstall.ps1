# DeepSeek Harness portable uninstaller for Windows x64.
# The default action removes only the installed application, shortcuts, and
# PATH entry. The official Harness user-data root is kept unless the user
# explicitly opts into deleting it.

[CmdletBinding()]
param(
    [string]$InstallDir = $PSScriptRoot,
    [switch]$RemoveUserData,
    [switch]$KeepUserData,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$APP_NAME = 'DeepSeek Harness'

function Normalize-Path {
    param([Parameter(Mandatory = $true)][string]$Path)

    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.Length -gt 3) { return $full.TrimEnd('\') }
    return $full
}

function Resolve-UserDataRoot {
    $configured = [Environment]::GetEnvironmentVariable('DSH_HOME')
    if ([string]::IsNullOrWhiteSpace($configured)) {
        $configured = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh'
    }
    return Normalize-Path $configured.Trim()
}

function Resolve-ElectronUserDataRoot {
    return Normalize-Path (Join-Path ([Environment]::GetFolderPath('ApplicationData')) $APP_NAME)
}

function Assert-InstallRoot {
    param([Parameter(Mandatory = $true)][string]$Root)

    if ([string]::IsNullOrWhiteSpace($Root)) {
        throw 'The install directory is empty.'
    }
    $normalized = Normalize-Path $Root
    $rootOfDrive = Normalize-Path ([System.IO.Path]::GetPathRoot($normalized))
    if ($normalized -eq $rootOfDrive) {
        throw ('Refusing to remove a drive root: ' + $normalized)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $normalized 'runtime') -PathType Container)) {
        throw ('The directory does not look like a DeepSeek Harness install: ' + $normalized)
    }
    return $normalized
}

function Assert-DataRoot {
    param(
        [Parameter(Mandatory = $true)][string]$DataRoot,
        [Parameter(Mandatory = $true)][string]$InstallRoot
    )

    $normalized = Normalize-Path $DataRoot
    $blocked = @(
        (Normalize-Path ([Environment]::GetFolderPath('UserProfile'))),
        (Normalize-Path ([Environment]::GetFolderPath('ApplicationData'))),
        (Normalize-Path ([Environment]::GetFolderPath('LocalApplicationData'))),
        (Normalize-Path $InstallRoot),
        (Normalize-Path ([System.IO.Path]::GetPathRoot($normalized)))
    )
    if ($blocked -contains $normalized) {
        throw ('Refusing to remove a broad or unsafe data path: ' + $normalized)
    }
    return $normalized
}

function Stop-RunningApp {
    $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like 'DeepSeek Harness*'
    }
    if ($processes) {
        Write-Host 'Stopping running DeepSeek Harness processes...' -ForegroundColor Yellow
        # Kill the full process tree (engine children included), not just the
        # top-level shells, then fall back to Stop-Process for survivors.
        try { & taskkill.exe /IM 'DeepSeek Harness*.exe' /T /F 2>$null | Out-Null } catch {}
        Start-Sleep -Milliseconds 750
        $survivors = Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessName -like 'DeepSeek Harness*'
        }
        if ($survivors) {
            $survivors | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }
}

function Remove-ShortcutIfPresent {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Remove-InstallPathEntry {
    param([Parameter(Mandatory = $true)][string]$InstallRoot)

    $current = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    if ([string]::IsNullOrWhiteSpace($current)) { return }

    $normalizedInstall = Normalize-Path $InstallRoot
    $entries = @($current -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $kept = foreach ($entry in $entries) {
        $candidate = $entry.Trim().Trim('"')
        try {
            if ((Normalize-Path $candidate) -ne $normalizedInstall) { $candidate }
        } catch {
            $candidate
        }
    }
    $updated = $kept -join ';'
    if ($updated -ne $current) {
        [Environment]::SetEnvironmentVariable('Path', $updated, [EnvironmentVariableTarget]::User)
    }
}

function Assert-NotReparsePoint {
    param([Parameter(Mandatory = $true)][string]$Path)

    # Remove-Item -Recurse must never follow a junction or symlink: if a user
    # redirected DSH_HOME to a link, refuse and tell them instead of deleting
    # the link's target tree.
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType) {
        throw ('Refusing to remove a symbolic link or junction: ' + $Path + ' -> ' + $item.Target)
    }
}

function Remove-UserData {
    param(
        [Parameter(Mandatory = $true)][string]$DataRoot,
        [Parameter(Mandatory = $true)][string]$ElectronRoot,
        [Parameter(Mandatory = $true)][string]$InstallRoot
    )

    $safeDataRoot = Assert-DataRoot -DataRoot $DataRoot -InstallRoot $InstallRoot
    $safeElectronRoot = Normalize-Path $ElectronRoot
    $targets = @($safeDataRoot)
    if ($safeElectronRoot -ne $safeDataRoot) { $targets += $safeElectronRoot }

    foreach ($target in $targets) {
        Assert-NotReparsePoint -Path $target
        if (Test-Path -LiteralPath $target) {
            Write-Host ('Removing user data: ' + $target) -ForegroundColor Yellow
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

function Schedule-InstallRemoval {
    param([Parameter(Mandatory = $true)][string]$InstallRoot)

    $cleanupPath = Join-Path $env:TEMP ('dsh-uninstall-' + [Guid]::NewGuid().ToString('N') + '.cmd')
    # Escape % as %% so a path containing a percent sign survives cmd.exe
    # variable expansion, and double quotes for the quoted argument.
    $quotedRoot = '"' + $InstallRoot.Replace('%', '%%').Replace('"', '""') + '"'
    $contents = @(
        '@echo off',
        'timeout /t 2 /nobreak >nul',
        ('rmdir /s /q ' + $quotedRoot),
        ('del /f /q "%~f0" >nul 2>&1')
    ) -join "`r`n"
    Set-Content -LiteralPath $cleanupPath -Value $contents -Encoding ASCII
    Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $cleanupPath) -WindowStyle Hidden
}

try {
    if ($RemoveUserData -and $KeepUserData) {
        throw 'RemoveUserData and KeepUserData cannot be used together.'
    }

    $installRoot = Assert-InstallRoot -Root $InstallDir
    $dataRoot = Resolve-UserDataRoot
    $electronRoot = Resolve-ElectronUserDataRoot

    $removeData = [bool]$RemoveUserData
    if (-not $RemoveUserData -and -not $KeepUserData) {
        Write-Host ''
        Write-Host 'DeepSeek Harness user data is kept by default.' -ForegroundColor Green
        Write-Host ('Official Harness data: ' + $dataRoot) -ForegroundColor Gray
        Write-Host ('Desktop shell data:   ' + $electronRoot) -ForegroundColor Gray
        $answer = Read-Host 'Delete conversations, credentials, settings, and desktop data too? [y/N]'
        $removeData = $answer -match '^(y|yes)$'
    }

    if ($removeData -and -not $Yes) {
        $confirmation = Read-Host 'Type DELETE to confirm permanent removal of local user data'
        if ($confirmation -cne 'DELETE') {
            Write-Host 'User data will be kept.' -ForegroundColor Green
            $removeData = $false
        }
    }

    Stop-RunningApp
    Remove-ShortcutIfPresent -Path (Join-Path ([Environment]::GetFolderPath('Desktop')) ($APP_NAME + '.lnk'))
    Remove-ShortcutIfPresent -Path (Join-Path ([Environment]::GetFolderPath('Programs')) ($APP_NAME + '\' + $APP_NAME + '.lnk'))
    Remove-ShortcutIfPresent -Path (Join-Path ([Environment]::GetFolderPath('Programs')) ($APP_NAME + '\' + $APP_NAME + ' (web mode).lnk'))
    Remove-ShortcutIfPresent -Path (Join-Path ([Environment]::GetFolderPath('Programs')) ($APP_NAME + '\' + $APP_NAME + ' (uninstall).lnk'))
    Remove-InstallPathEntry -InstallRoot $installRoot

    if ($removeData) {
        Remove-UserData -DataRoot $dataRoot -ElectronRoot $electronRoot -InstallRoot $installRoot
    } else {
        Write-Host 'Keeping conversations, credentials, settings, and desktop data.' -ForegroundColor Green
    }

    Write-Host 'Uninstalling the application files...' -ForegroundColor Yellow
    Schedule-InstallRemoval -InstallRoot $installRoot
    Write-Host 'Uninstall scheduled. The application directory will be removed shortly.' -ForegroundColor Green
} catch {
    Write-Host ('Uninstallation failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
