$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Cached update package reuse" {
    BeforeAll {
        $script:savedTemp = $env:TEMP
        $script:tempRoot = Join-Path $env:TEMP ('pester-cache-' + [Guid]::NewGuid().ToString('N'))
        $script:updateDir = Join-Path $script:tempRoot 'deepseek-harness-updates'
        New-Item -ItemType Directory -Path $script:updateDir -Force | Out-Null
        $script:package = Join-Path $script:updateDir 'DeepSeek-Harness-1.1.0-1234567890.zip'
        [System.IO.File]::WriteAllText($script:package, 'fake package content', [System.Text.Encoding]::UTF8)
        $script:goodHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $script:package).Hash.ToUpperInvariant()
        $script:badHash = "A" * 64
        $env:TEMP = $script:tempRoot
    }

    AfterAll {
        $env:TEMP = $script:savedTemp
        if ($script:tempRoot -and (Test-Path -LiteralPath $script:tempRoot)) {
            Remove-Item -LiteralPath $script:tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "returns the cached package when its SHA256 matches the expected digest" {
        $found = Find-CachedUpdatePackage -TargetVersion '1.1.0' -ExpectedDigest $script:goodHash
        $found | Should Be $script:package
    }

    It "accepts a sha256:-prefixed lowercase digest" {
        $found = Find-CachedUpdatePackage -TargetVersion '1.1.0' -ExpectedDigest ('sha256:' + $script:goodHash.ToLower())
        $found | Should Be $script:package
    }

    It "returns empty when the cached package digest does not match" {
        $found = Find-CachedUpdatePackage -TargetVersion '1.1.0' -ExpectedDigest $script:badHash
        $found | Should Be ''
    }

    It "returns empty when the cached package is for a different version" {
        $found = Find-CachedUpdatePackage -TargetVersion '1.2.0' -ExpectedDigest $script:goodHash
        $found | Should Be ''
    }

    It "returns empty when the update cache directory is missing" {
        Remove-Item -LiteralPath $script:updateDir -Recurse -Force -ErrorAction SilentlyContinue
        $found = Find-CachedUpdatePackage -TargetVersion '1.1.0' -ExpectedDigest $script:goodHash
        $found | Should Be ''
    }
}
