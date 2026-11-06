<#
.SYNOPSIS
  Laptop side of Send-DevToLaptop.ps1. Copied to the laptop by the sender; do not run it by hand.
.DESCRIPTION
  -Mode List   prints every commit id the laptop repo already holds (branches and origin).
  -Mode Apply  loads each branch of the bundle into the laptop repo. A branch moves only forward:
               a branch the laptop changed itself stays as it is. Desktop `main` arrives as
               `desk/main`, because the laptop's own `main` is checked out and must not move.
#>
param(
    [Parameter(Mandatory)][ValidateSet('List', 'Apply')][string]$Mode,
    [string]$Bundle = 'C:/lcw/dev-sync/in.bundle',
    [string]$Repo = 'D:/Leonidas AIOS/projects/leonidas-app'
)
$ErrorActionPreference = 'Continue'   # git writes progress to stderr; check exit codes instead

if ($Mode -eq 'List') {
    git -C $Repo for-each-ref --format='%(objectname)' refs/heads refs/remotes/origin
    return
}

git -C $Repo bundle verify $Bundle 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Output 'error: bundle does not fit this repo'; exit 1 }
foreach ($line in (git -C $Repo bundle list-heads $Bundle)) {
    $sha, $ref = $line -split ' ', 2
    if ($ref -notmatch '^refs/heads/(?<name>.+)$') { continue }
    $dest = if ($Matches['name'] -eq 'main') { 'desk/main' } else { $Matches['name'] }
    # A branch the laptop has not changed since the last send may be replaced (the desktop rebased it).
    $current = git -C $Repo rev-parse -q --verify "refs/heads/$dest"
    $lastSent = git -C $Repo rev-parse -q --verify "refs/desk-sync/$dest"
    $plus = if ($current -and $current -eq $lastSent) { '+' } else { '' }
    $out = git -C $Repo fetch --no-tags --quiet $Bundle "${plus}${ref}:refs/heads/$dest" 2>&1
    if ($LASTEXITCODE -eq 0) {
        git -C $Repo update-ref "refs/desk-sync/$dest" $sha
        Write-Output "ok $dest"
    } else { Write-Output "skip $dest : $($out -join ' ')" }
}
