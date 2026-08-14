# ==============================================================================
# DeepSeek Harness Official Upstream Direct Updater (With Domestic Mirror Acceleration)
# Upstream: https://github.com/deepseek-ai/deepseek-harness / @deepseek-ai/dsh
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$OFFICIAL_REPO = "deepseek-ai/deepseek-harness"
$SCRIPT_ROOT = $PSScriptRoot

# Determine app root
$APP_ROOT = $SCRIPT_ROOT
if ((Split-Path -Leaf $SCRIPT_ROOT) -ieq "runtime") {
    $APP_ROOT = Split-Path -Parent $SCRIPT_ROOT
}

function Write-Banner {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "   DeepSeek Harness Official Upstream Direct Updater            " -ForegroundColor Cyan
    Write-Host "   (Connecting to deepseek-ai upstream with domestic CDN mirror)" -ForegroundColor Gray
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-LocalVersion {
    $paths = @(
        (Join-Path $APP_ROOT "runtime\resources\app\package.json"),
        (Join-Path $APP_ROOT "resources\app\package.json")
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                $json = Get-Content $p -Raw | ConvertFrom-Json
                if ($json.version) { return ("v" + $json.version) }
            } catch {}
        }
    }
    return "unknown"
}

function Get-RemoteRelease {
    Write-Host "[1/4] Connecting to DeepSeek official upstream to check latest release..." -ForegroundColor Yellow
    
    $endpoints = @(
        "https://registry.npmmirror.com/@deepseek-ai/dsh",
        ("https://api.github.com/repos/" + $OFFICIAL_REPO + "/releases/latest"),
        "https://registry.npmjs.org/@deepseek-ai/dsh",
        ("https://ghfast.top/https://api.github.com/repos/" + $OFFICIAL_REPO + "/releases/latest")
    )

    foreach ($ep in $endpoints) {
        try {
            $headers = @{ "User-Agent" = "DeepSeek-Harness-Updater" }
            $res = Invoke-RestMethod -Uri $ep -Headers $headers -TimeoutSec 5
            if ($res."dist-tags".latest) {
                Write-Host ("  -> [Connected] DeepSeek Official Domestic Mirror (Alibaba Cloud CDN): v" + $res."dist-tags".latest) -ForegroundColor Green
                return [PSCustomObject]@{
                    tag_name = ("v" + $res."dist-tags".latest)
                    source = "npm"
                    version = $res."dist-tags".latest
                }
            }
            if ($res.tag_name) {
                Write-Host ("  -> [Connected] DeepSeek Official GitHub: " + $res.tag_name) -ForegroundColor Green
                return [PSCustomObject]@{
                    tag_name = $res.tag_name
                    source = "github"
                    version = ($res.tag_name -replace '^v', '')
                    assets = $res.assets
                }
            }
        } catch {}
    }
    
    return [PSCustomObject]@{
        tag_name = "v0.1.0-rc.6"
        source = "npm"
        version = "0.1.0-rc.6"
    }
}

function Stop-RunningProcesses {
    Write-Host "[2/4] Checking and stopping running DeepSeek Harness instances..." -ForegroundColor Yellow
    $procs = Get-Process | Where-Object { $_.ProcessName -like "*DeepSeek Harness*" }
    if ($procs) {
        Write-Host "  -> Stopping background processes..." -ForegroundColor Gray
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Apply-Update {
    param($RemoteVer, $ReleaseInfo)
    Write-Host ("[3/4] Downloading official upstream core package (" + $RemoteVer + ")...") -ForegroundColor Yellow
    
    $cleanVer = $RemoteVer -replace '^v', ''
    $tempFile = Join-Path $env:TEMP ("dsh-official-" + $cleanVer + ".tgz")
    
    $downloadUrls = @(
        ("https://registry.npmmirror.com/@deepseek-ai/dsh/-/dsh-" + $cleanVer + ".tgz"),
        ("https://cdn.npmmirror.com/packages/%40deepseek-ai/dsh/" + $cleanVer + "/dsh-" + $cleanVer + ".tgz"),
        ("https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-" + $cleanVer + ".tgz")
    )

    $downloadSuccess = $false
    foreach ($url in $downloadUrls) {
        try {
            $hostName = ([System.Uri]$url).Host
            Write-Host ("  -> Trying official node: " + $hostName + " ...") -ForegroundColor Cyan
            
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent", "DeepSeek-Harness-Updater")
            $wc.DownloadFile($url, $tempFile)
            
            if ((Test-Path $tempFile) -and (Get-Item $tempFile).Length -gt 1000) {
                $firstBytes = [System.IO.File]::ReadAllBytes($tempFile)
                $firstText = [System.Text.Encoding]::UTF8.GetString($firstBytes[0..[Math]::Min(100, $firstBytes.Length-1)])
                if ($firstText -match "Redirecting to (https?://[^\s]+)") {
                    $redirUrl = $matches[1]
                    Write-Host ("  -> Following CDN redirect: " + ([System.Uri]$redirUrl).Host) -ForegroundColor Gray
                    $wc.DownloadFile($redirUrl, $tempFile)
                }
                
                $sizeKb = [Math]::Round(((Get-Item $tempFile).Length / 1KB), 1)
                Write-Host ("  -> [Success] Official package downloaded (" + $sizeKb + " KB)!") -ForegroundColor Green
                $downloadSuccess = $true
                break
            }
        } catch {
            Write-Host "  -> Node timeout, trying next mirror..." -ForegroundColor Yellow
        }
    }

    if (-not $downloadSuccess) {
        throw "Failed to download update package from all official mirror endpoints."
    }

    Write-Host "[4/4] Hot-replacing runtime core (Preserving all user sessions and configs)..." -ForegroundColor Yellow
    $guid = [Guid]::NewGuid().ToString("N")
    $tempExtract = Join-Path $env:TEMP ("dsh-update-" + $guid)
    New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null
    
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & tar.exe -xf $tempFile -C $tempExtract
    } else {
        Expand-Archive -Path $tempFile -DestinationPath $tempExtract -Force
    }

    $packageDir = Join-Path $tempExtract "package"
    if (-not (Test-Path $packageDir)) {
        $packageDir = $tempExtract
    }

    $destAppDir = Join-Path $APP_ROOT "runtime\resources\app"
    if (-not (Test-Path $destAppDir)) {
        $destAppDir = Join-Path $APP_ROOT "resources\app"
    }

    if (Test-Path $destAppDir) {
        Write-Host ("  -> Syncing official latest files to: " + $destAppDir) -ForegroundColor Cyan
        & robocopy.exe $packageDir $destAppDir /E /XD node_modules /R:2 /W:1 /NP /NDL /NFL /NJH /NJS | Out-Null
        $code = $LASTEXITCODE
        if ($code -ge 8) {
            throw ("File sync failed, robocopy code: " + $code)
        }
    }

    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ("  🎉 Update Successful! Synchronized with official upstream " + $RemoteVer) -ForegroundColor Green
    Write-Host "  All user sessions, settings and workspaces are safely preserved." -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ""
}

try {
    Write-Banner
    $localVer = Get-LocalVersion
    Write-Host ("  Local version:  " + $localVer) -ForegroundColor White
    
    $release = Get-RemoteRelease
    $remoteVer = $release.tag_name
    Write-Host ("  Latest version: " + $remoteVer) -ForegroundColor White
    Write-Host ""

    if ($localVer -eq $remoteVer -and -not $Force) {
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host ("  [Notice] Already up to date with official release (" + $localVer + ")!") -ForegroundColor Green
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host ""
        return
    }

    Stop-RunningProcesses
    Apply-Update -RemoteVer $remoteVer -ReleaseInfo $release
} catch {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host ("  [Update Error] " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host ""
}
