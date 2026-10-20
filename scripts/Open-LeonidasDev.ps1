<#
.SYNOPSIS
  One click to "Leonidas Code (Dev)": makes sure the always-on dev server is running, then opens
  its window. Run Install-DevShortcut.ps1 once to set up the server task and the shortcut.
.DESCRIPTION
  The window is an app-style Chromium window (Vivaldi, Chrome, Edge or Brave, first found) on the dev server (http://localhost:15733), with its
  own profile so it keeps its sign-in. Problems show in a message box, not a console.
  -Simulate turns on the new-user onboarding simulation (fake accounts) in that window until you press Exit in it.
#>
[CmdletBinding()]
param([ValidateRange(10, 600)][int]$WaitSeconds = 240, [switch]$Simulate)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
# The fast C: copy is the permanent dev home (D: installs take an hour). Sync edits into it first.
$devLive = 'C:/lcw/dev-live'
if (Test-Path -LiteralPath (Join-Path $devLive 'node_modules/.bin/vp.cmd')) {
    & (Join-Path $PSScriptRoot 'Sync-DevLive.ps1') | Out-Null
    $repoRoot = $devLive
}
$devHome = Join-Path $repoRoot '.t3'
$log = Join-Path $devHome 'dev-server.log'
$taskName = 'Leonidas Code Dev Server'
$serverPort = 23773
$webPort = 15733
$origin = "http://localhost:$webPort"

function Show-Problem([string]$Message) {
    Add-Type -AssemblyName PresentationFramework
    [void][System.Windows.MessageBox]::Show($Message, 'Leonidas Code (Dev)', 'OK', 'Error')
}
function Test-Listening([int]$Port) {
    $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

try {
    if (-not ((Test-Listening $serverPort) -and (Test-Listening $webPort))) {
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules/.bin/vp.cmd'))) {
            $installing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
                Where-Object { $_.CommandLine -match 'pnpm' -and $_.CommandLine -match 'install' }
            if ($installing) {
                throw 'First-time setup is still installing in another window. Open this again when it finishes.'
            }
            # First run on this machine: install visibly (it takes a while), then carry on.
            $setup = Start-Process -FilePath (Get-Process -Id $PID).Path -Wait -PassThru -WorkingDirectory $repoRoot -ArgumentList @(
                '-NoProfile', '-Command',
                'Write-Host "Leonidas Code (Dev): first-time setup, this can take 10 to 20 minutes. Leave this window open."; $env:CI = "true"; npx --yes pnpm@11.10.0 install --frozen-lockfile; exit $LASTEXITCODE')
            if ($setup.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules/.bin/vp.cmd'))) {
                throw "First-time setup failed. In $repoRoot run: npx pnpm@11.10.0 install --frozen-lockfile"
            }
        }
        if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
            throw "The dev server task is not set up. Run scripts\Install-DevShortcut.ps1 once."
        }
        Enable-ScheduledTask -TaskName $taskName | Out-Null
        Start-ScheduledTask -TaskName $taskName
        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        while ((Get-Date) -lt $deadline -and -not ((Test-Listening $serverPort) -and (Test-Listening $webPort))) {
            Start-Sleep -Seconds 2
        }
        if (-not ((Test-Listening $serverPort) -and (Test-Listening $webPort))) {
            throw "The dev server did not come up within $WaitSeconds seconds. See $log"
        }
    }

    # Sign in automatically: the fixed T3CODE_DEV_AUTH_TOKEN in .env is the same value the server seeds
    # at every start, so the pairing link never changes. Re-opening it just refreshes the cookie.
    $profile = Join-Path $devHome 'dev-window-profile'
    $url = $origin
    $simQuery = if ($Simulate) { '?sim=onboarding' } else { '' }
    $envFile = Join-Path $repoRoot '.env'
    if (Test-Path -LiteralPath $envFile) {
        $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*T3CODE_DEV_AUTH_TOKEN\s*=\s*(\S+)' } | Select-Object -Last 1
        if ($line -match '=\s*"?([^"\s]+)"?') { $url = "$origin/pair$simQuery#token=$($Matches[1])" }
    }
    if ($Simulate -and $url -eq $origin) { $url = "$origin/?sim=onboarding" }
    # Any Chromium browser can host the app-style window: use the first one installed.
    $browser = $null
    foreach ($exe in 'vivaldi.exe', 'chrome.exe', 'msedge.exe', 'brave.exe') {
        $key = Get-ItemProperty -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\$exe", "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\$exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        $path = if ($key) { $key.'(default)' } else { (Get-Command $exe -ErrorAction SilentlyContinue).Source }
        if (-not $path) {
            $path = @("$env:LOCALAPPDATA\Vivaldi\Application\vivaldi.exe", "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { $_ -match [regex]::Escape($exe.Split('.')[0]) -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
        }
        if ($path -and (Test-Path -LiteralPath $path)) { $browser = $path; break }
    }
    if (-not $browser) { throw 'No Chromium browser (Vivaldi, Chrome, Edge or Brave) was found.' }
    Start-Process -FilePath $browser -ArgumentList @("--app=$url", "--user-data-dir=$profile", '--no-first-run')
    # Join the pinned shortcut's taskbar button and show the green icon (the browser files the window
    # under itself with the page favicon otherwise). Best effort: a failure must not block the window.
    try { & (Join-Path $PSScriptRoot 'Set-DevWindowIdentity.ps1') -WaitSeconds 20 | Out-Null } catch { }
} catch {
    Show-Problem $_.Exception.Message
    exit 1
}
