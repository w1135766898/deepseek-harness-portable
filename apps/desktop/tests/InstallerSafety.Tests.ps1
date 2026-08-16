$installerPath = Join-Path $PSScriptRoot '..\..\..\install.ps1'
. $installerPath

Describe 'Online installer target safety' {
    It 'refuses to replace an unknown non-empty directory without Force' {
        $target = Join-Path $TestDrive 'unknown-target'
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $target 'unrelated.txt'), 'keep me')

        { Assert-SafeInstallTarget -Root $target } | Should Throw 'not a recognized DeepSeek Harness installation'
        { Assert-SafeInstallTarget -Root $target -AllowUnknownTarget } | Should Not Throw
    }

    It 'accepts an existing DeepSeek Harness layout' {
        $target = Join-Path $TestDrive 'harness-target'
        New-Item -ItemType Directory -Path (Join-Path $target 'runtime') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $target 'release-manifest.json'), '{}')
        [IO.File]::WriteAllText((Join-Path $target 'runtime\DeepSeek Harness.exe'), '')

        { Assert-SafeInstallTarget -Root $target } | Should Not Throw
    }

    It 'uses segment-aware path containment checks' {
        (Test-ProcessPathUnderRoot -ProcessPath 'C:\Apps\DeepSeek Harness\runtime\app.exe' -Root 'C:\Apps\DeepSeek Harness') | Should Be $true
        (Test-ProcessPathUnderRoot -ProcessPath 'C:\Apps\DeepSeek Harness-old\app.exe' -Root 'C:\Apps\DeepSeek Harness') | Should Be $false
    }
}
