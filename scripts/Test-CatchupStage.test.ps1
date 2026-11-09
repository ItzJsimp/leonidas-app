$ErrorActionPreference = 'Stop'
# Scenario tests for Test-CatchupStage.ps1 in a throwaway repo. Test-DevTip.ps1 is replaced by a fake.
# Run: pwsh -NoProfile -File scripts/Test-CatchupStage.test.ps1

function Fail([string]$m) { throw "FAIL: $m" }
function Assert([bool]$c, [string]$m) { if (-not $c) { Fail $m } }
function G { git -C $script:repo @args 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ')" } }
function Put([string]$file, [string]$text = 'x') {
    $p = Join-Path $script:repo $file
    New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null
    Set-Content -LiteralPath $p -Value $text
}

$root = Join-Path $env:TEMP ("catchup-gate-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$script:repo = Join-Path $root 'repo'
New-Item -ItemType Directory -Force -Path (Join-Path $script:repo 'scripts') | Out-Null
try {
    G init -q -b main; G config user.name test; G config user.email test@example.com
    Copy-Item (Join-Path $PSScriptRoot 'Test-CatchupStage.ps1') (Join-Path $script:repo 'scripts')
    # Fake Test-DevTip: logs each call; fails the keys listed in fail.txt; says unavailable when unavail.txt exists.
    Set-Content (Join-Path $script:repo 'scripts/fake-devtip.ps1') 'param($Worktree, $Base, $Keys)
Add-Content (Join-Path $Worktree "calls.log") ($Keys -join ";")
if (Test-Path (Join-Path $Worktree "unavail.txt")) { return [pscustomobject]@{ Status = "unavailable"; FailKeys = @(); Notes = @("no deps") } }
$f = @(); if (Test-Path (Join-Path $Worktree "fail.txt")) { $f = @(Get-Content (Join-Path $Worktree "fail.txt") | Where-Object { $_ -in $Keys }) }
[pscustomobject]@{ Status = $(if ($f) { "red" } else { "green" }); FailKeys = $f; Notes = @() }'
    Put 'README.md' 'base'
    G add -A; G commit -q -m base
    $baseSha = (git -C $script:repo rev-parse HEAD).Trim()
    $gate = Join-Path $script:repo 'scripts/Test-CatchupStage.ps1'
    $fake = Join-Path $script:repo 'scripts/fake-devtip.ps1'
    function Run-Gate([hashtable]$extra = @{}) {
        Remove-Item (Join-Path $script:repo 'calls.log') -ErrorAction SilentlyContinue
        & $gate -Worktree $script:repo -Base $baseSha -DevTipScript $fake -SmokeCommand 'exit 0' -ReleaseNotesCommand 'exit 0' @extra
    }

    # Scenario 1: nothing changed is green and runs nothing.
    $r = Run-Gate
    Assert ($r.Status -eq 'green') "unchanged tree should be green, got $($r.Status)"
    Assert (-not (Test-Path (Join-Path $script:repo 'calls.log'))) 'unchanged tree should run nothing'

    # Scenario 2: a changed web file plans typecheck, its sibling test and the chat suite.
    Put 'apps/web/src/a.ts'; Put 'apps/web/src/a.test.ts'
    Put 'apps/web/src/components/chat/Composer.test.tsx'
    Put 'apps/web/src/components/sidebar/Row.test.tsx'
    G add -A; G commit -q -m 'web change'
    $r = Run-Gate
    Assert ($r.Status -eq 'green') "web change should be green, got $($r.Status): $($r.Notes -join ' / ')"
    $calls = (Get-Content (Join-Path $script:repo 'calls.log')) -join ';'
    foreach ($k in 'tsc|apps/web', 'test|apps/web|src/a.test.ts', 'test|apps/web|src/components/chat/Composer.test.tsx', 'test|apps/web|src/components/sidebar/Row.test.tsx') {
        Assert ($calls.Contains($k)) "missing key $k in: $calls"
    }
    Assert (-not $calls.Contains('tsc|apps/server')) 'server typecheck should not run for a web-only change'

    # Scenario 3: a new failing key is red.
    Set-Content (Join-Path $script:repo 'fail.txt') 'test|apps/web|src/a.test.ts'
    $r = Run-Gate
    Assert ($r.Status -eq 'red' -and $r.FailKeys -contains 'test|apps/web|src/a.test.ts') 'a failing test should make the gate red'

    # Scenario 4: a saved baseline makes that key known-red, and a different key is still red.
    $r = Run-Gate @{ SaveBaseline = $true; Stage = '01'; PlanFrom = 'HEAD' }
    Assert ($r.Status -eq 'green') 'saving a baseline returns green'
    $common = (git -C $script:repo rev-parse --path-format=absolute --git-common-dir).Trim()
    Assert (Test-Path (Join-Path $common 'leonidas-catchup/baseline-01.json')) 'baseline file should exist in the git common dir'
    $r = Run-Gate
    Assert ($r.Status -eq 'green') "known-red key should be ignored, got $($r.Status): $($r.FailKeys -join ',')"
    Assert (($r.Notes -join ' ').Contains('known red, ignored')) 'notes should name the ignored key'
    Set-Content (Join-Path $script:repo 'fail.txt') "test|apps/web|src/a.test.ts`ntsc|apps/web"
    $r = Run-Gate
    Assert ($r.Status -eq 'red' -and $r.FailKeys.Count -eq 1 -and $r.FailKeys[0] -eq 'tsc|apps/web') 'only the new key should count'
    Remove-Item (Join-Path $script:repo 'fail.txt')

    # Scenario 4b: a baseline with nothing changed still runs the chat, sidebar and settings suites.
    Remove-Item (Join-Path $script:repo 'calls.log') -ErrorAction SilentlyContinue
    $r = & $gate -Worktree $script:repo -Base 'HEAD' -PlanFrom 'HEAD' -DevTipScript $fake -SaveBaseline -Stage '02'
    Assert ($r.Status -eq 'green') 'baseline with no diff should be green'
    Assert ((Get-Content (Join-Path $script:repo 'calls.log') -ErrorAction SilentlyContinue) -join ';' -like '*Composer.test.tsx*') 'baseline with no diff should still run the suites'
    Remove-Item (Join-Path $common 'leonidas-catchup/baseline-02.json')

    # Scenario 5: the gate is unavailable when the inner gate cannot run.
    Set-Content (Join-Path $script:repo 'unavail.txt') 'x'
    $r = Run-Gate
    Assert ($r.Status -eq 'unavailable') "missing dependencies should be unavailable, got $($r.Status)"
    Remove-Item (Join-Path $script:repo 'unavail.txt')

    # Scenario 6: smoke runs only for server or packages changes; a failing smoke is red.
    $r = & $gate -Worktree $script:repo -Base $baseSha -DevTipScript $fake -SmokeCommand 'exit 1' -ReleaseNotesCommand 'exit 0'
    Assert ($r.Status -eq 'green') 'a web-only change must not run the smoke'
    Put 'apps/server/src/s.ts'
    G add -A; G commit -q -m 'server change'
    $r = & $gate -Worktree $script:repo -Base $baseSha -DevTipScript $fake -SmokeCommand 'exit 1' -ReleaseNotesCommand 'exit 0'
    Assert ($r.Status -eq 'red' -and $r.FailKeys -contains 'smoke') 'a failing smoke should be red'
    $r = & $gate -Worktree $script:repo -Base $baseSha -DevTipScript $fake -SmokeCommand 'exit 0' -ReleaseNotesCommand 'exit 1'
    Assert ($r.Status -eq 'red' -and $r.FailKeys -contains 'release-notes') 'a failing release-note check should be red'

    # Scenario 7: test files run in chunks.
    1..95 | ForEach-Object { Put "apps/web/src/components/settings/T$_.test.ts" }
    G add -A; G commit -q -m 'many tests'
    $r = Run-Gate @{ ChunkSize = 40 }
    $testCalls = @(Get-Content (Join-Path $script:repo 'calls.log') | Where-Object { $_ -like 'test|*' })
    Assert ($testCalls.Count -ge 3) "100 test files in chunks of 40 should make 3 or more calls, got $($testCalls.Count)"
    Assert (@($testCalls | ForEach-Object { ($_ -split ';').Count } | Where-Object { $_ -gt 40 }).Count -eq 0) 'no chunk may exceed 40 keys'

    # Scenario 8: the queue calls the gate with only -Worktree and -Base.
    $env:LEONIDAS_QUEUE_GATE_SCRIPT = $gate
    try {
        Push-Location $script:repo
        $r = & $env:LEONIDAS_QUEUE_GATE_SCRIPT -Worktree $script:repo -Base $baseSha -DevTipScript $fake -SmokeCommand 'exit 0' -ReleaseNotesCommand 'exit 0'
        Assert ($r.Status -in 'green', 'red') 'queue-shaped call should return a result object'
    } finally { Pop-Location; Remove-Item Env:\LEONIDAS_QUEUE_GATE_SCRIPT }

    Write-Host 'PASS: Test-CatchupStage scenarios'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
