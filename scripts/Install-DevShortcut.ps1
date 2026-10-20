<#
.SYNOPSIS
  One-time setup for "Leonidas Code (Dev)": an always-on dev server that starts at sign-in, and
  a Desktop shortcut that opens its window. Right-click the shortcut and choose "Pin to taskbar"
  once; Windows does not allow scripts to pin for you.

.DESCRIPTION
  - Writes a reusable dev sign-in token to the git-ignored .env (kept if already present).
  - Registers the "Leonidas Code Dev Server" scheduled task (current user, no admin).
  - Creates the shortcut. The dev copy serves this folder directly, so saved edits (yours or an
    agent's) reload in its window. Re-run after moving the repo or to change the icon.
#>
[CmdletBinding()]
param(
    [string]$Directory = [Environment]::GetFolderPath('Desktop'),
    # Defaults to the green dev icon so the dev copy is easy to tell from the real app.
    [string]$IconPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$taskName = 'Leonidas Code Dev Server'
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source

$envFile = Join-Path $repoRoot '.env'
if (-not ((Test-Path -LiteralPath $envFile) -and (Select-String -LiteralPath $envFile -Pattern '^T3CODE_DEV_AUTH_TOKEN=' -Quiet))) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    Add-Content -LiteralPath $envFile -Value "T3CODE_DEV_AUTH_TOKEN=$([Convert]::ToHexString($bytes).ToLower())"
}

$runRoot = if (Test-Path -LiteralPath 'C:/lcw/dev-live/node_modules/.bin/vp.cmd') { 'C:/lcw/dev-live' } else { $repoRoot }
$serverAction = New-ScheduledTaskAction -Execute $pwsh -WorkingDirectory $runRoot `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $runRoot 'scripts/Run-LeonidasDevServer.ps1')`""
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -Priority 4  # Windows gives tasks priority 7 (below normal) by default; that starved Vite and its optimizer
Register-ScheduledTask -TaskName $taskName -Force -Settings $settings -Action $serverAction `
    -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) `
    -Principal (New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited) | Out-Null

if (-not $IconPath) { $IconPath = Join-Path $repoRoot 'assets/dev/leonidas-dev-green.ico' }
$shell = New-Object -ComObject WScript.Shell
$path = Join-Path $Directory 'Leonidas Code (Dev).lnk'
$link = $shell.CreateShortcut($path)
# wscript runs the launcher with no console window; powershell -WindowStyle Hidden still flashes one.
$link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$link.Arguments = "`"$(Join-Path $PSScriptRoot 'Open-LeonidasDev.vbs')`""
$link.WorkingDirectory = $repoRoot
$link.WindowStyle = 7
$link.IconLocation = $IconPath
$link.Description = 'Opens the always-on Leonidas Code dev copy (never touches the installed app).'
$link.Save()
# Same taskbar identity the dev window gets, so the window joins this shortcut's pinned button.
& (Join-Path $PSScriptRoot 'Set-DevWindowIdentity.ps1') -ShortcutPath $path | Out-Null
Write-Host "Server task registered: $taskName"
Write-Host "Shortcut: $path"
