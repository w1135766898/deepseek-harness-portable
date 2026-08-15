$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Path safety and Zip Slip prevention" {
    BeforeAll {
        $script:tempDir = Join-Path $env:TEMP ('pester-path-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:tempDir -Force | Out-Null
    }

    AfterAll {
        if ($script:tempDir -and (Test-Path -LiteralPath $script:tempDir)) {
            Remove-Item -LiteralPath $script:tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "allows valid subpaths inside target root" {
        $validFile = Join-Path $script:tempDir 'sub\file.txt'
        { Test-PathSafety -TargetPath $validFile -AllowedRoot $script:tempDir } | Should Not Throw
    }

    It "rejects path traversal attempting to escape allowed root" {
        $outside = Join-Path $script:tempDir '..\escape.txt'
        { Test-PathSafety -TargetPath $outside -AllowedRoot $script:tempDir } | Should Throw "Path traversal violation"
    }

    It "rejects completely unrelated root paths" {
        $otherDrive = "C:\Windows\System32\cmd.exe"
        { Test-PathSafety -TargetPath $otherDrive -AllowedRoot $script:tempDir } | Should Throw "Path traversal violation"
    }
}
