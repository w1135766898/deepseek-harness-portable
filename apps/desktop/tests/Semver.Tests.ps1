$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue

Describe "SemVer parsing and comparison in PowerShell" {
    It "correctly orders prerelease and release versions" {
        (Compare-Version -Left "1.0.0-beta" -Right "1.0.0") | Should Be -1
        (Compare-Version -Left "1.0.0" -Right "1.0.0-beta") | Should Be 1
        (Compare-Version -Left "1.0.0-alpha" -Right "1.0.0-beta") | Should Be -1
        (Compare-Version -Left "1.0.0-rc.2" -Right "1.0.0-rc.10") | Should Be -1
        (Compare-Version -Left "1.0.0-alpha.1" -Right "1.0.0-alpha.beta") | Should Be -1
    }

    It "ignores build metadata in precedence comparison" {
        (Compare-Version -Left "1.0.0+build.1" -Right "1.0.0+build.2") | Should Be 0
        (Compare-Version -Left "1.0.0-alpha+001" -Right "1.0.0-alpha+002") | Should Be 0
        (Compare-Version -Left "v1.0.0" -Right "1.0.0") | Should Be 0
    }

    It "correctly compares major, minor and patch versions" {
        (Compare-Version -Left "2.0.0" -Right "1.9.9") | Should Be 1
        (Compare-Version -Left "1.1.0" -Right "1.0.99") | Should Be 1
        (Compare-Version -Left "1.0.10" -Right "1.0.2") | Should Be 1
    }

    It "throws on invalid versions without falling back to string comparison" {
        { Compare-Version -Left "1.0.0-01" -Right "1.0.0" } | Should Throw
        { Compare-Version -Left "01.0.0" -Right "1.0.0" } | Should Throw
        { Compare-Version -Left "1.0.0" -Right "invalid" } | Should Throw
    }
}
