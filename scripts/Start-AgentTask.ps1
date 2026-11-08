<#
.SYNOPSIS
  Claim a task and give this agent its own worktree. A second claim on the same task gets "taken".
.DESCRIPTION
  The claim is a file in the shared git folder: <git-common-dir>/leonidas-claims/<task>.json.
  It is created with CreateNew, so exactly one process wins, even when 30 agents start at once.
  The claim records owner, worktree, branch and time. Then the winner gets worktree <Root>/<task>
  on a new branch task/<task>, cut from origin/main.
  Exit 0 = claimed (last line: "claimed: ..."). Exit 2 = taken (last line: "taken: ..."). Exit 1 = error.
  In a builder's AIOS, -Card <name> must name an existing tasks/<name>.md card; the claim is refused without one.
  Land the work with scripts/Invoke-MergeQueue.ps1 -Branch task/<task>. That also releases the claim.
.EXAMPLE
  pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task fix-sidebar-scroll -Card fix-the-sidebar-scroll -Owner claude-7
  pwsh -NoProfile -File scripts/Start-AgentTask.ps1 -Task fix-sidebar-scroll -Release
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Task,
    [string]$Owner = "$env:USERNAME-$PID",
    [string]$Root = $(if ($env:LEONIDAS_WORKTREE_ROOT) { $env:LEONIDAS_WORKTREE_ROOT } else { 'C:/lcw' }),
    [string]$Card,
    [switch]$Release,
    [switch]$NoWorktree
)
$ErrorActionPreference = 'Stop'
# The task id becomes a file name, a folder and a branch name: allow only a plain slug.
if ($Task -notmatch '^[a-z0-9][a-z0-9-]{0,79}$') { Write-Error "Task must be a lowercase slug (a-z, 0-9, -): '$Task'"; exit 1 }

$common = (git rev-parse --path-format=absolute --git-common-dir).Trim()
if ($LASTEXITCODE) { Write-Error 'Run this inside the repo or one of its worktrees.'; exit 1 }
$dir = Join-Path $common 'leonidas-claims'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir "$Task.json"

if ($Release) {
    Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
    "released: $Task"
    exit 0
}

# In a builder's AIOS (two folders above this checkout), no card means no claim: work starts from a task card.
$aios = Split-Path (Split-Path (Split-Path $common))
if ($aios -and (Test-Path -LiteralPath (Join-Path $aios 'AGENTS.md')) -and (Test-Path -LiteralPath (Join-Path $aios 'tasks'))) {
    if (-not $Card -or -not (Test-Path -LiteralPath (Join-Path $aios "tasks/$Card.md"))) {
        Write-Error "No task card: pass -Card <name> for an existing tasks/<name>.md. Create one first: pwsh $aios/scripts/New-Task.ps1 -Name '<verb-first title>'"
        exit 1
    }
}

$worktree = (Join-Path $Root $Task) -replace '\\', '/'
$branch = "task/$Task"
try {
    $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
} catch [System.IO.IOException] {
    # Another agent holds it. Its file can be empty for a few ms while it is written.
    $claim = $null
    foreach ($i in 1..20) {
        $raw = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
        if ($raw) { try { $claim = $raw | ConvertFrom-Json; break } catch { } }
        Start-Sleep -Milliseconds 50
    }
    if (-not $claim) { "taken: $Task (claim is being written)"; exit 2 }
    $at = [datetime]$claim.claimedAt
    # A new claim has no worktree for a few seconds, so only an old claim with no worktree is stale.
    $stale = if ($claim.worktree -and ((Get-Date) - $at).TotalMinutes -gt 10 -and -not (Test-Path -LiteralPath $claim.worktree)) { ' (stale: worktree is gone; run with -Release to free it)' } else { '' }
    "taken: $Task by $($claim.owner) in $($claim.worktree) since $($at.ToString('yyyy-MM-dd HH:mm:ss'))$stale"
    exit 2
}
try {
    $json = [ordered]@{ task = $Task; owner = $Owner; worktree = $worktree; branch = $branch; claimedAt = (Get-Date).ToString('o'); card = $Card } | ConvertTo-Json
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $stream.Write($bytes, 0, $bytes.Length)
} finally { $stream.Dispose() }

if (-not $NoWorktree) {
    # Parallel fetches can collide on ref locks; an old origin/main is still a valid base.
    git fetch -q origin main 2>$null
    # Parallel worktree adds collide on git lock files: retry with a random wait.
    foreach ($try in 1..8) {
        $err = git worktree add -q $worktree -b $branch origin/main 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { break }
        if ($err -notmatch '\.lock|lock') { break }
        git worktree prune 2>$null
        # Delete a half-made branch only when it holds no work (it still points at origin/main).
        if ((git rev-parse -q --verify "refs/heads/$branch" 2>$null) -eq (git rev-parse origin/main)) { git branch -q -D $branch 2>$null }
        Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 600)
    }
    if ($LASTEXITCODE) {
        Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
        Write-Error "Claim released: git worktree add $worktree -b $branch failed: $($err.Trim())"
        exit 1
    }
    # In a builder's AIOS (two folders above this checkout), link the AIOS skills this project uses into the new
    # worktree, git-excluded. A worktree holds only committed skills otherwise. A failure never blocks the claim.
    try {
        $linker = Join-Path $worktree 'scripts/Sync-DefaultSkills.ps1'
        if ($aios -and (Test-Path -LiteralPath (Join-Path $aios 'AGENTS.md')) -and (Test-Path -LiteralPath (Join-Path $aios 'projects')) -and (Test-Path -LiteralPath $linker)) {
            & $linker -RepoPath $aios -SourceRoot $aios -ProjectPath $worktree -SkillsOnly *>$null
        }
    } catch { Write-Warning "AIOS skills were not linked into ${worktree}: $($_.Exception.Message)" }
}
"claimed: $Task by $Owner in $worktree on $branch"
exit 0
