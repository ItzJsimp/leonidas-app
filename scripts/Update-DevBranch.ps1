<#
.SYNOPSIS
  Rebuilds the local `dev` branch: the published origin/main plus every recent local feature branch
  that merges cleanly, so the always-on dev copy shows all work in progress. `dev` only moves when green.
.DESCRIPTION
  - Starts from origin/main (fetched first), so a new publish reaches dev without a manual pull.
  - Merges local `main`, then each other local branch that has commits origin/main lacks and a tip
    newer than -MaxAgeDays, oldest first.
  - A branch that conflicts is rebuilt as `rebase/<branch>` (New-CleanBranch.ps1: already-applied commits
    dropped, saved conflict resolutions replayed) and that copy is merged instead. A rebuild that still
    conflicts is listed with the commit and files, never forced.
  - Green gate (Test-DevTip.ps1): the candidate tip is type-checked and its changed tests run. On red,
    the merge order is bisected to the branch that broke it, that branch is dropped, and the tip is rebuilt
    (up to 3 drops). `dev` is moved only to a green tip; otherwise it keeps the last good one.
  - Works in its own worktree (C:/lcw/dev-merge). No feature branch, `main` or origin is changed;
    `dev` is a derived branch and is never pushed.
  - Does nothing when no source branch moved since the last run. Report: .t3/dev-branch-status.md.
  -NoGate skips the gate. Env overrides (tests): LEONIDAS_DEV_MERGE_WORKTREE, LEONIDAS_DEV_GATE_SCRIPT.
#>
[CmdletBinding()]
param([switch]$Fetch, [int]$MaxAgeDays = 21, [switch]$Force, [switch]$NoGate)

$ErrorActionPreference = 'Stop'
$work = if ($env:LEONIDAS_DEV_MERGE_WORKTREE) { $env:LEONIDAS_DEV_MERGE_WORKTREE } else { 'C:/lcw/dev-merge' }
$gateScript = if ($env:LEONIDAS_DEV_GATE_SCRIPT) { $env:LEONIDAS_DEV_GATE_SCRIPT } else { Join-Path $PSScriptRoot 'Test-DevTip.ps1' }
$cleanScript = Join-Path $PSScriptRoot 'New-CleanBranch.ps1'
# Throwaway, derived or backup lines that must never feed the dev copy.
$extra = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dev-branch-exclude.txt') -ErrorAction SilentlyContinue |
        Where-Object { $_ -and $_ -notmatch '^\s*#' })
$skip = (@('^(dev|rebase/|backup/|snapshot/|upstream-review/|archive/)') + $extra) -join '|'
$maxDrops = 3

$common = (git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir).Trim()
$repo = Split-Path -Parent $common
$statusFile = Join-Path $repo '.t3/dev-branch-status.md'
$sigFile = Join-Path $common 'leonidas-dev-signature.txt'

$repoKey = [BitConverter]::ToString([Security.Cryptography.SHA1]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($common))).Replace('-', '').Substring(0, 12)
$mutex = New-Object System.Threading.Mutex($false, "Global\LeonidasUpdateDevBranch-$repoKey")
if (-not $mutex.WaitOne(0)) { Write-Output 'dev branch: another update is running'; return }
try {
    if ($Fetch) {
        # --no-tags: a local tag that differs from origin's makes a tag fetch fail the whole command.
        git -C $repo fetch origin --no-tags --quiet '+refs/heads/main:refs/remotes/origin/main' 2>$null | Out-Null
    }
    $base = (git -C $repo rev-parse --verify -q origin/main)
    if (-not $base) { $base = (git -C $repo rev-parse --verify main) }
    $base = $base.Trim()

    $cutoff = (Get-Date).AddDays(-$MaxAgeDays)
    $sources = foreach ($line in (git -C $repo for-each-ref refs/heads --format='%(refname:short)|%(objectname)|%(committerdate:iso-strict)')) {
        $name, $sha, $date = $line -split '\|', 3
        if ($name -match $skip -or [datetime]$date -lt $cutoff) { continue }
        if ($name -ne 'main' -and [int](git -C $repo rev-list --count "$base..$sha") -eq 0) { continue }
        [pscustomobject]@{ Name = $name; Sha = $sha; Date = [datetime]$date }
    }
    # Local main first (it carries the newest direct commits), then oldest branch to newest.
    $sources = @($sources | Sort-Object @{ e = { $_.Name -ne 'main' } }, Date)

    $signature = (@("origin/main=$base") + ($sources | ForEach-Object { "$($_.Name)=$($_.Sha)" })) -join "`n"
    if (-not $Force -and (Test-Path -LiteralPath $sigFile) -and ((Get-Content -LiteralPath $sigFile -Raw) -eq $signature) -and
        (git -C $repo rev-parse --verify -q dev)) {
        Write-Output 'dev branch: unchanged'; return
    }

    if (-not (Test-Path -LiteralPath $work)) {
        git -C $repo worktree add -f --detach $work $base --quiet 2>&1 | Out-Null
    }
    git -C $repo config rerere.enabled true
    git -C $repo config rerere.autoupdate true

    # One merge attempt in the work tree; a failure leaves the tree exactly as it was.
    function Add-Merge([string]$Label, [string]$Sha) {
        git -C $work merge --no-ff --no-edit --no-verify -q -m "dev: merge $Label" $Sha 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            git -C $work merge --abort 2>&1 | Out-Null
            git -C $work reset --hard -q 2>&1 | Out-Null
            return $false
        }
        return $true
    }

    # Builds the candidate tip from $base minus the branches in $Drop. Returns the build record.
    function Build-Tip([string[]]$Drop) {
        git -C $work checkout -q -B dev-candidate $base 2>&1 | Out-Null
        git -C $work reset --hard -q $base
        git -C $work clean -fdq
        $b = @{
            Chain = [System.Collections.Generic.List[object]]::new()
            Merged = [System.Collections.Generic.List[string]]::new()
            Rebased = [System.Collections.Generic.List[string]]::new()
            Conflicts = [System.Collections.Generic.List[string]]::new()
            Needs = [System.Collections.Generic.List[string]]::new()
            Lock = [System.Collections.Generic.List[string]]::new()
            Deps = [System.Collections.Generic.List[string]]::new()
        }
        foreach ($s in $sources) {
            if ($s.Name -in $Drop) { continue }
            git -C $work merge-base --is-ancestor $s.Sha HEAD
            if ($LASTEXITCODE -eq 0) { continue }
            # Frozen-install trap: a package.json edit without its pnpm-lock.yaml edit makes every
            # `pnpm install --frozen-lockfile` fail, and the dev supervisor runs one to repair patches.
            $changed = @(git -C $repo diff --name-only "$base...$($s.Sha)" -- pnpm-lock.yaml package.json 'apps/*/package.json' 'packages/*/package.json' 'scripts/package.json')
            if (($changed -match 'package\.json$') -and -not ($changed -contains 'pnpm-lock.yaml')) { $b.Lock.Add($s.Name); continue }
            $label = $s.Name
            $ok = Add-Merge $s.Name $s.Sha
            if (-not $ok) {
                $clean = & $cleanScript -Branch $s.Name -Onto $base
                if ($clean.Status -eq 'nothing') { continue }   # every commit is already on origin/main
                if ($clean.Status -eq 'clean' -and (Add-Merge "rebase/$($s.Name)" $clean.Sha)) {
                    $ok = $true; $label = "$($s.Name) via rebase/$($s.Name)"; $b.Rebased.Add($s.Name)
                } elseif ($clean.Status -eq 'conflict') {
                    $b.Needs.Add("$($s.Name): commit $($clean.ConflictCommit.Substring(0, 10)) conflicts in $($clean.ConflictFiles -join ', ')")
                }
            }
            if (-not $ok) { $b.Conflicts.Add($s.Name); continue }
            $b.Merged.Add($label)
            $b.Chain.Add([pscustomobject]@{ Source = $s.Name; Label = $label; Sha = (git -C $work rev-parse HEAD).Trim() })
            if (@(git -C $repo diff --name-only "$base...$($s.Sha)" -- pnpm-lock.yaml package.json 'apps/*/package.json' 'packages/*/package.json').Count -gt 0) { $b.Deps.Add($s.Name) }
        }
        return $b
    }

    function Invoke-Gate([string[]]$Keys) {
        $gateArgs = @{ Worktree = $work; Base = $base }
        if ($Keys) { $gateArgs.Keys = $Keys }
        & $gateScript @gateArgs
    }

    # First merge in the chain whose tree fails the named checks; 'BASE' when origin/main already fails them.
    function Find-Culprit($Chain, [string[]]$Keys) {
        git -C $work checkout -q --detach $base
        if ((Invoke-Gate $Keys).Status -eq 'red') { return 'BASE' }
        $lo = 0; $hi = $Chain.Count - 1   # the tip (last entry) is known red; red is assumed to stay red
        while ($lo -lt $hi) {
            $mid = [int][math]::Floor(($lo + $hi) / 2)
            git -C $work checkout -q --detach $Chain[$mid].Sha
            if ((Invoke-Gate $Keys).Status -eq 'red') { $hi = $mid } else { $lo = $mid + 1 }
        }
        return $Chain[$lo].Source
    }

    $drop = @()
    $gateDropped = [System.Collections.Generic.List[string]]::new()
    $gateNotes = [System.Collections.Generic.List[string]]::new()
    $verdict = 'skipped'
    $build = $null
    for ($attempt = 0; $attempt -le $maxDrops; $attempt++) {
        $build = Build-Tip $drop
        if ($NoGate -or $build.Chain.Count -eq 0) { $verdict = 'skipped'; break }
        $g = Invoke-Gate $null
        foreach ($n in @($g.Notes)) { $gateNotes.Add("$n") }
        if ($g.Status -ne 'red') { $verdict = $g.Status; break }
        $culprit = Find-Culprit $build.Chain $g.FailKeys
        if ($culprit -eq 'BASE') { $verdict = 'green (origin/main already fails the same checks)'; break }
        if ($attempt -eq $maxDrops) { $verdict = 'red'; break }
        $drop += $culprit
        $gateDropped.Add("$culprit (failing: $(@($g.FailKeys) -join ', '))")
        # Rebuild without the culprit; re-check the whole tip on the next pass.
    }
    # The loop leaves the work tree detached after a bisect; the tip commit is the candidate's HEAD only for a fresh build.
    $tip = (git -C $work rev-parse dev-candidate).Trim()
    $promote = $verdict -ne 'red'
    if ($promote) { git -C $repo branch -f dev $tip 2>&1 | Out-Null }

    $b = $build
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statusFile) | Out-Null
    $oldTip = (git -C $repo rev-parse --verify -q dev)
    $report = @(
        '# Dev branch status', '',
        "Built $(Get-Date -Format 'yyyy-MM-dd h:mm tt') from origin/main $($base.Substring(0, 10)); candidate $($tip.Substring(0, 10)).",
        "Gate: $verdict. $(if ($promote) { "`dev` moved to the candidate." } else { "`dev` kept at $("$oldTip".Substring(0, [math]::Min(10, "$oldTip".Length))) (last good)." })", '',
        "## Dropped by the gate ($($gateDropped.Count))", ($gateDropped | ForEach-Object { "- $_" }), '',
        "## Merged ($($b.Merged.Count))", ($b.Merged | ForEach-Object { "- $_" }), '',
        "## Needs a person or agent to resolve ($($b.Needs.Count)); resolve in C:/lcw/dev-rebase, commit, and rerere remembers it", ($b.Needs | ForEach-Object { "- $_" }), '',
        "## Skipped: still conflicts ($($b.Conflicts.Count))", ($b.Conflicts | ForEach-Object { "- $_" }), '',
        "## Skipped: package.json changed without pnpm-lock.yaml ($($b.Lock.Count)); fix the lockfile on the branch", ($b.Lock | ForEach-Object { "- $_" }), '',
        "## Changed dependency files (run an install in C:/lcw/dev-live if the dev copy fails to start)", ($b.Deps | ForEach-Object { "- $_" }), '',
        "## Gate notes", ($gateNotes | Select-Object -Unique | ForEach-Object { "- $_" })
    )
    Set-Content -LiteralPath $statusFile -Value $report
    Set-Content -LiteralPath $sigFile -Value $signature -NoNewline
    Write-Output "dev branch: $($tip.Substring(0, 10)) gate=$verdict$(if (-not $promote) { ' HELD' }), merged $($b.Merged.Count) (rebuilt $($b.Rebased.Count)), gate-dropped $($gateDropped.Count), conflicts $($b.Conflicts.Count), lock mismatch $($b.Lock.Count)"
} finally {
    $mutex.ReleaseMutex()
}
