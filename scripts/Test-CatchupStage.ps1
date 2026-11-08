<#
.SYNOPSIS
  The landing gate for a catch-up stage (ADR-0096). A stage changes thousands of files, so the
  80-test cap of Test-DevTip.ps1 does not fit. This gate runs everything a stage needs.
.DESCRIPTION
  Use it as the merge queue gate: LEONIDAS_QUEUE_GATE_SCRIPT=scripts/Test-CatchupStage.ps1. The queue calls
  it with -Worktree and -Base only, and a custom gate replaces the smoke and release-note checks, so this
  script runs them too.
  1. Typecheck (apps/web, apps/server and each changed packages/*) and tests go through Test-DevTip.ps1
     -Keys, in chunks. Typecheck fails only on errors that -Base does not already have.
  2. Tests: every changed test file, the sibling test of each changed source file, and the chat, sidebar
     and settings suites.
  3. Boot smoke when apps/server or packages/ changed. Release-note check on -Base..HEAD.
  4. Known-red tests: failing keys saved by -SaveBaseline are ignored. They live in
     <git-common-dir>/leonidas-catchup/baseline-<stage>.json, shared by every worktree.
  -SaveBaseline records the failing keys at the current commit and returns green. Run it on the commit a
  stage starts from, with -Base set to that commit and -PlanFrom set to the stage tip: it then runs the
  same test list the stage gate will run, and skips tests that do not exist yet. Normal runs return one object: Status (green | red | unavailable), FailKeys, Notes.
#>
[CmdletBinding()]
param(
    [string]$Worktree = 'C:/lcw/land',
    [Parameter(Mandatory)][string]$Base,
    [string]$Stage = '00',
    [switch]$SaveBaseline,
    [string]$PlanFrom = 'HEAD',
    [int]$ChunkSize = 40,
    [string]$DevTipScript = (Join-Path $PSScriptRoot 'Test-DevTip.ps1'),
    [string]$SmokeCommand = 'node scripts/smoke.mjs',
    [string]$ReleaseNotesCommand = 'node scripts/check-release-notes.ts "{base}..HEAD" auto'
)

$ErrorActionPreference = 'Stop'
$notes = [System.Collections.Generic.List[string]]::new()
function Result([string]$status, [string[]]$fail = @()) {
    [pscustomobject]@{ Status = $status; FailKeys = @($fail); Notes = @($notes) }
}
function Get-Package([string]$file) { if ($file -match '^(apps/[^/]+|packages/[^/]+)/') { $Matches[1] } }

$common = (git -C $Worktree rev-parse --path-format=absolute --git-common-dir).Trim()
$stateDir = Join-Path $common 'leonidas-catchup'
$known = [System.Collections.Generic.HashSet[string]]::new()
if (Test-Path -LiteralPath $stateDir) {
    foreach ($f in Get-ChildItem -LiteralPath $stateDir -Filter 'baseline-*.json' -File) {
        foreach ($k in @((Get-Content -LiteralPath $f.FullName -Raw | ConvertFrom-Json).FailKeys)) { [void]$known.Add($k) }
    }
}

$planRev = if ($SaveBaseline) { $PlanFrom } else { 'HEAD' }
$changedAll = @(git -C $Worktree diff --name-only $Base $planRev)
$changed = @(git -C $Worktree diff --name-only --diff-filter=AM $Base $planRev)
function Test-InRev([string]$path) { git -C $Worktree cat-file -e "${planRev}:$path" 2>$null; $LASTEXITCODE -eq 0 }
if ($changed.Count -eq 0) { $notes.Add("nothing changed since $Base"); return Result 'green' }

# Plan: typecheck keys, then test keys.
$tsc = [System.Collections.Generic.SortedSet[string]]::new()
foreach ($pkg in 'apps/web', 'apps/server') {
    if (($changed | Where-Object { $_ -like "$pkg/*" -or $_ -like 'packages/*' })) { [void]$tsc.Add("tsc|$pkg") }
}
foreach ($pkg in ($changed | ForEach-Object { if ($_ -match '^(packages/[^/]+)/') { $Matches[1] } } | Sort-Object -Unique)) {
    if (Test-Path -LiteralPath (Join-Path $Worktree "$pkg/tsconfig.json")) { [void]$tsc.Add("tsc|$pkg") }
}
$tests = [System.Collections.Generic.SortedSet[string]]::new()
function Add-Test([string]$file) {
    $pkg = Get-Package $file
    if ($pkg -and $file -match '\.test\.tsx?$') { [void]$tests.Add("test|$pkg|$($file.Substring($pkg.Length + 1))") }
}
foreach ($f in $changed) {
    if ($f -notmatch '\.(ts|tsx)$') { continue }
    $cand = if ($f -match '\.test\.tsx?$') { $f } else { $f -replace '\.(ts|tsx)$', '.test.$1' }
    if (Test-InRev $cand) { Add-Test $cand }
}
foreach ($suite in 'apps/web/src/components/chat', 'apps/web/src/components/sidebar', 'apps/web/src/components/settings') {
    $dir = Join-Path $Worktree $suite
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    foreach ($f in Get-ChildItem -LiteralPath $dir -Recurse -File -Include '*.test.ts', '*.test.tsx') {
        Add-Test ($f.FullName.Substring($Worktree.Length).TrimStart('\', '/') -replace '\\', '/')
    }
}

function Invoke-DevTip([string[]]$keys) { & $DevTipScript -Worktree $Worktree -Base $Base -Keys $keys }

$fail = [System.Collections.Generic.List[string]]::new()
$batches = [System.Collections.Generic.List[object]]::new()
if ($tsc.Count -gt 0) { $batches.Add(@($tsc)) }
$testList = @($tests)
for ($i = 0; $i -lt $testList.Count; $i += $ChunkSize) {
    $batches.Add(@($testList[$i..([Math]::Min($i + $ChunkSize, $testList.Count) - 1)]))
}
$notes.Add("$($tsc.Count) typecheck key(s), $($testList.Count) test file(s) in $($batches.Count) batch(es)")
foreach ($batch in $batches) {
    $r = Invoke-DevTip $batch
    foreach ($n in @($r.Notes)) { $notes.Add("$n") }
    if ($r.Status -eq 'unavailable') { return Result 'unavailable' }
    foreach ($k in @($r.FailKeys)) { if (-not $fail.Contains($k)) { $fail.Add($k) } }
}

if ($SaveBaseline) {
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    $head = (git -C $Worktree rev-parse HEAD).Trim()
    $path = Join-Path $stateDir "baseline-$Stage.json"
    [pscustomobject]@{ Stage = $Stage; Commit = $head; FailKeys = @($fail) } | ConvertTo-Json | Set-Content -LiteralPath $path
    $notes.Add("baseline $path : $($fail.Count) known failing key(s)")
    return Result 'green'
}

$new = [System.Collections.Generic.List[string]]::new()
foreach ($k in $fail) { if ($known.Contains($k)) { $notes.Add("known red, ignored: $k") } else { $new.Add($k) } }

function Invoke-Step([string]$command) {
    Push-Location $Worktree
    try { $out = pwsh -NoProfile -Command $command 2>&1 | Out-String; [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Out = $out } } finally { Pop-Location }
}
if ($changedAll -match '^(apps/server|packages)/') {
    $s = Invoke-Step $SmokeCommand
    if (-not $s.Ok) { $new.Add('smoke'); $notes.Add(("smoke: " + (@($s.Out.Trim().Split("`n") | Select-Object -Last 5) -join ' | '))) }
}
# A push ships a release: a user-visible commit with no plain Release-Note must not land.
$rn = Invoke-Step ($ReleaseNotesCommand -replace '\{base\}', $Base)
if (-not $rn.Ok) { $new.Add('release-notes'); $notes.Add(("release-notes: " + (@($rn.Out.Trim().Split("`n") | Select-Object -First 8) -join ' | '))) }

if ($new.Count -gt 0) { return Result 'red' $new }
Result 'green'
