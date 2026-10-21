<#
.SYNOPSIS
  The green gate for the dev branch: type-checks and tests what a candidate `dev` tip changed.
.DESCRIPTION
  Runs in the merge worktree (default C:/lcw/dev-merge) at its current commit.
  - tsc --noEmit for apps/web and apps/server (only when files under that app or packages/ changed).
    A check fails only on errors that origin/main (-Base) does not already have.
  - vitest on the changed test files and on the sibling test of each changed source file.
  - -Keys re-runs only the named checks (used while bisecting to a culprit branch).
  Returns one object: Status (green | red | unavailable), FailKeys, Notes.
  `unavailable` means the gate could not run (no dependencies, install failed); callers fail open.
  Check keys: `tsc|<package>` and `test|<package>|<test file relative to the package>`.
#>
[CmdletBinding()]
param(
    [string]$Worktree = 'C:/lcw/dev-merge',
    [Parameter(Mandatory)][string]$Base,
    [string[]]$Keys,
    [int]$MaxTestFiles = 80
)

$ErrorActionPreference = 'Stop'
$common = (git -C $Worktree rev-parse --path-format=absolute --git-common-dir).Trim()
$notes = [System.Collections.Generic.List[string]]::new()
function Result([string]$status, [string[]]$fail = @()) {
    [pscustomobject]@{ Status = $status; FailKeys = @($fail); Notes = @($notes) }
}
function Get-Package([string]$file) { if ($file -match '^(apps/[^/]+|packages/[^/]+)/') { $Matches[1] } }

# Dependencies: one install per lockfile content. A failed install makes the gate unavailable.
$lockHash = (Get-FileHash -LiteralPath (Join-Path $Worktree 'pnpm-lock.yaml') -Algorithm SHA1).Hash
$stamp = Join-Path $Worktree 'node_modules/.dev-gate-lock'
$vp = Join-Path $Worktree 'node_modules/.bin/vp.cmd'
$tsc = Join-Path $Worktree 'node_modules/.bin/tsc.cmd'
if (-not (Test-Path -LiteralPath $vp) -or -not (Test-Path -LiteralPath $stamp) -or ((Get-Content -LiteralPath $stamp -Raw).Trim() -ne $lockHash)) {
    $notes.Add('installing dependencies in the merge worktree')
    Push-Location $Worktree
    try {
        $env:CI = 'true'
        & npx --yes pnpm@11.10.0 install --frozen-lockfile --prefer-offline *> (Join-Path $common 'leonidas-gate-install.log')
        if ($LASTEXITCODE -ne 0) { $notes.Add("install failed (exit $LASTEXITCODE)"); return Result 'unavailable' }
    } finally { Pop-Location }
    Set-Content -LiteralPath $stamp -Value $lockHash
}

function Get-TscErrors([string]$package) {
    Push-Location (Join-Path $Worktree $package)
    try {
        $out = & $tsc --noEmit 2>&1
        @($out | ForEach-Object { "$_" } | Where-Object { $_ -match ': error TS\d+:' } |
                ForEach-Object { ($_ -replace '\(\d+,\d+\)', '') } | Sort-Object -Unique)
    } finally { Pop-Location }
}

# Errors origin/main already has, per package, cached by its commit.
function Get-BaselineErrors([string]$package) {
    $cache = Join-Path $common ("leonidas-gate-baseline-{0}-{1}.txt" -f $Base.Substring(0, 10), ($package -replace '/', '_'))
    if (Test-Path -LiteralPath $cache) { return @(Get-Content -LiteralPath $cache) }
    $head = (git -C $Worktree rev-parse HEAD).Trim()
    git -C $Worktree checkout -q --detach $Base
    try { $errs = Get-TscErrors $package } finally { git -C $Worktree checkout -q --detach $head }
    Set-Content -LiteralPath $cache -Value $errs
    return $errs
}

# Plan: which checks to run.
$plan = [System.Collections.Generic.List[string]]::new()
if ($Keys) {
    # While bisecting, a test file a later branch adds does not exist yet at an earlier commit.
    foreach ($k in $Keys) {
        $p = $k.Split('|')
        if ($p[0] -eq 'test' -and -not (Test-Path -LiteralPath (Join-Path $Worktree "$($p[1])/$($p[2])"))) { continue }
        $plan.Add($k)
    }
}
else {
    $changed = @(git -C $Worktree diff --name-only --diff-filter=AM $Base HEAD)
    foreach ($pkg in 'apps/web', 'apps/server') {
        if ($changed | Where-Object { $_ -like "$pkg/*" -or $_ -like 'packages/*' }) { $plan.Add("tsc|$pkg") }
    }
    $tests = [System.Collections.Generic.SortedSet[string]]::new()
    foreach ($f in $changed) {
        $pkg = Get-Package $f
        if (-not $pkg -or $f -notmatch '\.(ts|tsx)$') { continue }
        $cand = if ($f -match '\.test\.tsx?$') { $f } else { $f -replace '\.(ts|tsx)$', '.test.$1' }
        if (Test-Path -LiteralPath (Join-Path $Worktree $cand)) { [void]$tests.Add("test|$pkg|$($cand.Substring($pkg.Length + 1))") }
    }
    if ($tests.Count -gt $MaxTestFiles) { $notes.Add("test files capped at $MaxTestFiles of $($tests.Count)") }
    $tests | Select-Object -First $MaxTestFiles | ForEach-Object { $plan.Add($_) }
}

$fail = [System.Collections.Generic.List[string]]::new()
foreach ($key in ($plan | Where-Object { $_ -like 'tsc|*' })) {
    $pkg = $key.Split('|')[1]
    $baseline = @(Get-BaselineErrors $pkg)
    $new = @(Get-TscErrors $pkg | Where-Object { $_ -notin $baseline })
    if ($new.Count -gt 0) { $fail.Add($key); $notes.Add("$key : $($new.Count) new error(s), first: $($new[0])") }
}
foreach ($group in ($plan | Where-Object { $_ -like 'test|*' } | Group-Object { $_.Split('|')[1] })) {
    $pkg = $group.Name
    $files = @($group.Group | ForEach-Object { $_.Split('|')[2] })
    $report = Join-Path $env:TEMP ("dev-gate-{0}.json" -f [guid]::NewGuid().ToString('N'))
    Push-Location (Join-Path $Worktree $pkg)
    try { & $vp test run --reporter=json --outputFile=$report @files *> $null } finally { Pop-Location }
    if (-not (Test-Path -LiteralPath $report)) {
        # No report means the runner itself broke (bad config or a missing file): count every file as failed.
        foreach ($f in $files) { $fail.Add("test|$pkg|$f") }
        $notes.Add("test runner in $pkg produced no report")
        continue
    }
    $json = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
    Remove-Item -LiteralPath $report -Force
    foreach ($r in $json.testResults | Where-Object { $_.status -eq 'failed' }) {
        $rel = ($r.name -replace '\\', '/')
        $idx = $rel.IndexOf("$pkg/")
        $fail.Add("test|$pkg|" + $(if ($idx -ge 0) { $rel.Substring($idx + $pkg.Length + 1) } else { $rel }))
    }
}
if ($fail.Count -gt 0) { return Result 'red' $fail }
Result 'green'
