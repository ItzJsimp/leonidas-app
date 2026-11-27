#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mob-next-action-' + [guid]::NewGuid().ToString('N'))
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$project = Join-Path $fixture 'projects/leonidas-code'
$other = Join-Path $fixture 'projects/game'
foreach ($folder in @($project, $other, (Join-Path $fixture 'tasks'), (Join-Path $fixture '.claude/skills/next-action'))) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
Set-Content -LiteralPath (Join-Path $fixture 'AGENTS.md') 'Mob custom instructions'
Set-Content -LiteralPath (Join-Path $project 'AGENTS.md') 'Code project instructions'
Set-Content -LiteralPath (Join-Path $other 'project.md') 'Game project ledger'
Set-Content -LiteralPath (Join-Path $fixture 'tasks/keep.md') 'Mob private task data'
Set-Content -LiteralPath (Join-Path $fixture '.claude/skills/next-action/SKILL.md') 'Old real provider skill copy'
$install = Join-Path $PSScriptRoot 'Install-NextAction.ps1'
& $install -AiosRoot $fixture -WhatIf
Assert (-not (Test-Path -LiteralPath (Join-Path $fixture '.agents/skills/next-action'))) 'WhatIf wrote a canonical skill'
& $install -AiosRoot $fixture
$skill = Join-Path $fixture '.agents/skills/next-action/SKILL.md'
$first = (Get-Item -LiteralPath $skill).LastWriteTimeUtc
& $install -AiosRoot $fixture
Assert ((Get-Item -LiteralPath $skill).LastWriteTimeUtc -eq $first) 'Second install rewrote an unchanged skill'
Assert ((Get-Content -LiteralPath (Join-Path $fixture 'AGENTS.md') -Raw).Trim() -eq 'Mob custom instructions') 'Personal instructions changed'
Assert ((Get-Content -LiteralPath (Join-Path $fixture 'tasks/keep.md') -Raw).Trim() -eq 'Mob private task data') 'Task data changed'
Assert ((Get-FileHash -LiteralPath $skill).Hash -eq (Get-FileHash -LiteralPath (Join-Path $fixture '.claude/skills/next-action/SKILL.md')).Hash) 'Existing provider copy stayed stale'
$backups = @(Get-ChildItem -LiteralPath (Join-Path $fixture '.aios-backups') -Filter SKILL.md -File -Recurse)
Assert ($backups.Count -eq 1) 'Old provider copy was not backed up exactly once'
Assert ((Get-Content -LiteralPath $backups[0].FullName -Raw).Trim() -eq 'Old real provider skill copy') 'Provider backup lost old content'
Assert (Test-Path -LiteralPath (Join-Path $fixture 'scripts/Sync-DefaultSkills.ps1')) 'AIOS future updater missing'
foreach ($workspace in @($fixture,$project,$other)) {
    Assert (Test-Path -LiteralPath (Join-Path $workspace '.agents/skills/next-action/scripts/resolve_tasks.py')) 'Workspace resolver missing'
    Assert (Test-Path -LiteralPath (Join-Path $workspace '.claude/skills/next-action/SKILL.md')) 'Provider discovery missing'
}
# Non-core AIOS workspace skills link from the AIOS canon into every workspace (project-owned folder wins);
# app core skills (ADR-0102) are never linked or copied into projects, even if present in the AIOS or project-skills.json.
foreach ($name in @('chat-sync', 'daily-briefing', 'session-handoff', 'implement')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture ".agents/skills/$name") -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fixture ".agents/skills/$name/SKILL.md") "---`nname: $name`n---"
}
Set-Content -LiteralPath (Join-Path $fixture '.agents/project-skills.json') '{"leonidas-code": ["session-handoff"]}'
New-Item -ItemType Directory -Path (Join-Path $other '.agents/skills/daily-briefing') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $other '.agents/skills/daily-briefing/SKILL.md') 'Game owned daily-briefing'
git -C $fixture init --quiet
Assert ($LASTEXITCODE -eq 0) 'Fixture git initialization failed'
& $install -AiosRoot $fixture
Assert ((Get-Item -LiteralPath (Join-Path $project '.agents/skills/chat-sync')).LinkType -eq 'Junction') 'Workspace extra skill was not linked into a project'
Assert (Test-Path -LiteralPath (Join-Path $project '.claude/skills/chat-sync/SKILL.md')) 'Linked workspace extra skill is not discoverable to Claude'
Assert ((Get-Content -LiteralPath (Join-Path $other '.agents/skills/daily-briefing/SKILL.md') -Raw).Trim() -eq 'Game owned daily-briefing') 'Project-owned skill was overwritten by the workspace link'
Assert ((Get-Item -LiteralPath (Join-Path $other '.claude/skills/daily-briefing')).LinkType -eq 'Junction') 'Project-owned skill was not exposed to Claude by its adapter'
Assert ((Get-Content -LiteralPath (Join-Path $fixture '.git/info/exclude') -Raw) -match '(?m)^/projects/game/\.agents/skills/chat-sync/$') 'Workspace link is not excluded from the enclosing repository'
foreach ($coreName in @('session-handoff', 'implement')) {
    Assert (-not (Test-Path -LiteralPath (Join-Path $project ".agents/skills/$coreName"))) "Core skill $coreName was linked or copied into project .agents/skills"
    Assert (-not (Test-Path -LiteralPath (Join-Path $project ".claude/skills/$coreName"))) "Core skill $coreName was linked or copied into project .claude/skills"
}
Write-Host '[PASS] Workspace extras linked, project-owned copies kept, and core skills excluded from projects'

# Test automatic parent detection with the exact projects/leonidas-code layout.
New-Item -ItemType Directory -Path (Join-Path $project 'scripts'),(Join-Path $project '.agents/skills') -Force | Out-Null
foreach ($script in @('Install-NextAction.ps1','Sync-DefaultSkills.ps1','Start-NextActionSession.ps1','Sync-LeonidasSource.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $project 'scripts') -Force
}
& (Join-Path $project 'scripts/Install-NextAction.ps1')
$cached = Get-Content -LiteralPath (Join-Path $fixture '.agents/next-action.json') -Raw | ConvertFrom-Json
Assert ($cached.tasks_dir -eq 'tasks') 'Cached folder is not relative to the AIOS'
Write-Host '[PASS] Mob layout, existing provider-copy migration, backups, discovery, cache reuse, repeated installs and WhatIf'
Write-Host "Fixture: $fixture"

# Exercise the exact Codex command from a nested directory in a path containing spaces.
$hookProject = Join-Path $fixture 'Code hook fixture'
New-Item -ItemType Directory -Path (Join-Path $hookProject 'scripts/nested'),(Join-Path $hookProject '.agents/skills') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $hookProject 'AGENTS.md') 'Hook fixture instructions'
foreach ($script in @('Install-NextAction.ps1','Sync-DefaultSkills.ps1','Start-NextActionSession.ps1','Sync-LeonidasSource.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $hookProject 'scripts')
}
Copy-Item -LiteralPath (Join-Path $source '.agents/skills/next-action') -Destination (Join-Path $hookProject '.agents/skills') -Recurse
git -C $hookProject init --quiet
Assert ($LASTEXITCODE -eq 0) 'Hook fixture git initialization failed'
$hook = Get-Content -LiteralPath (Join-Path $source '.codex/hooks.json') -Raw | ConvertFrom-Json
$group = $hook.hooks.SessionStart[0]
foreach ($event in @('startup','resume','clear')) { Assert ($event -match $group.matcher) "Hook misses $event" }
Assert ('compact' -notmatch $group.matcher) 'Installation reruns during compaction'
Push-Location (Join-Path $hookProject 'scripts/nested')
try {
    $result = (& pwsh -NoProfile -Command $group.hooks[0].command | Out-String) | ConvertFrom-Json
    Assert ($LASTEXITCODE -eq 0) 'Codex hook command failed from a nested directory'
    Assert ($result.hookSpecificOutput.hookEventName -eq 'SessionStart') 'Wrong hook event in output'
    Assert ($result.hookSpecificOutput.additionalContext -match '\[PASS\]') 'Hook output lost installation verification'
} finally { Pop-Location }
Assert (Test-Path -LiteralPath (Join-Path $hookProject '.claude/skills/next-action/SKILL.md')) 'Hook did not install provider discovery'
Write-Host '[PASS] Codex startup/resume matcher and exact hook command from a nested path with spaces'
Set-Content -LiteralPath (Join-Path $hookProject 'scripts/Install-NextAction.ps1') "throw 'Fixture installation failure'"
Push-Location $hookProject
try {
    $failedOutput = & pwsh -NoProfile -Command $group.hooks[0].command 2>$null | Out-String
    Assert ($LASTEXITCODE -ne 0) 'Hook masked an installation failure'
    Assert ($failedOutput -notmatch 'hookSpecificOutput') 'Failed installation reported successful context'
} finally { Pop-Location }
Write-Host '[PASS] Codex hook preserves installation failures'
# 4. Linked worktree gets local skill copies (no outbound junctions), stays clean in git, and survives git worktree remove.
$wtRepo = Join-Path $fixture 'projects/wt-app'
$wtPath = Join-Path $fixture 'wt-app-branch'
New-Item -ItemType Directory -Path $wtRepo -Force | Out-Null
git -C $wtRepo init --quiet
git -C $wtRepo config user.email 'test@example.com'
git -C $wtRepo config user.name 'Test'
Set-Content -LiteralPath (Join-Path $wtRepo 'README.md') 'hello'
git -C $wtRepo add README.md
git -C $wtRepo commit --quiet -m 'init'
git -C $wtRepo worktree add --quiet $wtPath -b feat/safe-copy
Assert ($LASTEXITCODE -eq 0) 'Worktree creation failed'
$syncScript = Join-Path $PSScriptRoot 'Sync-DefaultSkills.ps1'
& $syncScript -RepoPath $fixture -SourceRoot $source -ProjectPath $wtPath -SkillsOnly | Out-Null
$wtSkill = Get-Item -LiteralPath (Join-Path $wtPath '.agents/skills/chat-sync') -Force
$wtAdapter = Get-Item -LiteralPath (Join-Path $wtPath '.claude/skills/chat-sync') -Force
Assert (-not $wtSkill.LinkType) 'Linked worktree received a junction instead of a local copy'
Assert (-not $wtAdapter.LinkType) 'Linked worktree Claude adapter received a junction instead of a local copy'
Assert (-not (Test-Path -LiteralPath (Join-Path $wtPath '.agents/skills/session-handoff'))) 'Core skill was copied or linked into linked worktree'
Assert (-not (git -C $wtPath status --porcelain)) 'Copied worktree skills dirtied git status'
git -C $wtRepo worktree remove $wtPath
Assert ($LASTEXITCODE -eq 0) 'git worktree remove failed on copied-skill worktree'
Assert (Test-Path -LiteralPath (Join-Path $fixture '.agents/skills/chat-sync/SKILL.md')) 'git worktree remove deleted the AIOS canon skill'
Write-Host '[PASS] Linked worktrees copy AIOS skills safely and git worktree remove preserves AIOS canon'

# 5. Clean template AIOS without core skills produces no "Core skills missing" warning, and -Check is read-only.
$cleanAios = Join-Path $fixture 'clean-template-aios'
New-Item -ItemType Directory -Path $cleanAios -Force | Out-Null
$warnings = @()
& $syncScript -RepoPath $cleanAios -SourceRoot $source -WarningVariable warnings 3>$null | Out-Null
Assert (-not ($warnings -match 'Core skills missing')) "Unexpected core skills warning: $($warnings -join '; ')"
$checkOut = pwsh -NoProfile -File $syncScript -RepoPath $cleanAios -SourceRoot $source -Check 2>&1 | Out-String
Assert ($LASTEXITCODE -eq 0 -and $checkOut -match '\[OK\] Default skill in sync') "Sync-DefaultSkills -Check failed when in sync: $checkOut"
$driftedFile = Join-Path $cleanAios '.agents/skills/next-action/SKILL.md'
Set-Content -LiteralPath $driftedFile 'drifted content'
$checkWarnings = @()
& $syncScript -RepoPath $cleanAios -SourceRoot $source -Check -WarningVariable checkWarnings 3>$null | Out-Null
Assert ($LASTEXITCODE -eq 0 -and ($checkWarnings -match 'Default skill drift')) 'Sync-DefaultSkills -Check did not report drift'
Assert ((Get-Content -LiteralPath $driftedFile -Raw).Trim() -eq 'drifted content') 'Sync-DefaultSkills -Check modified a file'
Write-Host '[PASS] No core-skills warning on clean template AIOS and -Check detects drift read-only'
