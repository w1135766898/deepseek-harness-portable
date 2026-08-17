$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue

Describe 'Independent portable shell and official kernel update channels' {
    It 'accepts only official dsh-v SemVer tags' {
        (Normalize-OfficialKernelTag -Tag 'dsh-v0.1.0-rc.7') | Should Be '0.1.0-rc.7'
        { Normalize-OfficialKernelTag -Tag 'v1.3.0' } | Should Throw
    }

    It 'selects rc.7 even when one official source fails' {
        Mock -ModuleName updater Invoke-RestMethod {
            param($Uri)
            if ([string]$Uri -eq 'https://failed.test/releases') { throw 'source unavailable' }
            return @(
                [PSCustomObject]@{ tag_name = 'v9.0.0'; draft = $false },
                [PSCustomObject]@{ tag_name = 'dsh-v0.1.0-rc.5'; draft = $false; prerelease = $true },
                [PSCustomObject]@{ tag_name = 'dsh-v0.1.0-rc.7'; draft = $false; prerelease = $true }
            )
        }
        $release = Get-RemoteKernelRelease -ApiUrls @('https://failed.test/releases', 'https://working.test/releases')
        $release.version | Should Be '0.1.0-rc.7'
        $release.channel | Should Be 'kernel'
    }

    It 'does not compare distribution 1.3.0 against kernel 0.1.0-rc.7' {
        $status = Get-UpdateChannelStatus `
            -LocalInfo ([PSCustomObject]@{ distributionVersion = '1.3.0'; kernelVersion = '0.1.0-rc.5' }) `
            -PortableQuery { [PSCustomObject]@{ version = '1.3.0' } } `
            -KernelQuery { [PSCustomObject]@{ version = '0.1.0-rc.7' } }
        $status.portable.updateAvailable | Should Be $false
        $status.kernel.updateAvailable | Should Be $true
    }

    It 'keeps a successful kernel result when the portable source fails' {
        $status = Get-UpdateChannelStatus `
            -LocalInfo ([PSCustomObject]@{ distributionVersion = '1.3.0'; kernelVersion = '0.1.0-rc.5' }) `
            -PortableQuery { throw 'portable unavailable' } `
            -KernelQuery { [PSCustomObject]@{ version = '0.1.0-rc.7' } }
        $status.portable.error | Should Match 'portable unavailable'
        $status.kernel.updateAvailable | Should Be $true
    }
}
