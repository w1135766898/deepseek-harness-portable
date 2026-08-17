$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue

Describe 'Portable release update channel' {
    It 'compares the installed distribution only with the portable release' {
        $status = Get-ReleaseUpdateStatus `
            -LocalInfo ([PSCustomObject]@{ distributionVersion = '1.3.0'; kernelVersion = '0.1.0-rc.5' }) `
            -ReleaseQuery { [PSCustomObject]@{ version = '1.3.1' } }
        $status.currentVersion | Should Be '1.3.0'
        $status.latestVersion | Should Be '1.3.1'
        $status.updateAvailable | Should Be $true
        $status.PSObject.Properties['kernel'] | Should Be $null
    }

    It 'does not treat the bundled kernel version as an update channel' {
        $status = Get-ReleaseUpdateStatus `
            -LocalInfo ([PSCustomObject]@{ distributionVersion = '1.3.0'; kernelVersion = '0.1.0-rc.5' }) `
            -ReleaseQuery { [PSCustomObject]@{ version = '1.3.0'; kernelVersion = '0.1.0-rc.7' } }
        $status.updateAvailable | Should Be $false
    }

    It 'reports only a portable release lookup failure' {
        $status = Get-ReleaseUpdateStatus `
            -LocalInfo ([PSCustomObject]@{ distributionVersion = '1.3.0'; kernelVersion = '0.1.0-rc.7' }) `
            -ReleaseQuery { throw 'release unavailable' }
        $status.updateAvailable | Should Be $false
        $status.error | Should Match 'release unavailable'
    }
}
