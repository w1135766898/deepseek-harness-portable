$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Mirror URLs and download fallback" {
    BeforeAll {
        $script:tempDir = Join-Path $env:TEMP ('pester-mirror-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:tempDir -Force | Out-Null
        $script:destination = Join-Path $script:tempDir 'release.zip'
        $script:content = 'mirror package content'
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            $script:hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($script:content)) | ForEach-Object { $_.ToString('X2') })
        } finally {
            $sha.Dispose()
        }
    }

    AfterAll {
        if ($script:tempDir -and (Test-Path -LiteralPath $script:tempDir)) {
            Remove-Item -LiteralPath $script:tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "generates direct URL first followed by configured mirror prefixes" {
        $baseUrl = "https://example.com/release.zip"
        $mirrors = @(Get-MirrorUrls $baseUrl)
        $mirrors.Count | Should BeGreaterThan 1
        $mirrors[0] | Should Be "https://example.com/release.zip"
        $mirrors[1] | Should Be ("https://ghfast.top/" + $baseUrl)
    }

    It "falls back after the direct download fails" {
        Mock -ModuleName updater Invoke-WebRequest {
            param($Uri, $OutFile)
            if ([string]$Uri -eq 'https://example.com/release.zip') {
                throw 'direct source unavailable'
            }
            [IO.File]::WriteAllBytes($OutFile, [Text.Encoding]::UTF8.GetBytes('mirror package content'))
        }
        $release = [PSCustomObject]@{
            asset_url = 'https://example.com/release.zip'
            sha256 = $script:hash
        }
        { Download-And-Verify -Release $release -Destination $script:destination } | Should Not Throw
        Assert-MockCalled -ModuleName updater Invoke-WebRequest -Times 2 -Scope It
        (Get-FileHash -Algorithm SHA256 -LiteralPath $script:destination).Hash | Should Be $script:hash
    }

    It "fails after every mirror fails" {
        Mock -ModuleName updater Invoke-WebRequest { throw 'source unavailable' }
        $release = [PSCustomObject]@{
            asset_url = 'https://example.com/release.zip'
            sha256 = $script:hash
        }
        { Download-And-Verify -Release $release -Destination $script:destination } | Should Throw 'All release mirrors failed verification'
    }
}
