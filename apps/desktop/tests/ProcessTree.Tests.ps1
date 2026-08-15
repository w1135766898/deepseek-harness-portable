$modulePath = Join-Path $PSScriptRoot '..\updater\updater.psm1'
Import-Module -Name $modulePath -Force

Describe "Process tree termination" {
    It "terminates target PID without throwing error" {
        $p = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -Command Start-Sleep -Seconds 30" -WindowStyle Hidden -PassThru
        $pidToKill = $p.Id

        Stop-ProcessTree -EnginePid $pidToKill
        Start-Sleep -Milliseconds 500

        $alive = @(Get-Process -Id $pidToKill -ErrorAction SilentlyContinue)
        $alive.Count | Should Be 0
    }
}
