[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

try {
    $scriptDir = $PSScriptRoot
    $appRoot = if ((Split-Path -Leaf $scriptDir) -ieq 'runtime') { Split-Path -Parent $scriptDir } else { $scriptDir }
    $runtimeDir = Join-Path $appRoot 'runtime'
    $exe = Join-Path $runtimeDir 'DeepSeek Harness.exe'
    $launcher = Join-Path $appRoot 'DeepSeek Harness Launcher.exe'
    if (-not (Test-Path -LiteralPath $exe)) { throw ('Executable not found: ' + $exe) }
    if (-not (Test-Path -LiteralPath $launcher)) { throw ('Safe desktop launcher not found: ' + $launcher) }
    $ico = Join-Path $runtimeDir 'resources\app\assets\deepseek.ico'
    if (-not (Test-Path -LiteralPath $ico)) { $ico = $exe }

    Write-Host 'Creating a desktop shortcut and adding the portable root to PATH...' -ForegroundColor Cyan
    Write-Host 'No certificate is created and no Windows trust store is modified.' -ForegroundColor Gray

    $wsh = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcut = $wsh.CreateShortcut((Join-Path $desktop 'DeepSeek Harness.lnk'))
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = $appRoot
    $shortcut.Description = 'DeepSeek Harness desktop client'
    $shortcut.IconLocation = ($ico + ',0')
    $shortcut.WindowStyle = 1
    $shortcut.Save()

    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    if ($userPath -notlike ('*' + $appRoot + '*')) {
        [Environment]::SetEnvironmentVariable('Path', ($userPath + ';' + $appRoot), [EnvironmentVariableTarget]::User)
    }
    Write-Host 'Shortcut and PATH configuration completed.' -ForegroundColor Green
} catch {
    Write-Host ('Configuration failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
