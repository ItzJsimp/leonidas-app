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
New-Item -ItemType Directory -Force (Join-Path $repo '.git/info') | Out-Null; Set-Content (Join-Path $repo '.git/info/exclude') 'node_modules/'
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

    # 3. A worktree that its agent still uses lands, but the queue does not touch its files.
    Push-Location $repo
    try {
        pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task delta -Owner agent-5 | Out-Null
        $wtD = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'delta'
        Set-Content (Join-Path $wtD 'delta.txt') 'd'; G $wtD add delta.txt; G $wtD commit -q -m 'delta work'
        New-Item -ItemType Directory (Join-Path $wtD 'node_modules') | Out-Null
        Set-Content (Join-Path $wtD 'node_modules/ignored.txt') 'i'
        $busy = [System.IO.File]::Open((Join-Path $wtD 'delta.txt'), 'Open', 'Read', 'Read')
        $out = pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Branch task/delta -Task delta -Wait -WaitMinutes 1 | Out-String
        $exit = $LASTEXITCODE
        $busy.Dispose()
    } finally { Pop-Location }
    Assert ($exit -eq 0 -and $out -match 'result: landed') 'a busy worktree still lands'
    Assert ($out -match 'kept \(in use')'the queue reports the busy worktree as kept'
    Assert ((Test-Path (Join-Path $wtD 'node_modules/ignored.txt')) -and (Test-Path (Join-Path $wtD '.git'))) 'the busy worktree keeps every file'

    # 4. A red branch never reaches origin/main, and its claim stays with its agent.
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
    # 5. A worktree that something detached (Test-DevTip.ps1 does) is still found and removed, and a
    # link inside it (a junction to a folder outside, here and in a deep folder) never costs the target a file.
    Push-Location $repo
    try {
        pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task epsilon -Owner agent-6 | Out-Null
        $wtE = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'epsilon'
        Set-Content (Join-Path $wtE 'epsilon.txt') 'e'; G $wtE add epsilon.txt; G $wtE commit -q -m 'epsilon work'
        G $wtE checkout -q --detach
        $outside = Join-Path $root 'outside-skill'
        New-Item -ItemType Directory -Force (Join-Path $outside 'sub') | Out-Null
        Set-Content (Join-Path $outside 'SKILL.md') 'keep'; Set-Content (Join-Path $outside 'sub/a.txt') 'keep'
        New-Item -ItemType Directory -Force (Join-Path $wtE 'node_modules/deep') | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $wtE 'node_modules/skill-link') -Target $outside | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $wtE 'node_modules/deep/link') -Target $outside | Out-Null
        $out = pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Branch task/epsilon -Task epsilon -Wait -WaitMinutes 1 | Out-String
        $exit = $LASTEXITCODE
    } finally { Pop-Location }
    Assert ($exit -eq 0 -and $out -match 'result: landed') 'a detached worktree lands'
    Assert (-not (Test-Path $wtE)) 'the detached worktree is removed'
    Assert ($out -match 'epsilon removed') 'the queue says it removed the detached worktree'
    Assert ((Test-Path (Join-Path $outside 'SKILL.md')) -and (Test-Path (Join-Path $outside 'sub/a.txt'))) 'links in the worktree never cost the target a file'
    # 6. Force directory deletion to throw after a successful push in the copied queue script.
    $queueScript = Join-Path $repo 'scripts/Invoke-MergeQueue.ps1'
    $source = Get-Content -LiteralPath $queueScript -Raw
    $delete = '[System.IO.Directory]::Delete((Resolve-Path -LiteralPath $gone).ProviderPath, $true)'
    Assert ($source.Contains($delete)) 'the deletion fault targets the real cleanup operation'
    Set-Content -LiteralPath $queueScript ($source.Replace($delete, 'throw "injected directory removal failure"'))
    Push-Location $repo
    try {
        pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task zeta -Owner agent-7 | Out-Null
        $wtZ = Join-Path $env:LEONIDAS_WORKTREE_ROOT 'zeta'
        Set-Content (Join-Path $wtZ 'zeta.txt') 'z'
        G $wtZ add zeta.txt
        G $wtZ commit -q -m 'zeta work'
        $expectedSha = (git -C $wtZ rev-parse HEAD).Trim()
        $out = pwsh -NoProfile -File scripts/Invoke-MergeQueue.ps1 -Branch task/zeta -Task zeta -Wait -WaitMinutes 1 | Out-String
        $exit = $LASTEXITCODE
    } finally { Pop-Location }
    $result = Get-ChildItem (Join-Path $repo '.git/leonidas-queue/done') -Filter *.json |
        ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json } |
        Where-Object branch -eq 'task/zeta'
    Assert ($exit -eq 0 -and $result.status -eq 'landed') 'directory removal failure keeps the successful outcome'
    Assert ($result.sha -eq $expectedSha) 'directory removal failure preserves the landed SHA'
    Assert ((git -C $repo ls-remote origin refs/heads/main) -match $expectedSha) 'the recorded SHA reached origin'
    Assert ($out -match 'injected directory removal failure') 'the cleanup failure remains visible'
    Assert (@(Get-ChildItem (Split-Path $wtZ) -Directory -Filter 'zeta.landed-*').Count -eq 1) 'failed cleanup retains the directory'
    'PASS'
} finally {
    Get-Job | Remove-Job -Force
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
