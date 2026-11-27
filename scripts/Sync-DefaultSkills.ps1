#Requires -Version 7.0
<#
.SYNOPSIS
    Install the portable next-action default and link AIOS workspace extras in an AIOS and its existing projects.
.DESCRIPTION
    Re-run after updating the AIOS skills. Changed destination files are backed up;
    project instructions and user task data are preserved. New-Project calls this
    for new projects. Use -ProjectPath to install in a standalone project.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RepoPath = (Join-Path $PSScriptRoot '..'),
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..'),
    [string]$ProjectPath,
    [switch]$SkillsOnly,  # link skills only and leave the project's own next-action copy alone (used for a new worktree)
    [switch]$Check        # read-only drift check for session-start hooks
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$source = Join-Path (Resolve-Path -LiteralPath $SourceRoot).Path '.agents/skills/next-action'
if (-not $SkillsOnly -and -not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) {
    if ($Check) { exit 0 }   # a checkout without the canon (for example a worktree) has nothing to compare against
    throw "Missing default skill: $source"
}
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
$drift = @()
function Copy-DefaultSkill([string]$Destination, [string]$Backup) {
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse | Where-Object { $_.Name -notlike '*.pyc' -and $_.FullName -notmatch '__pycache__' }) {
        $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
        $dest = Join-Path $Destination $relative
        # Line endings are ignored: git's autocrlf rewrites them on checkout and is not drift.
        if ((Test-Path -LiteralPath $dest) -and ([IO.File]::ReadAllText($dest).Replace("`r`n", "`n") -ceq [IO.File]::ReadAllText($file.FullName).Replace("`r`n", "`n"))) { continue }
        if ($Check) { $script:drift += $dest; continue }
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
    if ($SkillsOnly) { continue }
    $destination = Join-Path $target '.agents/skills/next-action'
    $backup = Join-Path $target ('.aios-backups/next-action-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
    Copy-DefaultSkill $destination $backup
    $adapter = Join-Path $target '.claude/skills/next-action'
    if ($Check) {
        if ((Test-Path -LiteralPath $adapter) -and -not (Get-Item -LiteralPath $adapter).LinkType -and -not (Get-Item -LiteralPath (Split-Path $adapter)).LinkType) {
            Copy-DefaultSkill $adapter (Join-Path $backup "provider-copy")
        }
        continue
    }
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
if ($Check) {
    if ($drift) { Write-Warning "Default skill drift ($($drift.Count) file(s)): $($drift -join ', '). Run scripts/Sync-DefaultSkills.ps1 to update." }
    else { Write-Host "[OK] Default skill in sync across $($targets.Count) workspace(s)." }
    exit 0
}
# Core skills ship inside Leonidas (ADR-0102) and are never copied or linked into projects.
# Only non-core AIOS workspace extras link from this AIOS canon into workspaces; a workspace's own folder
# with the same name wins. A name the canon lacks is skipped silently.
$aiosWorkspaceSkills = @('chat-sync', 'daily-briefing')
$appCoreSkills = @()
foreach ($manifestPath in @(
    (Join-Path (Resolve-Path -LiteralPath $SourceRoot).Path '.agents/library.json'),
    (Join-Path $repo 'projects/leonidas-app/.agents/library.json')
)) {
    if (Test-Path -LiteralPath $manifestPath) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $appCoreSkills = @($manifest.items | Where-Object { $_.kind -eq 'skill' -and $_.pack -eq 'core' } | ForEach-Object { $_.name } | Select-Object -Unique)
        break
    }
}
$canonWorkspace = @($aiosWorkspaceSkills | Where-Object { $_ -notin $appCoreSkills -and (Test-Path -LiteralPath (Join-Path $repo ".agents/skills/$_/SKILL.md")) })
# Project skills: AIOS-only skills one project needs. <AIOS>/.agents/project-skills.json maps a project folder name
# to skill names, for example {"my-app": ["doop"]}. A linked worktree uses the name of the checkout that owns its
# git folder. Core skills are always excluded even if listed there. Without the file or an entry, ADR-0038 discovery
# shows a project only the skills it commits itself. A name the canon lacks is skipped.
$projectSkills = @{}
$projectSkillsFile = Join-Path $repo '.agents/project-skills.json'
if (Test-Path -LiteralPath $projectSkillsFile) { $projectSkills = Get-Content -LiteralPath $projectSkillsFile -Raw | ConvertFrom-Json -AsHashtable }
$canonAll = @($canonWorkspace) + @($projectSkills.Values | ForEach-Object { $_ } | Select-Object -Unique |
    Where-Object { $_ -notin $canonWorkspace -and $_ -notin $appCoreSkills -and (Test-Path -LiteralPath (Join-Path $repo ".agents/skills/$_/SKILL.md")) })
function Get-ProjectKey([string]$Target) {
    # A linked worktree has a .git file; its project is the checkout that owns the git folder.
    if (Test-Path -LiteralPath (Join-Path $Target '.git') -PathType Leaf) {
        $common = "$(git -C $Target rev-parse --path-format=absolute --git-common-dir 2>$null)".Trim()
        if ($LASTEXITCODE -eq 0 -and $common -and (Split-Path $common -Leaf) -eq '.git') { return Split-Path (Split-Path $common) -Leaf }
    }
    Split-Path $Target -Leaf
}
function Test-SkillFor([string]$Name, [string]$Target) {
    if ($Name -in $appCoreSkills) { return $false }
    $Name -in $aiosWorkspaceSkills -or $Name -in $projectSkills[(Get-ProjectKey $Target)]
}
$linked = 0
function New-SkillLink([string]$Link, [string]$Destination) {
    if ($IsWindows) { New-Item -ItemType Junction -Path $Link -Target $Destination | Out-Null }
    else { New-Item -ItemType SymbolicLink -Path $Link -Target $Destination | Out-Null }
}
function Test-LinkedWorktree([string]$Target) {
    Test-Path -LiteralPath (Join-Path $Target '.git') -PathType Leaf
}
function Copy-SkillDir([string]$SourceDir, [string]$DestDir) {
    foreach ($file in Get-ChildItem -LiteralPath $SourceDir -File -Recurse | Where-Object { $_.Name -notlike '*.pyc' -and $_.FullName -notmatch '__pycache__' }) {
        $dest = Join-Path $DestDir ([IO.Path]::GetRelativePath($SourceDir, $file.FullName))
        New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    }
}
function Add-LocalExclude([string]$Workspace, [string]$Relative) {
    # Links stay out of git: a local exclude in the nearest repository from the workspace up to the AIOS root.
    # A linked worktree has a .git file, so ask git where its exclude file is. Split-Path returns '' above a drive root.
    $gitRoot = $Workspace
    while (-not (Test-Path -LiteralPath (Join-Path $gitRoot '.git'))) {
        $parent = Split-Path $gitRoot
        if ($gitRoot -eq $repo -or -not $parent -or $parent -eq $gitRoot) { return }
        $gitRoot = $parent
    }
    $exclude = if (Test-Path -LiteralPath (Join-Path $gitRoot '.git') -PathType Container) { Join-Path $gitRoot '.git/info/exclude' }
               else { "$(git -C $gitRoot rev-parse --path-format=absolute --git-path info/exclude)".Trim() }
    New-Item -ItemType Directory -Path (Split-Path $exclude) -Force | Out-Null
    $pattern = '/' + [IO.Path]::GetRelativePath($gitRoot, (Join-Path $Workspace $Relative)).Replace('\', '/') + '/'
    $raw = if (Test-Path -LiteralPath $exclude) { [IO.File]::ReadAllText($exclude) } else { '' }
    if ($raw -split "`r?`n" -notcontains $pattern) { [IO.File]::AppendAllText($exclude, $(if ($raw -and -not $raw.EndsWith("`n")) { "`n" }) + $pattern + "`n") }
}
function Remove-EmptySkillDir([string]$Path) {
    # A leftover empty real folder (for example from a removed or reset worktree) blocks the link and hides the skill; clear it so the link is made.
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item -and $item.PSIsContainer -and -not $item.LinkType -and -not (Get-ChildItem -LiteralPath $Path -Force) -and $PSCmdlet.ShouldProcess($Path, 'Remove empty folder blocking a workspace skill link')) {
        Remove-Item -LiteralPath $Path -Force
    }
}
# Shared skills: a skill committed in the Leonidas Code clone is the one copy; the AIOS gets a junction to it
# (Share-SkillToLeonidasCode.ps1 moves a skill there). This recreates missing junctions after a pull or on a new machine.
$sharedLinked = 0
$sharedRoot = Join-Path $repo 'projects/leonidas-app/.agents/skills'
if (-not $ProjectPath -and (Test-Path -LiteralPath $sharedRoot)) {
    # Archived or merged skills (ADR-0102) must not come back through the app's stale copies.
    # shortcut: plan and review are app-only names merged into to-tickets and review-two-axis; drop them after the app slice deletes those folders.
    $notShared = @('plan', 'review') + @((Get-ChildItem -LiteralPath (Join-Path $repo '.agents/skills/_archive') -Directory -ErrorAction SilentlyContinue | Get-ChildItem -Directory).Name)
    foreach ($dir in Get-ChildItem -LiteralPath $sharedRoot -Directory | Where-Object { -not $_.LinkType -and $_.Name -notin $notShared -and (Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md')) }) {
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
foreach ($name in $canonAll) {
    $canon = Join-Path $repo ".agents/skills/$name"
    foreach ($target in $targets | Select-Object -Unique) {
        if (-not (Test-SkillFor $name $target)) { continue }
        $link = Join-Path $target ".agents/skills/$name"
        # Disposable linked worktrees copy AIOS skills instead of creating NTFS junctions: git worktree remove
        # descends into junctions on Windows and empties the AIOS canon folder.
        $isWorktree = ($target -ne $repo) -and (Test-LinkedWorktree $target)
        if ($target -ne $repo) {
            Remove-EmptySkillDir $link
            $existing = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
            if ($isWorktree) {
                if ($existing -and $existing.LinkType -and $PSCmdlet.ShouldProcess($link, 'Replace outbound skill junction in worktree with a local copy')) {
                    [System.IO.Directory]::Delete($link, $false)
                    $existing = $null
                }
                if (-not $existing -and $PSCmdlet.ShouldProcess($link, 'Copy AIOS skill into linked worktree')) {
                    Copy-SkillDir $canon $link
                    $linked++
                    if (-not $WhatIfPreference) { Add-LocalExclude $target ".agents/skills/$name" }
                }
            } else {
                if (-not $existing -and $PSCmdlet.ShouldProcess($link, 'Link AIOS workspace skill from the AIOS canon')) {
                    New-Item -ItemType Directory -Path (Split-Path $link) -Force | Out-Null
                    New-SkillLink $link $canon
                    $linked++
                }
                # Exclude links only: a real folder with this name is committed project content, and an exclude would hide its new files.
                if (-not $WhatIfPreference -and (Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue).LinkType) { Add-LocalExclude $target ".agents/skills/$name" }
            }
        }
        # A provider folder that is itself a link already exposes every skill in .agents/skills.
        $adapterRoot = Join-Path $target '.claude/skills'
        $adapterItem = Get-Item -LiteralPath $adapterRoot -Force -ErrorAction SilentlyContinue
        if ($adapterItem -and $adapterItem.LinkType) { continue }
        $adapter = Join-Path $adapterRoot $name
        Remove-EmptySkillDir $adapter
        $existingAdapter = Get-Item -LiteralPath $adapter -Force -ErrorAction SilentlyContinue
        if ($isWorktree) {
            if ($existingAdapter -and $existingAdapter.LinkType -and $PSCmdlet.ShouldProcess($adapter, 'Replace outbound Claude skill junction in worktree with a local copy')) {
                [System.IO.Directory]::Delete($adapter, $false)
                $existingAdapter = $null
            }
            if (-not $existingAdapter -and $PSCmdlet.ShouldProcess($adapter, 'Copy skill for Claude discovery in linked worktree')) {
                if (-not $adapterItem) { New-Item -ItemType Directory -Path $adapterRoot -Force | Out-Null }
                Copy-SkillDir $link $adapter
                $linked++
                if (-not $WhatIfPreference) { Add-LocalExclude $target ".claude/skills/$name" }
            }
        } else {
            if (-not $existingAdapter -and $PSCmdlet.ShouldProcess($adapter, 'Make AIOS workspace skill discoverable to the Claude provider')) {
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
}
if (-not $WhatIfPreference) {
    foreach ($target in $targets | Select-Object -Unique) {
        foreach ($name in $canonAll | Where-Object { Test-SkillFor $_ $target }) {
            $probe =Join-Path $target ".claude/skills/$name/SKILL.md"
            if (-not (Test-Path -LiteralPath $probe)) { throw "Workspace skill not discoverable to Claude: $probe" }
        }
    }
}
Write-Host "[OK] Updated $updated default skill files across $($targets.Count) workspace(s)."
Write-Host "[OK] Workspace skills: $linked link(s) created across $($targets.Count) workspace(s)."
Write-Host "[OK] Shared skills: $sharedLinked link(s) created from Leonidas Code."
