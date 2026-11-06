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
    $gate
}

function Remove-BranchWorktree([string]$branch) {
    $wt = git worktree list --porcelain | Out-String
    $m = [regex]::Match($wt, "worktree (?<p>[^\r\n]+)\r?\nHEAD [0-9a-f]+\r?\nbranch refs/heads/$([regex]::Escape($branch))")
    if ($m.Success) {
        $p = $m.Groups['p'].Value
        if (git -C $p status --porcelain) { return "worktree $p kept (uncommitted changes)" }
        # git worktree remove deletes through junctions: cut links first, then delete (long paths need .NET).
        Get-ChildItem -LiteralPath $p -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue |
            Sort-Object { $_.FullName.Length } -Descending |
            ForEach-Object { if ($_.PSIsContainer) { [System.IO.Directory]::Delete($_.FullName, $false) } else { [System.IO.File]::Delete($_.FullName) } }
        [System.IO.Directory]::Delete((Resolve-Path -LiteralPath $p).ProviderPath, $true)
        git worktree prune
    }
    git branch -q -d $branch 2>$null
    if ($m.Success) { "worktree $($m.Groups['p'].Value) removed" } else { '' }
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
                $notes = @()
                if ($entry.task) { $notes += (& (Join-Path $PSScriptRoot 'Start-AgentTask.ps1') -Task $entry.task -Release) }
                $notes += Remove-BranchWorktree $entry.branch
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
