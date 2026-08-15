$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Transaction backup, install and rollback" {
    BeforeAll {
        $script:testRoot = Join-Path $env:TEMP ('pester-trans-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:testRoot -Force | Out-Null

        $script:appRoot = Join-Path $script:testRoot 'app'
        $script:runtimeDir = Join-Path $script:appRoot 'runtime'
        New-Item -ItemType Directory -Path $script:runtimeDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $script:runtimeDir 'old-marker.txt'), 'old runtime v1.0.0', [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Join-Path $script:appRoot 'dsh.cmd'), 'old dsh.cmd', [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Join-Path $script:appRoot 'release-manifest.json'), '{"distributionVersion":"1.0.0"}', [System.Text.Encoding]::UTF8)
    }

    AfterAll {
        if ($script:testRoot -and (Test-Path -LiteralPath $script:testRoot)) {
            Remove-Item -LiteralPath $script:testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "creates backup and performs manual rollback successfully" {
        $backupsDir = Join-Path $script:appRoot '.update-backups'
        $backupSlot = Join-Path $backupsDir '1.0.0-slot1'
        New-Item -ItemType Directory -Path (Join-Path $backupSlot 'runtime') -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $backupSlot 'runtime\old-marker.txt'), 'old runtime v1.0.0', [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllText((Join-Path $backupSlot 'dsh.cmd'), 'old dsh.cmd', [System.Text.Encoding]::UTF8)

        # Corrupt runtime to simulate broken state
        [System.IO.File]::WriteAllText((Join-Path $script:runtimeDir 'old-marker.txt'), 'corrupted runtime', [System.Text.Encoding]::UTF8)

        # Invoke Rollback
        Invoke-Rollback -AppRoot $script:appRoot -BackupDir $backupSlot

        # Assert runtime was restored
        $restored = [System.IO.File]::ReadAllText((Join-Path $script:runtimeDir 'old-marker.txt'))
        $restored | Should Be 'old runtime v1.0.0'
    }

    It "automatically restores the old runtime when layout verification fails" {
        $root = Join-Path $env:TEMP ('pester-install-' + [Guid]::NewGuid().ToString('N'))
        $app = Join-Path $root 'app'
        $source = Join-Path $root 'source'
        New-Item -ItemType Directory -Path (Join-Path $app 'runtime') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $source 'runtime') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $app 'runtime\marker.txt'), 'old', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'dsh.cmd'), 'old script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'start-web.cmd'), 'old start script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'release-manifest.json'), '{"distributionVersion":"1.0.0"}', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'runtime\marker.txt'), 'new', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'dsh.cmd'), 'new script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'release-manifest.json'), '{"distributionVersion":"1.0.1"}', [Text.Encoding]::UTF8)

        Mock -ModuleName updater Test-PortableLayout { throw 'layout verification failed' }
        try {
            { Install-ReleaseWithTransaction -AppRoot $app -SourceRoot $source -FromVersion '1.0.0' -TargetVersion '1.0.1' } | Should Throw 'layout verification failed'
            [IO.File]::ReadAllText((Join-Path $app 'runtime\marker.txt')) | Should Be 'old'
            [IO.File]::ReadAllText((Join-Path $app 'dsh.cmd')) | Should Be 'old script'
            [IO.File]::ReadAllText((Join-Path $app 'start-web.cmd')) | Should Be 'old start script'
            [IO.File]::ReadAllText((Join-Path $app 'release-manifest.json')) | Should Be '{"distributionVersion":"1.0.0"}'
        } finally {
            if (Test-Path -LiteralPath $root) {
                Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    It "restores the old runtime and root payload when replacement fails" {
        $root = Join-Path $env:TEMP ('pester-replace-' + [Guid]::NewGuid().ToString('N'))
        $app = Join-Path $root 'app'
        $source = Join-Path $root 'source'
        New-Item -ItemType Directory -Path (Join-Path $app 'runtime') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $source 'runtime') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $app 'runtime\marker.txt'), 'old', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'dsh.cmd'), 'old script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'runtime\marker.txt'), 'new', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'dsh.cmd'), 'new script', [Text.Encoding]::UTF8)

        Mock -ModuleName updater Sync-ReleasePayload { throw 'replacement failed' }
        try {
            { Install-ReleaseWithTransaction -AppRoot $app -SourceRoot $source -FromVersion '1.0.0' -TargetVersion '1.0.1' } | Should Throw 'replacement failed'
            [IO.File]::ReadAllText((Join-Path $app 'runtime\marker.txt')) | Should Be 'old'
            [IO.File]::ReadAllText((Join-Path $app 'dsh.cmd')) | Should Be 'old script'
        } finally {
            if (Test-Path -LiteralPath $root) {
                Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    It "rolls back when the updated process exits before the health probe" {
        $root = Join-Path $env:TEMP ('pester-health-' + [Guid]::NewGuid().ToString('N'))
        $app = Join-Path $root 'app'
        $source = Join-Path $root 'source'
        New-Item -ItemType Directory -Path (Join-Path $app 'runtime') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $source 'runtime') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $app 'runtime\marker.txt'), 'old', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'dsh.cmd'), 'old script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'runtime\marker.txt'), 'new', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $source 'dsh.cmd'), 'new script', [Text.Encoding]::UTF8)

        Mock -ModuleName updater Test-PortableLayout {}
        Mock -ModuleName updater Sync-ReleasePayload {}
        Mock -ModuleName updater Start-Process {
            [PSCustomObject]@{ Id = 12345; HasExited = $true; ExitCode = 7 }
        }
        try {
            {
                Install-ReleaseWithTransaction -AppRoot $app -SourceRoot $source -FromVersion '1.0.0' -TargetVersion '1.0.1' -LaunchAfterUpdate
            } | Should Throw 'exited prematurely'
            [IO.File]::ReadAllText((Join-Path $app 'runtime\marker.txt')) | Should Be 'old'
            @(Get-ChildItem -LiteralPath (Join-Path $app '.update-backups') -Directory).Count | Should Be 1
        } finally {
            if (Test-Path -LiteralPath $root) {
                Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    It "installs directly from pre-extracted staging directory and cleans up staging" {
        $root = Join-Path $env:TEMP ('pester-staging-' + [Guid]::NewGuid().ToString('N'))
        $app = Join-Path $root 'app'
        $staging = Join-Path $root 'staging'
        New-Item -ItemType Directory -Path (Join-Path $app 'runtime') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $staging 'runtime') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $app 'runtime\marker.txt'), 'old', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'dsh.cmd'), 'old script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $app 'release-manifest.json'), '{"distributionVersion":"1.0.0"}', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $staging 'runtime\marker.txt'), 'staged-new', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $staging 'dsh.cmd'), 'new script', [Text.Encoding]::UTF8)
        [IO.File]::WriteAllText((Join-Path $staging 'release-manifest.json'), '{"distributionVersion":"1.0.1"}', [Text.Encoding]::UTF8)

        Mock -ModuleName updater Test-PortableLayout {}
        Mock -ModuleName updater Sync-ReleasePayload {}
        try {
            Invoke-Updater -AppRoot $app -StagingPath $staging -FromVersion '1.0.0' -TargetVersion '1.0.1' -Force
            [IO.File]::ReadAllText((Join-Path $app 'runtime\marker.txt')) | Should Be 'staged-new'
            (Test-Path -LiteralPath $staging) | Should Be $false
        } finally {
            if (Test-Path -LiteralPath $root) {
                Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
