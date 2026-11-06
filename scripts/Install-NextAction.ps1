#Requires -Version 7.0
<#
.SYNOPSIS
    Install and verify next-action and the core skills in the owner's AIOS and its existing projects.
.DESCRIPTION
    Uses the skill shipped with Leonidas. Backs up changed skill files and
    preserves user tasks and instructions. In the usual projects/leonidas-app
    layout, detects the parent AIOS; otherwise installs in this code project.
    Prints a verification result from this machine, never a remote-install claim.
#>
[CmdletBinding(SupportsShouldProcess)]
param([string]$AiosRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $AiosRoot) {
    # A clone at a drive root has no grandparent; Split-Path returns ''.
    $parent = Split-Path (Split-Path $source)
    $AiosRoot = if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'AGENTS.md')) -and
        (Test-Path -LiteralPath (Join-Path $parent 'tasks')) -and
        (Test-Path -LiteralPath (Join-Path $parent 'projects'))) { $parent } else { $source }
}
$target = (Resolve-Path -LiteralPath $AiosRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $target 'AGENTS.md'))) { throw "No AIOS or project instructions at $target" }
& (Join-Path $PSScriptRoot 'Sync-DefaultSkills.ps1') -RepoPath $target -SourceRoot $source -WhatIf:$WhatIfPreference
if ($WhatIfPreference) { return }
& node (Join-Path $source 'scripts/sync-output-standard.ts') --aios-root $target
if ($LASTEXITCODE -ne 0) { throw 'Output standard sync failed' }
& node (Join-Path $source 'scripts/sync-output-standard.ts') --aios-root $target --check
if ($LASTEXITCODE -ne 0) { throw 'Output standard drift check failed' }

# Leave a reusable updater in the AIOS, without replacing a customized project creator.
$updaterSource = Join-Path $PSScriptRoot 'Sync-DefaultSkills.ps1'
$updaterTarget = Join-Path $target 'scripts/Sync-DefaultSkills.ps1'
if ([IO.Path]::GetFullPath($updaterSource) -ne [IO.Path]::GetFullPath($updaterTarget)) {
    if (-not (Test-Path -LiteralPath $updaterTarget) -or
        (Get-FileHash -LiteralPath $updaterSource).Hash -ne (Get-FileHash -LiteralPath $updaterTarget).Hash) {
        if (Test-Path -LiteralPath $updaterTarget) {
            $backup = Join-Path $target ('.aios-backups/next-action-updater-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
            New-Item -ItemType Directory -Path $backup -Force | Out-Null
            [IO.File]::WriteAllText((Join-Path $target '.aios-backups/.gitignore'), "*`n")
            Copy-Item -LiteralPath $updaterTarget -Destination $backup
        }
        New-Item -ItemType Directory -Path (Split-Path $updaterTarget) -Force | Out-Null
        Copy-Item -LiteralPath $updaterSource -Destination $updaterTarget -Force
    }
}

$workspaces = @($target)
if (Test-Path -LiteralPath (Join-Path $target 'projects')) {
    $workspaces += @(Get-ChildItem -LiteralPath (Join-Path $target 'projects') -Directory |
        Where-Object { $_.Name -notmatch '^[._]' -and
            ((Test-Path -LiteralPath (Join-Path $_.FullName 'project.md')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName 'AGENTS.md')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName 'agent-playbook.md'))) } |
        ForEach-Object { $_.FullName })
}
$skillRelative = '.agents/skills/next-action'
$files = @(Get-ChildItem -LiteralPath (Join-Path $source $skillRelative) -Recurse -File |
    Where-Object { $_.Name -notlike '*.pyc' -and $_.FullName -notmatch '__pycache__' })
foreach ($workspace in $workspaces) {
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath((Join-Path $source $skillRelative), $file.FullName)
        $installed = Join-Path (Join-Path $workspace $skillRelative) $relative
        if (-not (Test-Path -LiteralPath $installed) -or
            (Get-FileHash -LiteralPath $installed).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
            throw "Default skill verification failed: $installed"
        }
        $providerCopy = Join-Path (Join-Path $workspace '.claude/skills/next-action') $relative
        if (-not (Test-Path -LiteralPath $providerCopy) -or
            (Get-FileHash -LiteralPath $providerCopy).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
            throw "Claude skill discovery verification failed: $providerCopy"
        }
    }
}

$python = Get-Command python -ErrorAction SilentlyContinue
$taskCache = 'not checked: Python unavailable; skill includes a filesystem fallback'
if ($python -and (Test-Path -LiteralPath (Join-Path $target 'tasks'))) {
    $resolver = Join-Path $target "$skillRelative/scripts/resolve_tasks.py"
    $first = (& $python.Source $resolver --workspace $target | Out-String) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $first.status -ne 'found') { throw 'Task-store discovery verification failed' }
    $second = (& $python.Source $resolver --workspace $target | Out-String) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $second.source -ne 'cache' -or $second.cache_error) { throw 'Task-store cache verification failed' }
    $taskCache = 'passed: discovered folder, then reused saved location'
}
Write-Host "[PASS] Next action installed and discoverable in $($workspaces.Count) workspace(s) on $env:COMPUTERNAME."
Write-Host "Task store: $taskCache"
Write-Host 'Open a fresh Leonidas conversation and say: next action, skip.'
