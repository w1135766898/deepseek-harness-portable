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
    [switch]$LaunchAfterUpdate,
    [int]$EnginePid = 0,
    [int]$ShellPid = 0,
    [switch]$Rollback,
    [switch]$RelaunchAfterRollback
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$modulePath = Join-Path $PSScriptRoot 'updater\updater.psm1'
if (-not (Test-Path -LiteralPath $modulePath)) {
    # If installed in root without updater subdir, check beside script
    $modulePath = Join-Path $PSScriptRoot 'updater.psm1'
}

if (Test-Path -LiteralPath $modulePath) {
    Import-Module -Name $modulePath -Force
} else {
    throw ("Updater module not found at: " + $modulePath)
}

Invoke-Updater `
    -Force:$Force `
    -StatusFile $StatusFile `
    -FromVersion $FromVersion `
    -TargetVersion $TargetVersion `
    -PackagePath $PackagePath `
    -ExpectedSha256 $ExpectedSha256 `
    -LaunchAfterUpdate:$LaunchAfterUpdate `
    -EnginePid $EnginePid `
    -ShellPid $ShellPid `
    -Rollback:$Rollback `
    -RelaunchAfterRollback:$RelaunchAfterRollback
