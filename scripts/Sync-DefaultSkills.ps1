#Requires -Version 7.0
<#
.SYNOPSIS
    Install the portable next-action default and link the core skills in an AIOS and its existing projects.
.DESCRIPTION
    Re-run after updating the AIOS skills. Changed destination files are backed up;
    project instructions and user task data are preserved. New-Project calls this
    for new projects. Use -ProjectPath to install in a standalone project.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepoPath = (Join-Path $PSScriptRoot '..'),
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..'),
    [string]$ProjectPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$source = Join-Path (Resolve-Path -LiteralPath $SourceRoot).Path '.agents/skills/next-action'
if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) { throw "Missing default skill: $source" }
$targets = @($repo)
if ($ProjectPath) { $targets = @((Resolve-Path -LiteralPath $ProjectPath).Path) }
elseif (Test-Path -LiteralPath (Join-Path $repo 'projects')) {
    $targets += @(Get-ChildItem -LiteralPath (Join-Path $repo 'projects') -Directory |
        Where-Object { $_.Name -notmatch '^[._]' -and
            ((Test-Path -LiteralPath (Join-Path $_.FullName 'project.md')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName 'AGENTS.md')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -or
             (Test-Path -LiteralPath (Join-Path $_.FullName 'agent-playbook.md'))) } |
        ForEach-Object { $_.FullName })
}
$updated = 0
function Copy-DefaultSkill([string]$Destination, [string]$Backup) {
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse | Where-Object { $_.Name -notlike '*.pyc' -and $_.FullName -notmatch '__pycache__' }) {
        $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
        $dest = Join-Path $Destination $relative
        if ((Test-Path -LiteralPath $dest) -and ((Get-FileHash -LiteralPath $dest).Hash -eq (Get-FileHash -LiteralPath $file.FullName).Hash)) { continue }
        if ($PSCmdlet.ShouldProcess($dest, 'Install default next-action skill, backing up changes')) {
            if (Test-Path -LiteralPath $dest) {
                $save = Join-Path $Backup $relative
                New-Item -ItemType Directory -Path (Split-Path $save) -Force | Out-Null
                [IO.File]::WriteAllText((Join-Path $target '.aios-backups/.gitignore'), "*`n")
                Copy-Item -LiteralPath $dest -Destination $save
            }
            New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
            Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
            $script:updated++
        }
    }
}
foreach ($target in $targets | Select-Object -Unique) {
    $destination = Join-Path $target '.agents/skills/next-action'
    $backup = Join-Path $target ('.aios-backups/next-action-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
    Copy-DefaultSkill $destination $backup
    $adapter = Join-Path $target '.claude/skills/next-action'
    if ($PSCmdlet.ShouldProcess($adapter, 'Make default skill discoverable to the Claude provider')) {
        if (-not (Test-Path -LiteralPath $adapter)) {
            New-Item -ItemType Directory -Path (Split-Path $adapter) -Force | Out-Null
            $ignore = Join-Path (Split-Path $adapter) ".gitignore"
            if (-not (Test-Path -LiteralPath $ignore)) { [IO.File]::WriteAllText($ignore, "*`n!.gitignore`n") }
            if ($IsWindows) { New-Item -ItemType Junction -Path $adapter -Target $destination | Out-Null }
            else { New-Item -ItemType SymbolicLink -Path $adapter -Target $destination | Out-Null }
        } elseif (-not (Get-Item -LiteralPath $adapter).LinkType -and -not (Get-Item -LiteralPath (Split-Path $adapter)).LinkType) {
            Copy-DefaultSkill $adapter (Join-Path $backup "provider-copy")
        }
    }
}
# Core skills (standards/project-standard.md section 11). Every workspace links these from this AIOS
# canon and never copies them, so one canonical edit reaches every workspace. A workspace's own folder
# with the same name wins. A name the canon lacks is reported, never invented.
$coreSkills = @('session-handoff', 'chat-sync', 'chat-closeout', 'recap', 'daily-briefing', 'daily-closeout', 'find-skills', 'ask-leonidas', 'implement', 'grilling', 'grill-me', 'grill-with-docs', 'domain-modeling', 'diagnosing-bugs', 'to-spec', 'to-tickets', 'wayfinder', 'retro', 'wizard', 'wait-what', 'writing-for-agents', 'pr', 'review-two-axis')
$canonCore = @($coreSkills | Where-Object { Test-Path -LiteralPath (Join-Path $repo ".agents/skills/$_/SKILL.md") })
$absentCore = @($coreSkills | Where-Object { $_ -notin $canonCore })
if ($absentCore) { Write-Warning "Core skills missing from ${repo}: $($absentCore -join ', ')" }
$linked = 0
function New-SkillLink([string]$Link, [string]$Destination) {
    if ($IsWindows) { New-Item -ItemType Junction -Path $Link -Target $Destination | Out-Null }
    else { New-Item -ItemType SymbolicLink -Path $Link -Target $Destination | Out-Null }
}
function Add-LocalExclude([string]$Workspace, [string]$Relative) {
    # Links stay out of git: a local exclude in the nearest repository from the workspace up to the AIOS root.
    $gitRoot = $Workspace
    while (-not (Test-Path -LiteralPath (Join-Path $gitRoot '.git') -PathType Container)) {
        $parent = Split-Path $gitRoot
        if ($gitRoot -eq $repo -or $parent -eq $gitRoot) { return }
        $gitRoot = $parent
    }
    New-Item -ItemType Directory -Path (Join-Path $gitRoot '.git/info') -Force | Out-Null
    $exclude = Join-Path $gitRoot '.git/info/exclude'
    $pattern = '/' + [IO.Path]::GetRelativePath($gitRoot, (Join-Path $Workspace $Relative)).Replace('\', '/') + '/'
    $raw = if (Test-Path -LiteralPath $exclude) { [IO.File]::ReadAllText($exclude) } else { '' }
    if ($raw -split "`r?`n" -notcontains $pattern) { [IO.File]::AppendAllText($exclude, $(if ($raw -and -not $raw.EndsWith("`n")) { "`n" }) + $pattern + "`n") }
}
function Remove-EmptySkillDir([string]$Path) {
    # A leftover empty real folder (for example from a removed or reset worktree) blocks the link and hides the skill; clear it so the link is made.
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item -and $item.PSIsContainer -and -not $item.LinkType -and -not (Get-ChildItem -LiteralPath $Path -Force) -and $PSCmdlet.ShouldProcess($Path, 'Remove empty folder blocking a core skill link')) {
        Remove-Item -LiteralPath $Path -Force
    }
}
# Shared skills: a skill committed in the Leonidas Code clone is the one copy; the AIOS gets a junction to it
# (Share-SkillToLeonidasCode.ps1 moves a skill there). This recreates missing junctions after a pull or on a new machine.
$sharedLinked = 0
$sharedRoot = Join-Path $repo 'projects/leonidas-app/.agents/skills'
if (-not $ProjectPath -and (Test-Path -LiteralPath $sharedRoot)) {
    foreach ($dir in Get-ChildItem -LiteralPath $sharedRoot -Directory | Where-Object { -not $_.LinkType -and (Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md')) }) {
        $aiosLink = Join-Path $repo ".agents/skills/$($dir.Name)"
        $item = Get-Item -LiteralPath $aiosLink -Force -ErrorAction SilentlyContinue
        # A pull that untracked a shared skill leaves only ignored caches behind; clear them so the link is made.
        if ($item -and -not $item.LinkType -and -not (Test-Path -LiteralPath (Join-Path $aiosLink 'SKILL.md')) -and
            -not (Get-ChildItem -LiteralPath $aiosLink -Recurse -File -Force | Where-Object { $_.FullName -notmatch '__pycache__' }) -and
            $PSCmdlet.ShouldProcess($aiosLink, 'Remove cache-only folder blocking a shared skill link')) {
            Remove-Item -LiteralPath $aiosLink -Recurse -Force; $item = $null
        }
        if (-not $item -and $PSCmdlet.ShouldProcess($aiosLink, 'Link shared skill from Leonidas Code')) { New-SkillLink $aiosLink $dir.FullName; $sharedLinked++ }
        # Skills that started in Leonidas Code are not in .agents/skills/.gitignore; keep their links out of AIOS git too.
        if (-not $WhatIfPreference -and (Get-Item -LiteralPath $aiosLink -Force -ErrorAction SilentlyContinue).LinkType) { Add-LocalExclude $repo ".agents/skills/$($dir.Name)" }
        $adapter = Join-Path $repo ".claude/skills/$($dir.Name)"
        $adapterRoot = Get-Item -LiteralPath (Join-Path $repo '.claude/skills') -Force -ErrorAction SilentlyContinue
        if ($adapterRoot -and -not $adapterRoot.LinkType -and -not (Get-Item -LiteralPath $adapter -Force -ErrorAction SilentlyContinue) -and
            (Test-Path -LiteralPath $aiosLink) -and $PSCmdlet.ShouldProcess($adapter, 'Make shared skill discoverable to the Claude provider')) {
            New-SkillLink $adapter $aiosLink; $sharedLinked++
        }
    }
}
foreach ($name in $canonCore) {
    $canon = Join-Path $repo ".agents/skills/$name"
    foreach ($target in $targets | Select-Object -Unique) {
        $link = Join-Path $target ".agents/skills/$name"
        if ($target -ne $repo) {
            Remove-EmptySkillDir $link
            if (-not (Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue) -and $PSCmdlet.ShouldProcess($link, 'Link core skill from the AIOS canon')) {
                New-Item -ItemType Directory -Path (Split-Path $link) -Force | Out-Null
                New-SkillLink $link $canon
                $linked++
            }
            # Exclude links only: a real folder with this name is committed project content, and an exclude would hide its new files.
            if (-not $WhatIfPreference -and (Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue).LinkType) { Add-LocalExclude $target ".agents/skills/$name" }
        }
        # A provider folder that is itself a link already exposes every skill in .agents/skills.
        $adapterRoot = Join-Path $target '.claude/skills'
        $adapterItem = Get-Item -LiteralPath $adapterRoot -Force -ErrorAction SilentlyContinue
        if ($adapterItem -and $adapterItem.LinkType) { continue }
        $adapter = Join-Path $adapterRoot $name
        Remove-EmptySkillDir $adapter
        if (-not (Get-Item -LiteralPath $adapter -Force -ErrorAction SilentlyContinue) -and $PSCmdlet.ShouldProcess($adapter, 'Make core skill discoverable to the Claude provider')) {
            if (-not $adapterItem) {
                New-Item -ItemType Directory -Path $adapterRoot -Force | Out-Null
                [IO.File]::WriteAllText((Join-Path $adapterRoot '.gitignore'), "*`n!.gitignore`n")
            }
            New-SkillLink $adapter $link
            $linked++
        }
        if (-not $WhatIfPreference -and (Get-Item -LiteralPath $adapter -Force -ErrorAction SilentlyContinue).LinkType) { Add-LocalExclude $target ".claude/skills/$name" }
    }
}
if (-not $WhatIfPreference) {
    foreach ($target in $targets | Select-Object -Unique) {
        foreach ($name in $canonCore) {
            $probe = Join-Path $target ".claude/skills/$name/SKILL.md"
            if (-not (Test-Path -LiteralPath $probe)) { throw "Core skill not discoverable to Claude: $probe" }
        }
    }
}Write-Host "[OK] Updated $updated default skill files across $($targets.Count) workspace(s)."
Write-Host "[OK] Core skills: $linked link(s) created across $($targets.Count) workspace(s)."
Write-Host "[OK] Shared skills: $sharedLinked link(s) created from Leonidas Code."
