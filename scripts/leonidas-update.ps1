<#
.SYNOPSIS
  Verify and install the latest development release, including migration from legacy 1.0.x.
.DESCRIPTION
  Never stops processes. With -WaitForExit it waits for the installed app to close normally.
  -PrepareOnly downloads and verifies without installing. Keeps existing app identity and data.
#>
[CmdletBinding()]
param(
  [switch]$WaitForExit,
  [switch]$PrepareOnly,
  [string]$Repository = 'ItzJsimp/leonidas-code'
)
$ErrorActionPreference = 'Stop'
$app = Join-Path $env:LOCALAPPDATA 'Programs/t3code/Leonidas.exe'
# Installs from before the rename run as 'Leonidas Code.exe'. Treat them as the same app.
$legacyApp = Join-Path $env:LOCALAPPDATA 'Programs/t3code/Leonidas Code.exe'
$release = Invoke-RestMethod "https://api.github.com/repos/$Repository/releases/latest"
if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v\d+\.\d+\.\d+$') {
  throw 'Latest release is not a published stable version.'
}
$version = $release.tag_name.Substring(1)
$asset = $release.assets | Where-Object { $_.name -in @("Leonidas-$version-x64.exe", "Leonidas-Code-$version-x64.exe") } | Select-Object -First 1
$manifest = $release.assets | Where-Object name -eq 'latest.yml'
if (-not $asset -or -not $manifest -or $asset.digest -notmatch '^sha256:([a-f0-9]{64})$') {
  throw 'Release is missing its installer, manifest or installer checksum.'
}
$expectedHash = $Matches[1]
$directory = Join-Path $env:TEMP "leonidas-migration-$version"
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$installer = Join-Path $directory $asset.name
if (-not (Test-Path -LiteralPath $installer) -or (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ine $expectedHash) {
  Invoke-WebRequest $asset.browser_download_url -OutFile $installer
}
if ((Get-Item -LiteralPath $installer).Length -ne $asset.size -or
    (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ine $expectedHash) {
  throw 'Installer size or checksum does not match the published release.'
}
$content = (Invoke-WebRequest $manifest.browser_download_url).Content
$yaml = if ($content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($content) } else { [string]$content }
if ($yaml -notmatch "(?m)^version: $([regex]::Escape($version))\s*$" -or
    $yaml -notmatch "(?m)^path: $([regex]::Escape($asset.name))\s*$" -or
    $yaml -notmatch '(?m)^sha512: ([A-Za-z0-9+/=]+)\s*$') {
  throw 'Updater manifest does not match the installer.'
}
$sha512 = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $installer -Algorithm SHA512).Hash))
if ($sha512 -cne $Matches[1]) { throw 'Updater manifest checksum mismatch.' }
Write-Host "Verified $version installer: $installer"
if ($PrepareOnly) { return }
# Capture only processes belonging to this installed executable; never kill by name.
$running = @(Get-CimInstance Win32_Process -Filter "Name='Leonidas.exe' OR Name='Leonidas Code.exe'" |
  Where-Object { $_.ExecutablePath -in @($app, $legacyApp) })
if ($running.Count -gt 0 -and -not $WaitForExit) {
  throw 'Close Leonidas first, or use -WaitForExit to install after it closes normally.'
}
foreach ($process in $running) {
  Wait-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
}
# A new app instance may have started while waiting; leave it alone.
if (Get-CimInstance Win32_Process -Filter "Name='Leonidas.exe' OR Name='Leonidas Code.exe'" | Where-Object { $_.ExecutablePath -in @($app, $legacyApp) }) {
  throw 'Leonidas reopened; close it and run the migration again.'
}
$installed = Start-Process -FilePath $installer -ArgumentList '/S', '/currentuser', '--updated', '/KEEP_APP_DATA' -WindowStyle Hidden -Wait -PassThru
if ($installed.ExitCode -ne 0) { throw "Installer failed with exit $($installed.ExitCode)." }
if (-not (Test-Path -LiteralPath $app) -or (Get-Item -LiteralPath $app).VersionInfo.ProductVersion -notlike "$version*") {
  throw 'Installed executable does not match the requested version.'
}
Write-Host "Installed $version; existing app data retained."
Start-Process -FilePath $app -WindowStyle Hidden
