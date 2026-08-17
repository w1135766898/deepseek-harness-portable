[CmdletBinding()]
param(
  [ValidateSet('Stop', 'Diagnose')]
  [string]$Mode = 'Stop',
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [string]$ResourcePath,
  [string]$DestinationPath,
  [Parameter(Mandatory = $true)]
  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  return [IO.Path]::GetFullPath($Value).TrimEnd('\')
}

function Test-PathWithin([string]$Candidate, [string]$Root) {
  if ([string]::IsNullOrWhiteSpace($Candidate)) { return $false }
  $candidatePath = Get-NormalizedPath $Candidate
  $rootPath = Get-NormalizedPath $Root
  return $candidatePath.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase) -or
    $candidatePath.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Get-ProcessSnapshot {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{
      pid = [int]$_.ProcessId
      parentPid = [int]$_.ParentProcessId
      name = [string]$_.Name
      executablePath = [string]$_.ExecutablePath
      commandLine = [string]$_.CommandLine
    }
  })
}

function Get-OwnedProcesses([string]$Root) {
  @(Get-ProcessSnapshot | Where-Object { Test-PathWithin $_.executablePath $Root })
}

function Wait-OwnedExit([string]$Root, [int]$Milliseconds) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($Milliseconds)
  do {
    $remaining = @(Get-OwnedProcesses $Root)
    if ($remaining.Count -eq 0) { return @() }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  return @(Get-OwnedProcesses $Root)
}

if (-not ('DshSetup.RestartManager' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace DshSetup {
  public static class RestartManager {
    const int CCH_RM_SESSION_KEY = 32;
    const int CCH_RM_MAX_APP_NAME = 255;
    const int CCH_RM_MAX_SVC_NAME = 63;
    const int ERROR_MORE_DATA = 234;

    [StructLayout(LayoutKind.Sequential)]
    struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct RM_PROCESS_INFO {
      public RM_UNIQUE_PROCESS Process;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
      public uint ApplicationType;
      public uint AppStatus;
      public uint TSSessionId;
      [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint handle, int flags, string key);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint handle, uint fileCount, string[] files, uint appCount, IntPtr apps, uint serviceCount, string[] services);
    [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint handle, out uint needed, ref uint count, [In, Out] RM_PROCESS_INFO[] affected, ref uint reasons);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint handle);

    public static int[] GetLockingProcessIds(string[] resources) {
      uint handle;
      var key = Guid.NewGuid().ToString("N").Substring(0, CCH_RM_SESSION_KEY);
      var result = RmStartSession(out handle, 0, key);
      if (result != 0) throw new InvalidOperationException("RmStartSession failed: " + result);
      try {
        result = RmRegisterResources(handle, (uint)resources.Length, resources, 0, IntPtr.Zero, 0, null);
        if (result != 0) throw new InvalidOperationException("RmRegisterResources failed: " + result);
        uint needed = 0, count = 0, reasons = 0;
        result = RmGetList(handle, out needed, ref count, null, ref reasons);
        if (result == 0) return new int[0];
        if (result != ERROR_MORE_DATA) throw new InvalidOperationException("RmGetList(size) failed: " + result);
        var records = new RM_PROCESS_INFO[needed];
        count = needed;
        result = RmGetList(handle, out needed, ref count, records, ref reasons);
        if (result != 0) throw new InvalidOperationException("RmGetList(data) failed: " + result);
        var ids = new List<int>();
        for (var i = 0; i < count; i++) ids.Add(records[i].Process.dwProcessId);
        return ids.ToArray();
      } finally { RmEndSession(handle); }
    }
  }
}
'@
}

$installPath = Get-NormalizedPath $InstallRoot
$stopped = @()
$forced = @()
$stopErrors = @()

if ($Mode -eq 'Stop') {
  $owned = @(Get-OwnedProcesses $installPath)
  foreach ($processInfo in $owned) {
    try {
      $process = Get-Process -Id $processInfo.pid -ErrorAction Stop
      $null = $process.CloseMainWindow()
      $stopped += $processInfo
    } catch {
      $stopErrors += "PID $($processInfo.pid): $($_.Exception.Message)"
    }
  }
  $remaining = @(Wait-OwnedExit $installPath 4000)
  foreach ($processInfo in $remaining) {
    try {
      $current = @(Get-OwnedProcesses $installPath | Where-Object { $_.pid -eq $processInfo.pid })
      if ($current.Count -eq 1) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $processInfo.pid /T /F 2>&1 | Out-Null
        $forced += $processInfo
      }
    } catch {
      $stopErrors += "PID $($processInfo.pid): $($_.Exception.Message)"
    }
  }
  $null = Wait-OwnedExit $installPath 4000
}

$resources = @()
if ($Mode -eq 'Diagnose' -and -not [string]::IsNullOrWhiteSpace($ResourcePath)) {
  if (Test-Path -LiteralPath $ResourcePath -PathType Leaf) {
    $resources = @((Get-NormalizedPath $ResourcePath))
  } elseif (Test-Path -LiteralPath $ResourcePath -PathType Container) {
    $resources = @(Get-ChildItem -LiteralPath $ResourcePath -File -Recurse -Force -ErrorAction SilentlyContinue |
      Select-Object -First 4096 -ExpandProperty FullName)
  }
}

$lockError = $null
$lockingIds = @()
if ($resources.Count -gt 0) {
  try { $lockingIds = @([DshSetup.RestartManager]::GetLockingProcessIds([string[]]$resources) | Sort-Object -Unique) }
  catch { $lockError = $_.Exception.Message }
}
$snapshot = @(Get-ProcessSnapshot)
$holders = @($lockingIds | ForEach-Object {
  $lockPid = $_
  $match = @($snapshot | Where-Object { $_.pid -eq $lockPid } | Select-Object -First 1)
  if ($match.Count -eq 1) { $match[0] }
  else { [pscustomobject]@{ pid = $lockPid; parentPid = 0; name = '<exited>'; executablePath = ''; commandLine = '' } }
})

$report = [ordered]@{
  schemaVersion = 1
  timestampUtc = [DateTime]::UtcNow.ToString('o')
  mode = $Mode
  installRoot = $installPath
  resourcePath = Get-NormalizedPath $ResourcePath
  destinationPath = Get-NormalizedPath $DestinationPath
  resourceExists = if ([string]::IsNullOrWhiteSpace($ResourcePath)) { $false } else { Test-Path -LiteralPath $ResourcePath }
  destinationExists = if ([string]::IsNullOrWhiteSpace($DestinationPath)) { $false } else { Test-Path -LiteralPath $DestinationPath }
  registeredResourceCount = $resources.Count
  stoppedProcesses = $stopped
  forciblyStoppedProcesses = $forced
  stopErrors = $stopErrors
  remainingOwnedProcesses = @(Get-OwnedProcesses $installPath)
  lockingProcesses = $holders
  restartManagerError = $lockError
}

$reportDirectory = Split-Path -Parent $ReportPath
if (-not [string]::IsNullOrWhiteSpace($reportDirectory)) {
  $null = New-Item -ItemType Directory -Force -Path $reportDirectory
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
if ($report.remainingOwnedProcesses.Count -gt 0) { exit 10 }
exit 0
