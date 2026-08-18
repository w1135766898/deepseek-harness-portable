[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,

  [Parameter(Mandatory = $true)]
  [string]$DestinationZip
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$source = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "ZIP source is not a directory: $source"
}

$destination = [System.IO.Path]::GetFullPath($DestinationZip)
$destinationParent = [System.IO.Path]::GetDirectoryName($destination)
if ([string]::IsNullOrWhiteSpace($destinationParent) -or -not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
  throw "ZIP destination parent is missing: $destinationParent"
}
if (Test-Path -LiteralPath $destination) {
  throw "ZIP destination already exists: $destination"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$encoding = [System.Text.UTF8Encoding]::new($false, $true)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $source,
  $destination,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $true,
  $encoding
)

$output = Get-Item -LiteralPath $destination -ErrorAction Stop
if ($output.Length -le 0) {
  throw "ZIP output is empty: $destination"
}
Write-Output "Created UTF-8 ZIP: $destination ($($output.Length) bytes)"
