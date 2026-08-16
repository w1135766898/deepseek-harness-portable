$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force -DisableNameChecking -WarningAction SilentlyContinue

Describe "Process tree termination" {
    It "does not emit taskkill status values for an already exited PID" {
        $output = @(Stop-ProcessTree -EnginePid 2147483000 -TimeoutSeconds 1)
        $output.Count | Should Be 0
    }

    It "terminates target PID without throwing error" {
        $p = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -Command Start-Sleep -Seconds 30" -WindowStyle Hidden -PassThru
        $pidToKill = $p.Id

        Stop-ProcessTree -EnginePid $pidToKill
        Start-Sleep -Milliseconds 500

        $alive = @(Get-Process -Id $pidToKill -ErrorAction SilentlyContinue)
        $alive.Count | Should Be 0
    }

    It "terminates an external node-style host whose script is under AppRoot" {
        $appRoot = Join-Path $TestDrive 'external-host-app'
        New-Item -ItemType Directory -Path (Join-Path $appRoot 'runtime') -Force | Out-Null
        $hostedScript = Join-Path $appRoot 'runtime\hosted-backend.ps1'
        [IO.File]::WriteAllText($hostedScript, 'Start-Sleep -Seconds 30', [Text.Encoding]::UTF8)
        $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile',
            '-File',
            ('"' + $hostedScript + '"')
        ) -WindowStyle Hidden -PassThru
        try {
            Start-Sleep -Milliseconds 500
            Stop-ProcessTree -AppRoot $appRoot
            Start-Sleep -Milliseconds 500
            @(Get-Process -Id $p.Id -ErrorAction SilentlyContinue).Count | Should Be 0
        } finally {
            if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }

    It "fails closed when a process tree does not exit before the timeout" {
        Mock -ModuleName updater Get-Process {
            [PSCustomObject]@{ Id = 424242; Path = 'C:\portable\runtime\DeepSeek Harness.exe' }
        }

        { Stop-ProcessTree -EnginePid 424242 -TimeoutSeconds 0 } | Should Throw 'Processes did not exit before the timeout'
    }
}
