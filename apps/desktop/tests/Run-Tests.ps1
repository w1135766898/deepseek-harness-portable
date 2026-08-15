# ============================================================================
# DeepSeek Harness - Updater Pester Test Runner
# ============================================================================

[CmdletBinding()]
param(
    [switch]$CI
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$testDir = $PSScriptRoot

if (-not (Get-Command Invoke-Pester -ErrorAction SilentlyContinue)) {
    Import-Module Pester -ErrorAction SilentlyContinue
}

if (-not (Get-Command Invoke-Pester -ErrorAction SilentlyContinue)) {
    Write-Error "Invoke-Pester is required to run updater tests."
    exit 1
}

$testFiles = @(Get-ChildItem -LiteralPath $testDir -Filter '*.Tests.ps1' | Sort-Object Name)
$totalPassed = 0
$totalFailed = 0

Write-Host ("Found " + $testFiles.Count + " Pester test file(s) in $testDir") -ForegroundColor Cyan

foreach ($file in $testFiles) {
    Write-Host ("`n>>> Running " + $file.Name + " ...") -ForegroundColor White
    $result = Invoke-Pester -Path $file.FullName -PassThru
    $totalPassed += $result.PassedCount
    $totalFailed += $result.FailedCount
}

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "Pester Test Results: $totalPassed passed, $totalFailed failed." -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================" -ForegroundColor Cyan

if ($totalFailed -gt 0) {
    exit 1
}
exit 0
