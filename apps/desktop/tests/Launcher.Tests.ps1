$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue

Describe 'No-console desktop launcher' {
    It 'migrates only owned launcher shortcuts and reverses the migration on rollback' {
        $appRoot = Join-Path $TestDrive 'DeepSeek Harness 空格'
        $shortcutRoot = Join-Path $TestDrive 'shortcuts'
        New-Item -ItemType Directory -Path $appRoot, $shortcutRoot -Force | Out-Null
        $scriptLauncher = Join-Path $appRoot 'start-desktop.cmd'
        $guiLauncher = Join-Path $appRoot 'DeepSeek Harness Launcher.exe'
        [IO.File]::WriteAllText($scriptLauncher, '@echo off')
        [IO.File]::WriteAllText($guiLauncher, 'test launcher')

        $wsh = New-Object -ComObject WScript.Shell
        $ownedPath = Join-Path $shortcutRoot 'DeepSeek Harness.lnk'
        $owned = $wsh.CreateShortcut($ownedPath)
        $owned.TargetPath = $scriptLauncher
        $owned.WorkingDirectory = $appRoot
        $owned.Save()

        $customPath = Join-Path $shortcutRoot 'DeepSeek Harness diagnostics.lnk'
        $custom = $wsh.CreateShortcut($customPath)
        $custom.TargetPath = $scriptLauncher
        $custom.Arguments = '--diagnostic'
        $custom.Save()

        $externalPath = Join-Path $shortcutRoot 'External.lnk'
        $external = $wsh.CreateShortcut($externalPath)
        $external.TargetPath = "$env:WINDIR\System32\notepad.exe"
        $external.Save()

        (Sync-DesktopLauncherShortcuts -AppRoot $appRoot -ShortcutRoots @($shortcutRoot)) | Should Be 1
        $wsh.CreateShortcut($ownedPath).TargetPath | Should Be $guiLauncher
        $wsh.CreateShortcut($customPath).TargetPath | Should Be $scriptLauncher
        $wsh.CreateShortcut($externalPath).TargetPath | Should Be "$env:WINDIR\System32\notepad.exe"

        (Sync-DesktopLauncherShortcuts -AppRoot $appRoot -ShortcutRoots @($shortcutRoot) -PreferScriptLauncher -FailOnError) | Should Be 1
        $wsh.CreateShortcut($ownedPath).TargetPath | Should Be $scriptLauncher

        (Sync-DesktopLauncherShortcuts -AppRoot $appRoot -ShortcutRoots @($shortcutRoot)) | Should Be 1
        $wsh.CreateShortcut($ownedPath).TargetPath | Should Be $guiLauncher

        Remove-Item -LiteralPath $guiLauncher -Force
        (Sync-DesktopLauncherShortcuts -AppRoot $appRoot -ShortcutRoots @($shortcutRoot)) | Should Be 1
        $wsh.CreateShortcut($ownedPath).TargetPath | Should Be $scriptLauncher
        $wsh.CreateShortcut($customPath).TargetPath | Should Be $scriptLauncher
    }

    It 'routes installer and shortcut entry points through the GUI launcher' {
        $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
        $setupShortcuts = Get-Content -LiteralPath (Join-Path $root 'apps\desktop\setup-shortcuts.ps1') -Raw
        $onlineInstaller = Get-Content -LiteralPath (Join-Path $root 'install.ps1') -Raw
        $innoSetup = Get-Content -LiteralPath (Join-Path $root 'scripts\setup.iss') -Raw
        $payload = Get-Content -LiteralPath (Join-Path $root 'apps\desktop\updater\release-payload.ps1') -Raw
        $desktopScript = Get-Content -LiteralPath (Join-Path $root 'apps\desktop\start-desktop.cmd') -Raw
        $buildScript = Get-Content -LiteralPath (Join-Path $root 'scripts\build-desktop-web-exe.ts') -Raw

        $setupShortcuts | Should Match "launcher = Join-Path [`$]appRoot 'DeepSeek Harness Launcher[.]exe'"
        $onlineInstaller | Should Match "desktopLauncher = Join-Path [`$]InstallDir 'DeepSeek Harness Launcher[.]exe'"
        $innoSetup | Should Match 'Filename: "\{app\}\\\{#MyLauncherExeName\}"'
        $innoSetup | Should Not Match 'Filename: "\{app\}\\start-desktop[.]cmd"'
        $payload | Should Match "'DeepSeek Harness Launcher[.]exe'"
        $desktopScript | Should Match 'runtime\\DeepSeek Harness Launcher[.]exe'
        $desktopScript | Should Match 'Sync-DesktopLauncherShortcuts'
        $buildScript | Should Match "join\(rootDir, 'runtime', WINDOWS_DESKTOP_LAUNCHER_NAME\)"
    }

    It 'fails closed when recovery returns success without a terminal transaction journal' {
        $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
        $fixture = Join-Path $TestDrive 'broken recovery 空格'
        New-Item -ItemType Directory -Path $fixture -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $root 'apps\desktop\start-desktop.cmd') -Destination (Join-Path $fixture 'start-desktop.cmd')
        [IO.File]::WriteAllText((Join-Path $fixture '.update-transaction.json'), '{"phase":"backed-up","message":"not committed yet"}')
        [IO.File]::WriteAllText(
            (Join-Path $fixture 'update.ps1'),
            "[IO.File]::WriteAllText((Join-Path `$PSScriptRoot 'recovery-ran.txt'), 'yes'); exit 0")

        $previousGuiMode = $env:DSH_GUI_LAUNCHER
        try {
            $env:DSH_GUI_LAUNCHER = '1'
            $script = Join-Path $fixture 'start-desktop.cmd'
            & $env:ComSpec '/d' '/s' '/c' ('call "' + $script + '"')
            $LASTEXITCODE | Should Be 1
            (Test-Path -LiteralPath (Join-Path $fixture 'recovery-ran.txt')) | Should Be $true
        } finally {
            $env:DSH_GUI_LAUNCHER = $previousGuiMode
        }
    }
}
