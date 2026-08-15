$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Mirror URLs generation and ordering" {
    It "generates direct URL first followed by configured mirror prefixes" {
        $baseUrl = "https://example.com/release.zip"
        $mirrors = @(Get-MirrorUrls $baseUrl)
        $mirrors.Count | Should BeGreaterThan 1
        $mirrors[0] | Should Be "https://example.com/release.zip"
        $mirrors[1] | Should Be ("https://ghfast.top/" + $baseUrl)
    }
}
