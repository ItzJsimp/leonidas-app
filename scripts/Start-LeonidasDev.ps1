<#
.SYNOPSIS
  Opens "Leonidas (Dev)" beside the real app: a separate copy of this checkout with its
  own profile and ports, so it never touches the installed app.

.DESCRIPTION
  Works from any folder. Run it with no arguments to start, `-Status` to see whether it is up,
  and `-Stop` to close the dev copy this script started. The dev copy lives under `.t3`
  (git-ignored). The ports are whatever the running server records in
  `.t3/userdata/server-runtime.json`; nothing here hardcodes them.
#>
[CmdletBinding()]
param(
    [ValidateSet('desktop', 'web')]
    [string]$Mode = 'desktop',
    [switch]$Stop,
    [switch]$Status,
    [switch]$Restart,
    [ValidateRange(10, 600)]
    [int]$WaitSeconds = 150
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$devHome = Join-Path $repoRoot '.t3'
$pidFile = Join-Path $devHome 'dev-launcher.pid'
$logFile = Join-Path $devHome 'dev-launcher.log'
. (Join-Path $PSScriptRoot 'lib/DevRuntime.ps1')

function Get-LauncherPid {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $value = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if ($value -notmatch '^\d+$') { return $null }
    # Only trust the recorded pid while it is still our launcher process.
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$value" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -match 'dev-isolated\.ps1') { return [int]$value }
    return $null
}

function Show-LogTail {
    if (Test-Path -LiteralPath $logFile) {
        Write-Host '--- last lines of the dev log ---' -ForegroundColor Yellow
        Get-Content -LiteralPath $logFile -Tail 25 | ForEach-Object { Write-Host ($_ -replace '\x1b\[[0-9;]*m', '') }
        Write-Host "Full log: $logFile" -ForegroundColor Yellow
    }
}

if ($Stop -or $Restart) {
    $launcherPid = Get-LauncherPid
    if ($null -eq $launcherPid) {
        if ($null -ne (Get-DevRuntime $devHome)) {
            Write-Host 'A dev copy is running that this script did not start, so it will not close it.'
            Write-Host 'Close its "Leonidas (Dev)" window with the X button, then run this again.'
            return
        }
        Write-Host 'No dev copy is running.'
        if ($Stop) { return }
    } else {
        # The pid was recorded when we started it, so this only ends our own dev tree.
        taskkill /pid $launcherPid /T /F | Out-Null
        Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
        Write-Host 'Dev copy stopped. Your real Leonidas was not touched.' -ForegroundColor Green
        if ($Stop) { return }
        for ($i = 0; $i -lt 20 -and $null -ne (Get-DevRuntime $devHome); $i++) { Start-Sleep -Milliseconds 500 }
    }
}

$runtime = Get-DevRuntime $devHome
$running = Test-DevHealthy $runtime
if ($Status) {
    if ($running) { Write-Host "Dev copy is running (server $($runtime.ServerPort), web $($runtime.WebPort))." -ForegroundColor Green }
    else { Write-Host 'Dev copy is not running.' }
    return
}

if ($running) {
    Write-Host "A dev copy is already running (server $($runtime.ServerPort), web $($runtime.WebPort))." -ForegroundColor Green
    Write-Host 'Look for the window titled "Leonidas (Dev)" (check the taskbar if it is behind other windows).'
    Write-Host 'To close it: run this script again with -Stop, or close that window.'
    return
}

# Preflight: say exactly what is missing instead of failing deep inside the dev runner.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed or not on PATH. Install Node.js, then run this again.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules/.bin/vp.cmd'))) {
    throw "Dependencies are not installed. In $repoRoot run: npx pnpm@11.10.0 install --frozen-lockfile"
}

New-Item -ItemType Directory -Force -Path $devHome | Out-Null
# A second call while a launcher is still starting joins it; two launchers would race on one .t3.
$launcherPid = Get-LauncherPid
if ($null -ne $launcherPid) {
    $launch = Get-Process -Id $launcherPid
    Write-Host 'A start is already in progress; waiting for it...' -ForegroundColor Cyan
} else {
    $host_exe = (Get-Process -Id $PID).Path
    $launch = Start-Process -FilePath $host_exe -WindowStyle Hidden -PassThru `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repoRoot 'scripts/dev-isolated.ps1'), '-Mode', $Mode) `
        -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
    Set-Content -LiteralPath $pidFile -Value $launch.Id
    Write-Host "Starting Leonidas (Dev) in the background (this takes about a minute)..." -ForegroundColor Cyan
}
# Only a descriptor written after this launcher began counts; an older one is stale state.
$launchedAt = $launch.StartTime.ToUniversalTime()

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if ($launch.HasExited) {
        Write-Host "The dev copy stopped with code $($launch.ExitCode)." -ForegroundColor Red
        if (Test-Path -LiteralPath "$logFile.err") { Get-Content -LiteralPath "$logFile.err" -Tail 25 | ForEach-Object { Write-Host $_ } }
        Show-LogTail
        Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
        exit 1
    }
    $runtime = Get-DevRuntime $devHome
    if ((Test-DevHealthy $runtime) -and $runtime.StartedAt -ge $launchedAt) {
        Write-Host "Ready (server $($runtime.ServerPort), web $($runtime.WebPort)). Look for the window titled `"Leonidas (Dev)`"." -ForegroundColor Green
        Write-Host 'It is a separate copy: your real Leonidas keeps running. Close it any time with: scripts\Start-LeonidasDev.ps1 -Stop'
        return
    }
}

Write-Host "Not ready after $WaitSeconds seconds." -ForegroundColor Red
Show-LogTail
exit 1
