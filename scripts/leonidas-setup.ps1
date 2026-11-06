<#
.SYNOPSIS
  One-shot setup for a Leonidas Code builder machine (any teammate). Safe to re-run.
.DESCRIPTION
  1. Git: fast-forward-only pulls preserve local history and unfinished work; disables a copied
     AIOS pre-commit hook that does not exist in this repo.
  2. Identity (optional): writes CLAUDE.local.md importing your own AIOS and keeps it out of git.
  3. App: installs the latest Leonidas Code release from GitHub (upgrades an old T3 Code install
     in place, same app id) and removes every leftover T3 Code shortcut.
  The repo's .claude/settings.json pulls main at every Claude session start, and the installed
  app's updater shows a toast for every new release, so after this nothing needs managing.
.EXAMPLE
  pwsh -File scripts/leonidas-setup.ps1 -AiosClaudeMd "D:/My AIOS/CLAUDE.md"
#>
[CmdletBinding()]
param(
  [string]$AiosClaudeMd,
  [switch]$SkipApp,
  [string]$Repository = "ItzJsimp/leonidas-app"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

# 1. Git
git -C $repo config pull.rebase false
git -C $repo config pull.ff only
git -C $repo config fetch.prune true
# .claude/skills is a symlink to .agents/skills; with core.symlinks off, Windows checks it out as a
# text file and Claude finds no project skills. Needs Developer Mode.
git -C $repo config core.symlinks true
if (-not (Get-Item -LiteralPath (Join-Path $repo ".claude/skills")).LinkType) {
  Remove-Item -LiteralPath (Join-Path $repo ".claude/skills") -Force
  git -C $repo checkout -- .claude/skills
}
$hook = Join-Path $repo ".git/hooks/pre-commit"
if ((Test-Path -LiteralPath $hook) -and (Select-String -LiteralPath $hook -Pattern "AIOS|Leonidas AIOS" -Quiet)) {
  Move-Item -LiteralPath $hook -Destination "$hook.aios-disabled" -Force
  Write-Host "Disabled copied AIOS pre-commit hook."
}
& (Join-Path $PSScriptRoot 'Sync-LeonidasSource.ps1')
Write-Host "Git: fast-forward-only pulls configured."

# 2. Identity
if ($AiosClaudeMd) {
  $import = "@" + ($AiosClaudeMd -replace "\\", "/" -replace " ", "\ ")
  Set-Content -LiteralPath (Join-Path $repo "CLAUDE.local.md") -Value $import -Encoding utf8
  $exclude = Join-Path $repo ".git/info/exclude"
  if (-not (Select-String -LiteralPath $exclude -Pattern "^CLAUDE.local.md$" -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -LiteralPath $exclude -Value "CLAUDE.local.md"
  }
  Write-Host "Identity: CLAUDE.local.md -> $import. Run 'claude' once in this folder and approve the import dialog."
}

# Shared default skills belong in the owner's AIOS as well as the Code project.
$skillAiosRoot = if ($AiosClaudeMd) { Split-Path -Parent (Resolve-Path -LiteralPath $AiosClaudeMd).Path } else { $null }
& (Join-Path $PSScriptRoot 'Install-NextAction.ps1') -AiosRoot $skillAiosRoot

# Always-on dev copy: server task plus a green "Leonidas Code (Dev)" Desktop shortcut.
# Runs before -SkipApp so every builder gets it, even on a machine that skips the app install.
try {
  & (Join-Path $PSScriptRoot 'Install-DevShortcut.ps1')
  Write-Host 'Right-click "Leonidas Code (Dev)" on the Desktop > Show more options > Pin to taskbar. Its first click installs dependencies (10 to 20 minutes, once).'
} catch { Write-Warning "Dev shortcut setup skipped: $($_.Exception.Message)" }

if ($SkipApp) { return }

# 3. App
& (Join-Path $PSScriptRoot 'leonidas-update.ps1') -Repository $Repository

# Same app identity: an old uninstall entry can point to the app we just installed.
# Remove obsolete shortcuts only.
$shortcutDirs = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("Programs"),
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar",
  "$env:PUBLIC\Desktop"
)
Get-ChildItem -LiteralPath $shortcutDirs -Filter "T3 Code*.lnk" -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Write-Host "Removed $($_.FullName)" }

$exePath = Join-Path $env:LOCALAPPDATA "Programs\t3code\Leonidas Code.exe"
if (-not (Test-Path -LiteralPath $exePath)) { throw "Expected $exePath after install." }
Start-Process -FilePath $exePath
Write-Host "Launched Leonidas Code. Right-click its taskbar icon > Pin to taskbar (Windows blocks scripted pins)."
