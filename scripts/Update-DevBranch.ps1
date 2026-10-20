<#
.SYNOPSIS
  Rebuilds the local `dev` branch: the published origin/main plus every recent local feature branch
  that merges cleanly, so the always-on dev copy shows all work in progress.
.DESCRIPTION
  - Starts from origin/main (fetched first), so a new publish reaches dev without a manual pull.
  - Merges local `main`, then each other local branch that has commits origin/main lacks and a tip
    newer than -MaxAgeDays, oldest first. A branch that conflicts is skipped and listed, never forced.
  - Rebuilds in its own worktree (C:/lcw/dev-merge). No feature branch, `main` or origin is changed;
    `dev` is only ever a derived branch and is never pushed.
  - Does nothing when no source branch moved since the last run. Report: .t3/dev-branch-status.md.
  Safe to run often; the dev supervisor calls it every minute.
#>
[CmdletBinding()]
param([switch]$Fetch, [int]$MaxAgeDays = 21, [switch]$Force)

$ErrorActionPreference = 'Stop'
$work = 'C:/lcw/dev-merge'
# Throwaway or backup lines that must never feed the dev copy.
$extra = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dev-branch-exclude.txt') -ErrorAction SilentlyContinue |
        Where-Object { $_ -and $_ -notmatch '^\s*#' })
$skip = (@('^(dev|backup/|snapshot/|upstream-review/|archive/)') + $extra) -join '|'

$common = (git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir).Trim()
$repo = Split-Path -Parent $common
$statusFile = Join-Path $repo '.t3/dev-branch-status.md'
$sigFile = Join-Path $common 'leonidas-dev-signature.txt'

$mutex = New-Object System.Threading.Mutex($false, 'Global\LeonidasUpdateDevBranch')
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
        git -C $repo worktree add -f -B dev $work $base --quiet 2>&1 | Out-Null
    }
    git -C $work checkout -q -B dev $base 2>&1 | Out-Null
    git -C $work reset --hard -q $base
    git -C $work clean -fdq

    $merged = [System.Collections.Generic.List[string]]::new()
    $conflicts = [System.Collections.Generic.List[string]]::new()
    $deps = [System.Collections.Generic.List[string]]::new()
    $lockMismatch = [System.Collections.Generic.List[string]]::new()
    foreach ($s in $sources) {
        git -C $work merge-base --is-ancestor $s.Sha HEAD
        if ($LASTEXITCODE -eq 0) { continue }
        # Frozen-install trap: a package.json edit without its pnpm-lock.yaml edit makes every
        # `pnpm install --frozen-lockfile` fail, and the dev supervisor runs one to repair patches.
        $changed = @(git -C $repo diff --name-only "$base...$($s.Sha)" -- pnpm-lock.yaml package.json 'apps/*/package.json' 'packages/*/package.json' 'scripts/package.json')
        if (($changed -match 'package\.json$') -and -not ($changed -contains 'pnpm-lock.yaml')) { $lockMismatch.Add($s.Name); continue }
        git -C $work merge --no-ff --no-edit --no-verify -q -m "dev: merge $($s.Name)" $s.Sha 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            git -C $work merge --abort 2>&1 | Out-Null
            git -C $work reset --hard -q 2>&1 | Out-Null
            $conflicts.Add($s.Name)
            continue
        }
        $merged.Add($s.Name)
        $touched = @(git -C $repo diff --name-only "$base...$($s.Sha)" -- pnpm-lock.yaml package.json 'apps/*/package.json' 'packages/*/package.json')
        if ($touched.Count -gt 0) { $deps.Add($s.Name) }
    }

    $tip = (git -C $work rev-parse HEAD).Trim()
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statusFile) | Out-Null
    $report = @(
        '# Dev branch status', '',
        "Built $(Get-Date -Format 'yyyy-MM-dd h:mm tt') from origin/main $($base.Substring(0, 10)); tip $($tip.Substring(0, 10)).", '',
        "## Merged ($($merged.Count))", ($merged | ForEach-Object { "- $_" }), '',
        "## Skipped: conflicts ($($conflicts.Count))", ($conflicts | ForEach-Object { "- $_" }), '',
        "## Skipped: package.json changed without pnpm-lock.yaml ($($lockMismatch.Count)); fix the lockfile on the branch", ($lockMismatch | ForEach-Object { "- $_" }), '',
        "## Changed dependency files (run an install in C:/lcw/dev-live if the dev copy fails to start)", ($deps | ForEach-Object { "- $_" })
    )
    Set-Content -LiteralPath $statusFile -Value $report
    Set-Content -LiteralPath $sigFile -Value $signature -NoNewline
    Write-Output "dev branch: $($tip.Substring(0, 10)), merged $($merged.Count), conflicts $($conflicts.Count) ($($conflicts -join ', ')), lock mismatch $($lockMismatch.Count) ($($lockMismatch -join ', '))"
} finally {
    $mutex.ReleaseMutex()
}
