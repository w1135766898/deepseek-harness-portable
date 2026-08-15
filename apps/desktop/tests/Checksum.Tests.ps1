$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Checksum verification and package validation" {
    BeforeAll {
        $script:tempDir = Join-Path $env:TEMP ('pester-chk-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:tempDir -Force | Out-Null
        $script:testFile = Join-Path $script:tempDir 'sample.zip'
        [System.IO.File]::WriteAllText($script:testFile, "hello package content", [System.Text.Encoding]::UTF8)
        $script:actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $script:testFile).Hash.ToUpperInvariant()
    }

    AfterAll {
        if ($script:tempDir -and (Test-Path -LiteralPath $script:tempDir)) {
            Remove-Item -LiteralPath $script:tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "verifies package with matching SHA256" {
        { Verify-LocalPackage -Path $script:testFile -ExpectedDigest $script:actualHash } | Should Not Throw
        { Verify-LocalPackage -Path $script:testFile -ExpectedDigest ("sha256:" + $script:actualHash.ToLower()) } | Should Not Throw
    }

    It "throws on SHA256 mismatch" {
        $wrongHash = "A" * 64
        { Verify-LocalPackage -Path $script:testFile -ExpectedDigest $wrongHash } | Should Throw "SHA-256 mismatch"
    }

    It "throws on invalid SHA256 format" {
        { Verify-LocalPackage -Path $script:testFile -ExpectedDigest "not-a-valid-hash" } | Should Throw "valid SHA-256 digest"
    }

    It "throws if package file is not found" {
        $missing = Join-Path $script:tempDir 'missing.zip'
        { Verify-LocalPackage -Path $missing -ExpectedDigest $script:actualHash } | Should Throw "was not found"
    }
}
