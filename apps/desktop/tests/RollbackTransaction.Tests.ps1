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
}
