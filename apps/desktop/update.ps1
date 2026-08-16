# ============================================================================
# DeepSeek Harness portable distribution updater entrypoint
# ============================================================================

[CmdletBinding()]
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
    [switch]$RecoverOnly,
    [string]$AppRoot = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Resolve the portable distribution root from the script file itself. In normal
# operation $PSScriptRoot is available, but a small number of Windows PowerShell
# 5.1 launch environments report it as an empty string; falling back to
# $MyInvocation (and finally the current directory) prevents the updater from
# receiving an empty -AppRoot and failing before it starts.
$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $PSScriptRoot
} elseif ($MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    (Get-Location).Path
}

# Bootstrap failure reporter. Runs before the updater module is imported so a
# launch that dies early (module missing, parameter errors, pending-transaction
# recovery failure) still records a terminal status instead of leaving the
# desktop shell stuck at "starting", which the shell would later surface as
# "last update incomplete".
function Write-BootstrapFailureStatus {
    param(
        [string]$StatusFile,
        [string]$FromVersion,
        [string]$TargetVersion,
        [string]$Message
    )
    if ([string]::IsNullOrWhiteSpace($StatusFile)) { return }
    try {
        $existing = $null
        if (Test-Path -LiteralPath $StatusFile) {
            try { $existing = Get-Content -LiteralPath $StatusFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
        }
        $now = [DateTime]::UtcNow.ToString('o')
        $startedAt = if ($existing -and $existing.startedAt) { [string]$existing.startedAt } else { $now }
        $payload = [ordered]@{
            state = 'failed'
            fromVersion = $FromVersion
            targetVersion = $TargetVersion
            stage = 'launch'
            message = $Message
            updatedAt = $now
            startedAt = $startedAt
            processId = $PID
        }
        $temporary = $StatusFile + '.' + $PID + '.bootstrap.tmp'
        [System.IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $StatusFile) {
            try { [System.IO.File]::Replace($temporary, $StatusFile, $null, $true) }
            catch { Move-Item -LiteralPath $temporary -Destination $StatusFile -Force }
        } else {
            Move-Item -LiteralPath $temporary -Destination $StatusFile -Force
        }
    } catch {}
}

try {
    $modulePath = Join-Path $scriptRoot 'updater\updater.psm1'
    if (-not (Test-Path -LiteralPath $modulePath)) {
        # If installed in root without updater subdir, check beside script
        $modulePath = Join-Path $scriptRoot 'updater.psm1'
    }

    if (Test-Path -LiteralPath $modulePath) {
        # The public module keeps legacy command names for release
        # compatibility. Suppress PowerShell's discovery-only naming warnings;
        # updater failures still remain terminating errors.
        Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue
    } else {
        throw ("Updater module not found at: " + $modulePath)
    }

    # A staged release may run its own newer updater against an older or
    # damaged installation. Keep the module/script root separate from the
    # installation being repaired so the bootstrap never depends on files in
    # the target runtime.
    $targetRoot = if ([string]::IsNullOrWhiteSpace($AppRoot)) {
        $scriptRoot
    } else {
        [System.IO.Path]::GetFullPath($AppRoot)
    }

    # Serialize update, rollback, and startup recovery for this installation.
    # A process-local lock is insufficient because shortcuts and a second
    # desktop process can start another PowerShell updater concurrently.
    $normalizedRoot = $targetRoot.TrimEnd('\').ToUpperInvariant()
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalizedRoot))
    } finally {
        $sha256.Dispose()
    }
    $mutexName = 'Local\DeepSeekHarnessUpdater-' + ([System.BitConverter]::ToString($digest).Replace('-', '').Substring(0, 24))
    $updateMutex = New-Object System.Threading.Mutex($false, $mutexName)
    $mutexAcquired = $false
    try {
        try {
            $mutexAcquired = $updateMutex.WaitOne([TimeSpan]::FromMinutes(3))
        } catch [System.Threading.AbandonedMutexException] {
            # Ownership is granted when WaitOne reports an abandoned mutex.
            $mutexAcquired = $true
        }
        if (-not $mutexAcquired) {
            throw 'Another update operation is still running after the three-minute wait timeout.'
        }

        if ($RecoverOnly) {
            Recover-PendingTransaction -AppRoot $targetRoot -StatusFile $StatusFile
        } else {
            # update.ps1 ships at the portable distribution root, so its own
            # directory IS AppRoot; pass it explicitly instead of inferring it
            # from the updater module directory.
            Invoke-Updater `
                -Force:$Force `
                -StatusFile $StatusFile `
                -FromVersion $FromVersion `
                -TargetVersion $TargetVersion `
                -PackagePath $PackagePath `
                -ExpectedSha256 $ExpectedSha256 `
                -StagingPath $StagingPath `
                -LaunchAfterUpdate:$LaunchAfterUpdate `
                -EnginePid $EnginePid `
                -ShellPid $ShellPid `
                -Rollback:$Rollback `
                -RelaunchAfterRollback:$RelaunchAfterRollback `
                -AppRoot $targetRoot
        }
    } finally {
        if ($mutexAcquired) {
            try { $updateMutex.ReleaseMutex() } catch {}
        }
        $updateMutex.Dispose()
    }
} catch {
    Write-BootstrapFailureStatus -StatusFile $StatusFile -FromVersion $FromVersion -TargetVersion $TargetVersion -Message $_.Exception.Message
    Write-Host ('Update failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
