<#
.SYNOPSIS
  Rebuilds a feature branch as `rebase/<branch>`: only the commits origin/main does not already have,
  replayed on top of it. Used when the branch conflicts with the current dev tip.
.DESCRIPTION
  - Commits whose change is already on -Onto (same patch, different hash) are dropped, so a commit that
    was cherry-picked to main twice no longer conflicts.
  - `git rerere` replays any conflict resolution a person or agent committed before. A conflict it cannot
    resolve stops the rebuild: the result names the commit and files, and nothing is left half done.
  - Works in its own worktree (default C:/lcw/dev-rebase). The source branch is never changed.
  - Caches the verdict per (branch tip, -Onto tip), so an unchanged branch costs nothing on the next run.
  Returns: Status (clean | conflict | nothing), Branch, Sha, Picked, Dropped, ConflictCommit, ConflictFiles.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Branch,
    [Parameter(Mandatory)][string]$Onto,
    [string]$Worktree = $(if ($env:LEONIDAS_DEV_REBASE_WORKTREE) { $env:LEONIDAS_DEV_REBASE_WORKTREE } else { 'C:/lcw/dev-rebase' })
)

$ErrorActionPreference = 'Stop'
$common = (git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir).Trim()
$repo = Split-Path -Parent $common
$branchSha = (git -C $repo rev-parse --verify $Branch).Trim()
$ontoSha = (git -C $repo rev-parse --verify $Onto).Trim()
$cacheFile = Join-Path $common 'leonidas-clean-cache.json'
$cache = @{}
if (Test-Path -LiteralPath $cacheFile) {
    (Get-Content -LiteralPath $cacheFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cache[$_.Name] = $_.Value }
}
$hit = $cache[$Branch]
if ($hit -and $hit.BranchSha -eq $branchSha -and $hit.OntoSha -eq $ontoSha) { return $hit }

git -C $repo config rerere.enabled true
git -C $repo config rerere.autoupdate true
if (-not (Test-Path -LiteralPath $Worktree)) { git -C $repo worktree add --detach -f $Worktree $ontoSha --quiet 2>&1 | Out-Null }
git -C $Worktree cherry-pick --abort 2>&1 | Out-Null
git -C $Worktree reset --hard -q
git -C $Worktree clean -fdq
$target = "rebase/$Branch"
git -C $Worktree checkout -q -B $target $ontoSha

$new = @(git -C $repo cherry $ontoSha $branchSha | Where-Object { $_ -like '+ *' } | ForEach-Object { $_.Substring(2) })
$all = @(git -C $repo rev-list --reverse --no-merges "$ontoSha..$branchSha")
$dropped = $all.Count - $new.Count
$result = [ordered]@{
    Status = 'clean'; Branch = $target; Sha = ''; Picked = 0; Dropped = $dropped
    ConflictCommit = ''; ConflictFiles = @(); BranchSha = $branchSha; OntoSha = $ontoSha
}
foreach ($sha in ($all | Where-Object { $_ -in $new })) {
    git -C $Worktree cherry-pick $sha 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $unresolved = @(git -C $Worktree diff --name-only --diff-filter=U)
        if ($unresolved.Count -eq 0) {
            # rerere resolved every hunk (or the pick became empty).
            $env:GIT_EDITOR = 'true'
            git -C $Worktree cherry-pick --continue 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { git -C $Worktree cherry-pick --skip 2>&1 | Out-Null; $result.Dropped++; continue }
        } else {
            $result.Status = 'conflict'
            $result.ConflictCommit = $sha
            $result.ConflictFiles = $unresolved
            git -C $Worktree cherry-pick --abort 2>&1 | Out-Null
            break
        }
    }
    $result.Picked++
}
if ($result.Status -eq 'clean' -and $result.Picked -eq 0) { $result.Status = 'nothing' }
if ($result.Status -eq 'clean') { $result.Sha = (git -C $Worktree rev-parse HEAD).Trim() }
else {
    git -C $Worktree checkout -q --detach $ontoSha
    git -C $repo branch -D $target 2>&1 | Out-Null
}
$obj = [pscustomobject]$result
$cache[$Branch] = $obj
Set-Content -LiteralPath $cacheFile -Value ($cache | ConvertTo-Json -Depth 5)
$obj
