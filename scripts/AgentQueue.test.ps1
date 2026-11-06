$ErrorActionPreference = 'Stop'
# Scenario test for Start-AgentTask.ps1 and Invoke-MergeQueue.ps1 in a throwaway repo with a bare origin.
# Gate replaced by a fake (red while BAD.txt is in the tree). Run: pwsh -NoProfile -File scripts/AgentQueue.test.ps1

function Fail([string]$m) { throw "FAIL: $m" }
function Assert([bool]$c, [string]$m) { if (-not $c) { Fail $m } else { "ok: $m" } }
function G([string]$dir) { git -C $dir @args 2>&1 | Out-Null; if ($LASTEXITCODE) { Fail "git $($args -join ' ') in $dir" } }

$root = Join-Path $env:TEMP ('agent-queue-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$origin = Join-Path $root 'origin.git'; $repo = Join-Path $root 'repo'
New-Item -ItemType Directory -Force -Path (Join-Path $repo 'scripts') | Out-Null
git init -q --bare -b main $origin
G $repo init -q -b main; G $repo config user.name test; G $repo config user.email test@example.com
Set-Content (Join-Path $repo 'base.txt') 'base'; G $repo add base.txt; G $repo commit -q -m base
G $repo remote add origin $origin; G $repo push -q origin main
Copy-Item (Join-Path $PSScriptRoot 'Start-AgentTask.ps1'), (Join-Path $PSScriptRoot 'Invoke-MergeQueue.ps1') (Join-Path $repo 'scripts')
Set-Content (Join-Path $root 'fake-gate.ps1') 'param($Worktree, $Base)
$bad = Test-Path -LiteralPath (Join-Path $Worktree "BAD.txt")
[pscustomobject]@{ Status = $(if ($bad) { "red" } else { "green" }); FailKeys = $(if ($bad) { @("bad") } else { @() }); Notes = @() }'
$env:LEONIDAS_WORKTREE_ROOT = Join-Path $root 'wt'
$env:LEONIDAS_LAND_WORKTREE = Join-Path $root 'land'
$env:LEONIDAS_QUEUE_GATE_SCRIPT = Join-Path $root 'fake-gate.ps1'
$claims = Join-Path $repo '.git/leonidas-claims'

# Runs one agent step in its own process. All agents wait on a go file, so they start at the same moment.
$go = Join-Path $root 'go'
function Start-Agent([string]$script, [string[]]$argv) {
    Start-Job -ArgumentList $repo, $go, $script, $argv -ScriptBlock {
        param($repo, $go, $script, $argv)
        Set-Location $repo
        while (-not (Test-Path $go)) { Start-Sleep -Milliseconds 5 }
        $out = pwsh -NoProfile -File (Join-Path $repo "scripts/$script") @argv 2>&1 | Out-String
        [pscustomobject]@{ Exit = $LASTEXITCODE; Out = $out.Trim() }
    }
}

try {
    # 1. Three agents claim at once, two of them the same task.
    $jobs = @(
        Start-Agent 'Start-AgentTask.ps1' @('-Task', 'alpha', '-Owner', 'agent-1')
        Start-Agent 'Start-AgentTask.ps1' @('-Task', 'beta', '-Owner', 'agent-2')
        Start-Agent 'Start-AgentTask.ps1' @('-Task', 'beta', '-Owner', 'agent-3')
    )
    Start-Sleep -Seconds 3; New-Item -ItemType File $go | Out-Null
    $r = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
    $r | ForEach-Object { "  agent: exit $($_.Exit) | $($_.Out.Split("`n")[-1])" }
    $taken = @($r | Where-Object Exit -eq 2); $claimed = @($r | Where-Object Exit -eq 0)
    Assert ($taken.Count -eq 1 -and $claimed.Count -eq 2) 'two agents claim, one gets taken'
    Assert ($taken[0].Out -match '^taken: beta by agent-[23] in .+ since ') 'taken answer names owner, worktree and time'
    $betaOwner = (Get-Content (Join-Path $claims 'beta.json') -Raw | ConvertFrom-Json).owner
    Assert ($taken[0].Out -match "by $betaOwner ") 'taken answer names the agent that holds the claim'
    $wtA = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'alpha'; $wtB = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'beta'
    Assert ((Test-Path $wtA) -and (Test-Path $wtB)) 'each winner has its own worktree'

    # 2. Both winners commit and submit at the same moment. The queue lands them one at a time.
    Set-Content (Join-Path $wtA 'alpha.txt') 'a'; G $wtA add alpha.txt; G $wtA commit -q -m 'alpha work'
    Set-Content (Join-Path $wtB 'beta.txt') 'b'; G $wtB add beta.txt; G $wtB commit -q -m 'beta work'
    Remove-Item $go
    $jobs = @(
        Start-Agent 'Invoke-MergeQueue.ps1' @('-Branch', 'task/alpha', '-Task', 'alpha', '-Wait', '-WaitMinutes', '2')
        Start-Agent 'Invoke-MergeQueue.ps1' @('-Branch', 'task/beta', '-Task', 'beta', '-Wait', '-WaitMinutes', '2')
    )
    Start-Sleep -Seconds 3; New-Item -ItemType File $go | Out-Null
    $r = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
    $r | ForEach-Object { "  submit: exit $($_.Exit) | $($_.Out -replace "`r?`n", ' / ')" }
    Assert (@($r | Where-Object Exit -eq 0).Count -eq 2) 'both branches land'
    $results = @(Get-ChildItem (Join-Path $repo '.git/leonidas-queue/done') -Filter *.json | Sort-Object Name | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
    $first = $results[0].branch; $second = $results[1].branch
    git -C $repo merge-base --is-ancestor $results[0].sha $results[1].sha
    Assert ($LASTEXITCODE -eq 0 -and $results[0].sha -ne $results[1].sha) "queue lands in submit order ($first, then $second on top of it)"
    $files = @(git -C $repo ls-tree --name-only origin/main)
    Assert ($files -contains 'alpha.txt' -and $files -contains 'beta.txt') 'origin/main holds the work of both agents'
    Assert ((git -C $repo rev-parse origin/main).Trim() -eq $results[1].sha) 'origin/main tip is the second landed sha'
    Assert (-not (Test-Path (Join-Path $claims 'alpha.json')) -and -not (Test-Path (Join-Path $claims 'beta.json'))) 'landing releases both claims'
    Assert (-not (Test-Path $wtA) -and -not (Test-Path $wtB)) 'landing removes both clean worktrees'
    Assert (-not (git -C $repo branch --list 'task/*')) 'landing deletes both merged branches'

    # 3. A red branch never reaches origin/main, and its claim stays with its agent.
    # Every step runs inside the test repo: the scripts act on the repo of the current folder.
    Push-Location $repo
    try {
        pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task gamma -Owner agent-4 | Out-Null
        $wtG = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'gamma'
        Set-Content (Join-Path $wtG 'BAD.txt') 'x'; G $wtG add BAD.txt; G $wtG commit -q -m 'gamma bad'
        $tip = (git -C $repo rev-parse origin/main).Trim()
        $out = pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Branch task/gamma -Task gamma -Wait -WaitMinutes 1 | Out-String
        $exit = $LASTEXITCODE
    } finally { Pop-Location }
    Assert ($exit -eq 4 -and $out -match 'result: red') 'red branch is rejected'
    G $repo fetch -q origin
    Assert ((git -C $repo rev-parse origin/main).Trim() -eq $tip) 'origin/main does not move for a red branch'
    Assert (Test-Path (Join-Path $claims 'gamma.json')) 'red branch keeps its claim'
    'PASS'
} finally {
    Get-Job | Remove-Job -Force
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
