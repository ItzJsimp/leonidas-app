<#
.SYNOPSIS
  Local update status and delivery timings. Use -Register to refresh every five minutes.
.DESCRIPTION
  Reports stay on this machine. No credentials, messages or account information are collected.
  Detection lag includes time the app was closed/offline; download and restart waits are separate.
#>
[CmdletBinding()]
param(
  [string]$DeviceLabel = 'Local',
  [switch]$Register,
  [string]$Repository = 'ItzJsimp/leonidas-app',
  [string]$StateDirectory = (Join-Path $HOME '.t3/userdata'),
  [string]$ReportDirectory = (Join-Path $env:LOCALAPPDATA 'LeonidasCodeUpdateHealth')
)
$ErrorActionPreference = 'Stop'
if ($Register) {
  # Copy the monitor out of the checkout so later branch changes cannot disable it.
  New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
  $monitor = Join-Path $ReportDirectory 'monitor.ps1'
  Copy-Item -LiteralPath $PSCommandPath -Destination $monitor -Force
  foreach ($value in @($monitor, $DeviceLabel, $Repository, $StateDirectory, $ReportDirectory)) {
    if ($value.Contains('"')) { throw 'Task arguments cannot contain quotes.' }
  }
  $arguments = "-NoProfile -WindowStyle Hidden -File `"$monitor`" -DeviceLabel `"$DeviceLabel`" -Repository `"$Repository`" -StateDirectory `"$StateDirectory`" -ReportDirectory `"$ReportDirectory`""
  # Wrap pwsh in a headless conhost: -WindowStyle Hidden alone still flashes a console every five minutes.
  $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\conhost.exe') -Argument "--headless `"$((Get-Process -Id $PID).Path)`" $arguments"
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $settings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
  Register-ScheduledTask -TaskName 'Leonidas Code update health' -Action $action -Trigger $trigger -Settings $settings -Description 'Local-only release delivery status and timings' -Force | Out-Null
  Write-Host 'Registered local update health monitoring every five minutes.'
}
$app = @('Leonidas Code.exe', 'Leonidas.exe') | ForEach-Object { Join-Path $env:LOCALAPPDATA "Programs/t3code/$_" } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $app) { $app = Join-Path $env:LOCALAPPDATA 'Programs/t3code/Leonidas Code.exe' }
$installedVersion = if (Test-Path -LiteralPath $app) { (Get-Item -LiteralPath $app).VersionInfo.ProductVersion -replace '\+.*$', '' -replace '^(\d+\.\d+\.\d+)\.\d+$', '$1' } else { $null }
$report = [ordered]@{
  device = $DeviceLabel; checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
  installedVersion = $installedVersion; latestVersion = $null; status = 'unknown'
  detectionSeconds = $null; downloadSeconds = $null; restartWaitSeconds = $null; installSeconds = $null
  error = $null
}
try {
  $release = Invoke-RestMethod "https://api.github.com/repos/$Repository/releases/latest" -TimeoutSec 30
  $version = $release.tag_name.Substring(1)
  $report.latestVersion = $version
  $report.status = if ($installedVersion -eq $version) { 'current' }
    elseif ($installedVersion -like '1.0.*' -and $version -like '0.*') { 'one-time migration required' }
    else { 'update pending' }
  $records = @(Get-ChildItem -LiteralPath (Join-Path $StateDirectory 'logs') -Filter 'update-delivery.ndjson*' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-Content -LiteralPath $_.FullName | ForEach-Object {
      try { $_ | ConvertFrom-Json -ErrorAction Stop } catch { } # Rotation can leave an incomplete last line.
    } } | Where-Object { $_.version -eq $version } | Sort-Object at)
  $first = @{}
  foreach ($record in $records) { if (-not $first.ContainsKey($record.status)) {
    # ConvertFrom-Json in newer PowerShell returns DateTime; preserve its timezone.
    $first[$record.status] = if ($record.at -is [DateTime]) { [DateTimeOffset]$record.at } else { [DateTimeOffset]::Parse($record.at) }
  } }
  if ($first.available) { $report.detectionSeconds = [Math]::Max(0, ($first.available - [DateTimeOffset]::Parse($release.published_at)).TotalSeconds) }
  if ($first.available -and $first.downloaded) { $report.downloadSeconds = [Math]::Max(0, ($first.downloaded - $first.available).TotalSeconds) }
  if ($first.downloaded -and $first.installing) { $report.restartWaitSeconds = [Math]::Max(0, ($first.installing - $first.downloaded).TotalSeconds) }
  if ($first.installing -and $first.started -and $first.started -ge $first.installing) { $report.installSeconds = ($first.started - $first.installing).TotalSeconds }
} catch {
  $report.error = $_.Exception.Message
}
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$json = $report | ConvertTo-Json
Set-Content -LiteralPath (Join-Path $ReportDirectory 'latest.json') -Value $json -Encoding utf8
# Keep one observation per changed status/version/error, rather than a five-minute flood.
$history = Join-Path $ReportDirectory 'history.ndjson'
$previous = if (Test-Path -LiteralPath $history) { Get-Content -LiteralPath $history -Tail 1 | ConvertFrom-Json } else { $null }
if (-not $previous -or $previous.installedVersion -ne $report.installedVersion -or
    $previous.latestVersion -ne $report.latestVersion -or $previous.status -ne $report.status -or
    $previous.error -ne $report.error -or $previous.installSeconds -ne $report.installSeconds) {
  Add-Content -LiteralPath $history -Value ($report | ConvertTo-Json -Compress) -Encoding utf8
}
$json
