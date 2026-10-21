$ErrorActionPreference = 'Stop'
# Scenario tests for Update-DevBranch.ps1 / New-CleanBranch.ps1 in a throwaway repo (gate replaced by a fake).
# Run: pwsh -NoProfile -File scripts/Update-DevBranch.test.ps1

function Fail([string]$m) { throw "FAIL: $m" }
function Assert([bool]$c, [string]$m) { if (-not $c) { Fail $m } }
function G { git -C $script:repo @args 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ')" } }
function Commit([string]$file, [string]$text, [string]$msg) {
    Set-Content -LiteralPath (Join-Path $script:repo $file) -Value $text
    G add -A; G commit -q -m $msg
}

# Ten lines, so the two edited lines (2 and 8) are far enough apart not to share merge context.
function Shared([string]$l2, [string]$l8) { (1..10 | ForEach-Object { if ($_ -eq 2) { $l2 } elseif ($_ -eq 8) { $l8 } else { "l$_" } }) -join "`n" }

function New-TestRepo {
    $root = Join-Path $env:TEMP ("dev-branch-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $script:repo = Join-Path $root 'repo'
    New-Item -ItemType Directory -Force -Path (Join-Path $script:repo 'scripts') | Out-Null
    G init -q -b main; G config user.name test; G config user.email test@example.com
    Copy-Item (Join-Path $PSScriptRoot 'Update-DevBranch.ps1'), (Join-Path $PSScriptRoot 'New-CleanBranch.ps1') (Join-Path $script:repo 'scripts')
    # Fake gate: red while any BAD*.txt is in the tree.
    Set-Content (Join-Path $script:repo 'scripts/fake-gate.ps1') 'param($Worktree, $Base, $Keys)
$bad = @(Get-ChildItem -LiteralPath $Worktree -Filter "BAD*.txt" -File -ErrorAction SilentlyContinue)
[pscustomobject]@{ Status = $(if ($bad) { "red" } else { "green" }); FailKeys = $(if ($bad) { @("bad|x") } else { @() }); Notes = @() }'
    Set-Content (Join-Path $script:repo 'shared.txt') (Shared 'l2' 'l8')
    G add -A; G commit -q -m base
    $env:LEONIDAS_DEV_MERGE_WORKTREE = Join-Path $root 'merge'
    $env:LEONIDAS_DEV_REBASE_WORKTREE = Join-Path $root 'rebase'
    $env:LEONIDAS_DEV_GATE_SCRIPT = Join-Path $script:repo 'scripts/fake-gate.ps1'
    return $root
}
function Run-Update { (pwsh -NoProfile -File (Join-Path $script:repo 'scripts/Update-DevBranch.ps1') -Force 2>&1 | Out-String).Trim() }
function Dev-File([string]$f) { (git -C $script:repo show "dev:$f" 2>$null) }

# Scenario 1: a bad branch is bisected out, a duplicate-commit branch is rebuilt, a real conflict is reported.
$root = New-TestRepo
G checkout -q -b good main;   Commit 'good.txt' 'g' 'good'
G checkout -q -b bad main;    Commit 'BAD.txt' 'b' 'bad'
G checkout -q -b dupe main;   Commit 'shared.txt' (Shared 'main-change' 'l8') 'dupe: same patch as main'
Commit 'dupe.txt' 'd' 'dupe: own work'
Commit 'shared.txt' (Shared 'branch-final' 'l8') 'dupe: edits the same line again'
G checkout -q -b hard main;   Commit 'shared.txt' (Shared 'l2' 'branch-hard') 'hard'
G checkout -q main
Commit 'shared.txt' (Shared 'main-change' 'l8') 'main: line 2'
Commit 'shared.txt' (Shared 'main-change' 'main-hard') 'main: line 8'
G update-ref refs/remotes/origin/main HEAD
$out = Run-Update
Write-Host $out
Assert ((git -C $repo ls-tree -r dev --name-only) -contains 'good.txt') 'good branch missing from dev'
Assert ((git -C $repo ls-tree -r dev --name-only) -notcontains 'BAD.txt') 'bad branch reached dev'
Assert ((git -C $repo ls-tree -r dev --name-only) -contains 'dupe.txt') 'rebuilt branch missing from dev'
Assert ((Dev-File 'shared.txt')[1] -eq 'branch-final' -and (Dev-File 'shared.txt')[7] -eq 'main-hard') 'shared.txt does not hold the rebuilt result'
$status = Get-Content -Raw (Join-Path $repo '.t3/dev-branch-status.md')
Assert ($status -match 'bad \(failing: bad\|x\)') 'status does not name the gate-dropped branch'
Assert ($status -match 'hard: commit') 'status does not name the unresolved conflict'
$again = (pwsh -NoProfile -File (Join-Path $repo 'scripts/Update-DevBranch.ps1') 2>&1 | Out-String).Trim()
Assert ($again -match 'unchanged') "unchanged run should skip, got: $again"
Write-Host 'scenario 1 ok'

# Scenario 2: more bad branches than the drop limit: dev keeps its last good tip.
$root2 = New-TestRepo
G checkout -q -b good main;   Commit 'good.txt' 'g' 'good'
G checkout -q main; G branch -f dev good
$before = (git -C $repo rev-parse dev).Trim()
foreach ($i in 1..4) { G checkout -q -b "bad$i" main; Commit "BAD$i.txt" 'b' "bad $i" }
G checkout -q main
G update-ref refs/remotes/origin/main HEAD
$out2 = Run-Update
Write-Host $out2
Assert ($out2 -match 'HELD') "expected the tip to be held, got: $out2"
Assert ((git -C $repo rev-parse dev).Trim() -eq $before) 'dev moved although the gate stayed red'
Write-Host 'scenario 2 ok'

Remove-Item -LiteralPath $root, $root2 -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item Env:LEONIDAS_DEV_MERGE_WORKTREE, Env:LEONIDAS_DEV_REBASE_WORKTREE, Env:LEONIDAS_DEV_GATE_SCRIPT
Write-Host 'Update-DevBranch tests passed'
