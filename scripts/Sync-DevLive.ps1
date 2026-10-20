<#
.SYNOPSIS
  Makes the fast C: dev copy (C:/lcw/dev-live) match the main checkout: the same commit, plus the
  same uncommitted work. The permanent dev server then shows every agent's latest edits.

.DESCRIPTION
  1. When the main checkout is on a newer commit, dev-live moves to it (reset --hard; dev-live holds
     no work of its own).
  2. Every uncommitted file in the main checkout is copied over, but only when its content differs,
     so unchanged files cause no hot reload. Uncommitted deletions are applied too.
  Safe to run often. The dev supervisor runs it every few seconds.
#>
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
$dst = 'C:/lcw/dev-live'
if (-not (Test-Path -LiteralPath $dst)) { throw "Missing $dst. Create it with: git worktree add $dst HEAD" }

# The target commit is the derived `dev` branch (origin/main plus every clean feature branch, built by
# Update-DevBranch.ps1). Without it, fall back to the main checkout's own commit.
$srcHead = (git -C $src rev-parse --verify -q dev)
if (-not $srcHead) { $srcHead = (git -C $src rev-parse HEAD) }
$srcHead = $srcHead.Trim()
# dev-live must not sit on a real branch: reset --hard would drag that branch's tip along with it.
if (git -C $dst symbolic-ref -q HEAD) { git -C $dst checkout -q --detach }
$dstHead = (git -C $dst rev-parse HEAD).Trim()
$moved = $false
if ($srcHead -ne $dstHead) {
    git -C $dst reset --hard -q $srcHead
    git -C $dst clean -fdq
    $moved = $true
}

$copied = 0; $removed = 0
$lines = git -C $src status --porcelain=v1 -uall
foreach ($line in $lines) {
    $f = $line.Substring(3).Trim('"')
    if ($f -match ' -> ') { $f = ($f -split ' -> ')[1].Trim('"') }
    $from = Join-Path $src $f
    $to = Join-Path $dst $f
    if ($line -match '^( D|D )') {
        if (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Recurse -Force; $removed++ }
        continue
    }
    if (-not (Test-Path -LiteralPath $from -PathType Leaf)) { continue }
    if ((Test-Path -LiteralPath $to -PathType Leaf) -and
        ((Get-Item -LiteralPath $to).Length -eq (Get-Item -LiteralPath $from).Length) -and
        ((Get-FileHash -LiteralPath $to -Algorithm SHA1).Hash -eq (Get-FileHash -LiteralPath $from -Algorithm SHA1).Hash)) { continue }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $to) | Out-Null
    Copy-Item -LiteralPath $from -Destination $to -Force
    $copied++
}
Write-Output "dev-live: $(if ($moved) { "moved to $($srcHead.Substring(0, 10)); " })copied $copied, removed $removed"
