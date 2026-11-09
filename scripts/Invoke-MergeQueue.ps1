<#
.SYNOPSIS
  Land agent branches on origin/main one at a time: merge onto the newest origin/main, run checks, push.
.DESCRIPTION
  -Branch adds the branch to the queue (<git-common-dir>/leonidas-queue). Then this process lands the
  queue if no other lander runs. A lander holds lander.lock open, so a crashed lander frees it at once.
  For each entry, in order of submission, in the landing worktree (default C:/lcw/land, detached):
    1. fetch, check out origin/main, merge the branch. A conflict rejects the entry.
    2. Gate: scripts/Test-DevTip.ps1 (typecheck and scoped tests, new errors only), then the boot
       smoke (node scripts/smoke.mjs) when apps/server or packages changed. Not green rejects the entry.
       LEONIDAS_QUEUE_GATE_SCRIPT replaces the gate (tests use a fake).
    3. git push origin HEAD:main. When origin moved, start again at step 1 (3 tries).
    4. Release the task claim (scripts/Start-AgentTask.ps1) and remove the clean branch worktree.
  Each result goes to leonidas-queue/done/<id>.json: landed (with sha), conflict, red or push-failed.
  A push to main ships a release, so only green work lands.
.EXAMPLE
  pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Branch task/fix-sidebar-scroll -Task fix-sidebar-scroll -Wait
  pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Status
#>
[CmdletBinding()]
param(
    [string]$Branch,
    [string]$Task,
    [switch]$Wait,
    [int]$WaitMinutes = 60,
    [switch]$Status,
    [string]$LandWorktree = $(if ($env:LEONIDAS_LAND_WORKTREE) { $env:LEONIDAS_LAND_WORKTREE } else { 'C:/lcw/land' })
)
$ErrorActionPreference = 'Stop'
$common = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$queue = Join-Path $common 'leonidas-queue'
$done = Join-Path $queue 'done'
New-Item -ItemType Directory -Force -Path $done | Out-Null
function Pending { @(Get-ChildItem -LiteralPath $queue -Filter '*.json' -File | Sort-Object Name) }

if ($Status) {
    $p = Pending
    "queue: $($p.Count) waiting"
    $p | ForEach-Object { $e = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; "  $($_.BaseName) $($e.branch)" }
    Get-ChildItem -LiteralPath $done -Filter '*.json' | Sort-Object Name -Descending | Select-Object -First 5 |
        ForEach-Object { $r = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; "  done $($_.BaseName) $($r.branch): $($r.status) $($r.sha)" }
    exit 0
}

$id = $null
if ($Branch) {
    git rev-parse --verify -q "refs/heads/$Branch" | Out-Null
    if ($LASTEXITCODE) { Write-Error "No local branch '$Branch'."; exit 1 }
    # Ticks plus a random part: sorts by submit time and never collides.
    $id = '{0:D19}-{1}' -f [DateTime]::UtcNow.Ticks, [guid]::NewGuid().ToString('N').Substring(0, 6)
    [ordered]@{ branch = $Branch; task = $Task; submittedAt = (Get-Date).ToString('o') } | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $queue "$id.tmp")
    Move-Item -LiteralPath (Join-Path $queue "$id.tmp") -Destination (Join-Path $queue "$id.json")
    "queued: $Branch as $id"
}

function Write-Result($entryId, $entry, [string]$status, [string]$sha = '', [string[]]$detail = @()) {
    [ordered]@{ branch = $entry.branch; task = $entry.task; status = $status; sha = $sha; detail = $detail; at = (Get-Date).ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $done "$entryId.json")
    "$status`: $($entry.branch) $sha $($detail -join '; ')"
}

function L { git -C $LandWorktree @args 2>&1; if ($LASTEXITCODE) { throw "git $($args -join ' ') failed" } }

function Invoke-Gate([string]$base) {
    if ($env:LEONIDAS_QUEUE_GATE_SCRIPT) { return & $env:LEONIDAS_QUEUE_GATE_SCRIPT -Worktree $LandWorktree -Base $base }
    $gate = & (Join-Path $LandWorktree 'scripts/Test-DevTip.ps1') -Worktree $LandWorktree -Base $base
    if ($gate.Status -ne 'green') { return $gate }
    $changed = @(git -C $LandWorktree diff --name-only $base HEAD)
    if ($changed -match '^(apps/server|packages)/') {
        Push-Location $LandWorktree
        try { $out = node scripts/smoke.mjs 2>&1 | Out-String; $ok = $LASTEXITCODE -eq 0 } finally { Pop-Location }
        if (-not $ok) { return [pscustomobject]@{ Status = 'red'; FailKeys = @('smoke'); Notes = @($out.Trim().Split("`n") | Select-Object -Last 5) } }
    }
    # A push ships a release: a user-visible commit with no plain Release-Note must not land.
    Push-Location $LandWorktree
    try { $notesOut = node scripts/check-release-notes.ts "$base..HEAD" auto 2>&1 | Out-String; $notesOk = $LASTEXITCODE -eq 0 } finally { Pop-Location }
    if (-not $notesOk) { return [pscustomobject]@{ Status = 'red'; FailKeys = @('release-notes'); Notes = @($notesOut.Trim().Split("`n") | Select-Object -First 8) } }
    $gate
}

# The worktree of a branch: found by branch name, or by HEAD when something detached it (Test-DevTip.ps1
# does). Never the main checkout (first entry) or the landing worktree.
function Find-BranchWorktree([string]$branch) {
    $tip = (git rev-parse --verify -q "refs/heads/$branch" | Out-String).Trim()
    $norm = { param($x) ([string]$x).Replace('\', '/').TrimEnd('/').ToLowerInvariant() }
    $skip = & $norm $LandWorktree
    $blocks = @((git worktree list --porcelain | Out-String) -split '(?:\r?\n){2,}' | Where-Object { $_.Trim() })
    foreach ($block in $blocks | Select-Object -Skip 1) {
        $path = [regex]::Match($block, '(?m)^worktree (.+?)\r?$').Groups[1].Value
        if (-not $path -or $skip -eq (& $norm $path)) { continue }
        $onBranch = $block -match "(?m)^branch refs/heads/$([regex]::Escape($branch))\r?$"
        $detachedAtTip = $tip -and $block -match '(?m)^detached\r?$' -and $block -match "(?m)^HEAD $tip\r?$"
        if ($onBranch -or $detachedAtTip) { return $path }
    }
}

# Cut every link (junction or symlink) in a tree, without ever entering one, so a later delete cannot reach a
# link target. Throws when a link cannot be cut: the caller must then not delete.
function Remove-TreeLinks([string]$dir) {
    foreach ($entry in [System.IO.Directory]::EnumerateFileSystemEntries($dir)) {
        $attr = [System.IO.File]::GetAttributes($entry)
        if ($attr -band [System.IO.FileAttributes]::ReparsePoint) {
            if ($attr -band [System.IO.FileAttributes]::Directory) { [System.IO.Directory]::Delete($entry, $false) } else { [System.IO.File]::Delete($entry) }
        } elseif ($attr -band [System.IO.FileAttributes]::Directory) { Remove-TreeLinks $entry }
    }
}

function Remove-BranchWorktree([string]$branch) {
    $p = Find-BranchWorktree $branch
    if (-not $p) { git branch -q -d $branch 2>$null; return "no worktree found for $branch" }
    if (git -C $p status --porcelain) { return "worktree $p kept (uncommitted changes)" }
    # Rename first: Windows refuses it while any process has a file or its current folder open in
    # the worktree. A busy worktree (an agent still in it) is never touched (2026-11-06: deleting a
    # busy one destroyed its ignored files).
    $gone = "$p.landed-$PID"
    try { Rename-Item -LiteralPath $p -NewName (Split-Path $gone -Leaf) } catch { return "worktree $p kept (in use; its agent removes it)" }
    # git worktree remove deletes through junctions (2026-11-07: 49 AIOS skill files): cut all links first.
    try { Remove-TreeLinks $gone } catch {
        Rename-Item -LiteralPath $gone -NewName (Split-Path $p -Leaf)
        return "worktree $p kept (could not cut a link: $($_.Exception.Message))"
    }
    try { [System.IO.Directory]::Delete((Resolve-Path -LiteralPath $gone).ProviderPath, $true) } catch { return "worktree $p partly removed, rest at $gone ($($_.Exception.Message))" }
    git worktree prune
    git branch -q -d $branch 2>$null
    "worktree $p removed"
}

# A worktree removed through a skill junction empties the AIOS skill folders it links. The AIOS above the main
# checkout (a folder with AGENTS.md and .git) owns Restore-VanishedSkills.ps1: run it after each landing.
# Skipped, with no output, when there is no such AIOS or script.
function Restore-AiosSkills {
    $dir = Split-Path (Split-Path $common -Parent) -Parent
    while ($dir) {
        if ((Test-Path -LiteralPath (Join-Path $dir 'AGENTS.md')) -and (Test-Path -LiteralPath (Join-Path $dir '.git'))) {
            $script = Join-Path $dir 'scripts/Restore-VanishedSkills.ps1'
            if (Test-Path -LiteralPath $script) { return @(& $script -Root $dir) }
            return @()
        }
        $parent = Split-Path $dir -Parent
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    @()
}

function Invoke-Land($file) {
    $entryId = $file.BaseName
    $entry = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    try {
        foreach ($try in 1..3) {
            git fetch -q origin main
            if (-not (Test-Path -LiteralPath $LandWorktree)) { git worktree add -q --detach $LandWorktree origin/main 2>&1 | Out-Null }
            $base = (git rev-parse origin/main).Trim()
            L checkout -q --detach --force $base | Out-Null
            L clean -fdq | Out-Null
            git -C $LandWorktree merge -q --no-edit $entry.branch 2>&1 | Out-Null
            if ($LASTEXITCODE) {
                $files = @(git -C $LandWorktree diff --name-only --diff-filter=U)
                git -C $LandWorktree merge --abort 2>&1 | Out-Null
                return Write-Result $entryId $entry 'conflict' '' $files
            }
            $gate = Invoke-Gate $base
            if ($gate.Status -ne 'green') { return Write-Result $entryId $entry 'red' '' (@("gate $($gate.Status)") + @($gate.FailKeys) + @($gate.Notes)) }
            $sha = (git -C $LandWorktree rev-parse HEAD).Trim()
            git -C $LandWorktree push -q origin HEAD:main 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                git fetch -q origin main
                # The push is done: a cleanup problem is a note, never a failed landing.
                $notes = @()
                try {
                    if ($entry.task) { $notes += (& (Join-Path $PSScriptRoot 'Start-AgentTask.ps1') -Task $entry.task -Release) }
                    $notes += Remove-BranchWorktree $entry.branch
                    $notes += Restore-AiosSkills
                } catch { $notes += "cleanup skipped: $_" }
                return Write-Result $entryId $entry 'landed' $sha ($notes | Where-Object { $_ })
            }
            # origin/main moved while the gate ran: merge again onto the new tip and re-check.
        }
        Write-Result $entryId $entry 'push-failed' '' @('origin/main moved 3 times')
    } catch {
        Write-Result $entryId $entry 'error' '' @("$_")
    } finally {
        Remove-Item -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    }
}

# Drain. Re-check after the lock is released, so an entry queued at that moment is never stranded.
while ((Pending).Count -gt 0) {
    try { $lock = [System.IO.File]::Open((Join-Path $queue 'lander.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [System.IO.IOException] { "another lander is running; it will land the queue"; break }
    try { while ($next = Pending | Select-Object -First 1) { Invoke-Land $next } }
    finally { $lock.Dispose() }
}

if ($Wait -and $id) {
    $deadline = (Get-Date).AddMinutes($WaitMinutes)
    $result = Join-Path $done "$id.json"
    while (-not (Test-Path -LiteralPath $result) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
    if (-not (Test-Path -LiteralPath $result)) { "timeout: $Branch is still in the queue"; exit 3 }
    $r = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
    "result: $($r.status) $($r.sha)"
    exit $(if ($r.status -eq 'landed') { 0 } else { 4 })
}
