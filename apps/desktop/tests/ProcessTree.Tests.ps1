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

    It "fails closed when a process tree does not exit before the timeout" {
        Mock -ModuleName updater Get-Process {
            [PSCustomObject]@{ Id = 424242; Path = 'C:\portable\runtime\DeepSeek Harness.exe' }
        }

        { Stop-ProcessTree -EnginePid 424242 -TimeoutSeconds 0 } | Should Throw 'Processes did not exit before the timeout'
    }
}
