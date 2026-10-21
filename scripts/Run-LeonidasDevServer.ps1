<#
.SYNOPSIS
  Keeps the isolated Leonidas Code dev server (server + web, no window) running. Started at
  sign-in by the "Leonidas Code Dev Server" scheduled task; restarts the server if it exits.
  Output goes to .t3/dev-server.log and dev-server.err.log (git-ignored, replaced each start).
#>
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$devHome = Join-Path $repoRoot '.t3'
$log = Join-Path $devHome 'dev-server.log'
New-Item -ItemType Directory -Force -Path $devHome | Out-Null
$pwsh = (Get-Process -Id $PID).Path
$serverPort = 23773
$webPort = 15733
$webFrozenSeconds = 90    # a cold compile can block Vite for tens of seconds; longer than that is a freeze
$startGraceSeconds = 180   # first start can take a while (install repair, cold caches)
$downRestartSeconds = 60  # longer than a normal hot-reload restart

# An interrupted install can leave a patched package without its patch (pnpm still thinks it is
# current), which breaks the web page. For every entry in pnpm-workspace.yaml patchedDependencies,
# check that one added line from each file in the patch is present in each installed copy; rebuild
# the copies that are not. Packages that are not installed on this machine (mobile only) are skipped.
function Get-UnpatchedPackageDirs {
    $store = [IO.Path]::GetFullPath((Join-Path $repoRoot 'node_modules/.pnpm'))
    $yaml = Join-Path $repoRoot 'pnpm-workspace.yaml'
    $bad = [System.Collections.Generic.List[string]]::new()
    $inBlock = $false
    foreach ($line in Get-Content -LiteralPath $yaml) {
        if ($line -match '^patchedDependencies:') { $inBlock = $true; continue }
        if ($inBlock -and $line -match '^\S') { break }
        if (-not ($inBlock -and $line -match '^\s+"?(?<spec>[^":\s]+)"?:\s*(?<patch>\S+\.patch)\s*$')) { continue }
        $spec = $Matches['spec']; $patchFile = Join-Path $repoRoot $Matches['patch']
        $at = $spec.LastIndexOf('@'); $name = $spec.Substring(0, $at); $version = $spec.Substring($at + 1)
        if (-not (Test-Path -LiteralPath $patchFile)) { continue }
        $dirs = Get-ChildItem -LiteralPath $store -Directory -Filter ("{0}@{1}_*" -f $name.Replace('/', '+'), $version) -ErrorAction SilentlyContinue
        if (-not $dirs) { continue }
        # One marker per patched file: its first added line with real content.
        $markers = @{}; $current = $null
        foreach ($p in Get-Content -LiteralPath $patchFile) {
            if ($p -match '^diff --git a/(?<f>\S+) b/') { $current = $Matches['f']; continue }
            if ($current -and -not $markers.ContainsKey($current) -and $p -match '^\+(?!\+\+)(?<t>.*\S.*)$' -and $Matches['t'].Trim().Length -ge 6) {
                $markers[$current] = $Matches['t']
            }
        }
        foreach ($d in $dirs) {
            $root = Join-Path $d.FullName "node_modules/$name"
            foreach ($f in $markers.Keys) {
                $file = Join-Path $root $f
                if (-not (Test-Path -LiteralPath $file) -or -not (Select-String -LiteralPath $file -SimpleMatch -Pattern $markers[$f] -Quiet)) {
                    $bad.Add($d.FullName); break
                }
            }
        }
    }
    return $bad
}

function Repair-PatchedPackages {
    $bad = @(Get-UnpatchedPackageDirs)
    if ($bad.Count -eq 0) { return }
    Add-Content -LiteralPath $log -Value "[supervisor] $($bad.Count) patched package copies are missing their patch; rebuilding: $(($bad | Split-Path -Leaf) -join ', ')"
    foreach ($d in $bad) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
    $env:CI = 'true'
    $env:LEONIDAS_ALLOW_MAIN_INSTALL = '1'   # this repair is the one approved install in the main checkout
    & npx --yes pnpm@11.10.0 install --frozen-lockfile --prefer-offline *>> $log
}

# The version label in the app's top-left comes from git. A hidden task has a short PATH and a slow
# disk, so computing it inside vite failed silently and the app showed the package number (0.0.45).
# Compute it here, from the main branch (the dev copy can lag behind it), and pass it down.
function Get-DevVersionLabel {
    try {
        $common = (& git -C $repoRoot rev-parse --path-format=absolute --git-common-dir 2>$null).Trim()
        # origin/main is the published line (Update-DevBranch.ps1 fetches it), so a new publish moves the label.
        $describe = (& git --git-dir=$common describe --tags --long --match 'v0.*' origin/main 2>$null)
        if (-not $describe) { $describe = (& git --git-dir=$common describe --tags --long --match 'v0.*' main 2>$null) }
        $describe = "$describe".Trim()
        if ($describe -match '^v?(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$') {
            if ($Matches[2] -eq '0') { return $Matches[1] }
            return "$($Matches[1])+$($Matches[2])"
        }
    } catch { }
    return ''
}

# Keep this copy equal to the main checkout (same commit plus its uncommitted work), so every
# agent's change shows up here. The sync script of the main checkout does the work; it copies only
# files whose content differs, so an idle sync causes no hot reload.
function Get-MainRoot {
    try {
        $common = (& git -C $repoRoot rev-parse --path-format=absolute --git-common-dir 2>$null).Trim()
        return (Split-Path -Parent $common)
    } catch { return $null }
}
# Every synced server file restarts the dev server (about a minute). When several agents edit main,
# syncing file by file means one restart after another and changes that land one at a time. So wait
# until main has been quiet for $syncQuietSeconds, then sync everything in one batch.
$syncQuietSeconds = 20
$script:lastSignature = ''
$script:signatureChangedAt = Get-Date
$script:syncedSignature = ''
function Get-MainSignature([string]$mainRoot) {
    $head = "$(& git -C $mainRoot rev-parse HEAD 2>$null)|$(& git -C $mainRoot rev-parse --verify -q dev 2>$null)"
    $lines = @(& git -C $mainRoot status --porcelain=v1 -uall 2>$null)
    $newest = 0
    foreach ($line in $lines) {
        $f = $line.Substring(3).Trim('"')
        $item = Get-Item -LiteralPath (Join-Path $mainRoot $f) -ErrorAction SilentlyContinue
        if ($item -and -not $item.PSIsContainer -and $item.LastWriteTimeUtc.Ticks -gt $newest) { $newest = $item.LastWriteTimeUtc.Ticks }
    }
    return "$head|$($lines.Count)|$newest"
}
# Rebuild the `dev` branch (origin/main plus every clean feature branch) so the sync below shows
# all work in progress and every publish. Rate-limited: git work every 30 s, a fetch every 5 minutes.
$script:lastDevBuild = [datetime]::MinValue
$script:lastDevFetch = [datetime]::MinValue
$script:syncMoved = $false
function Update-DevBranchRef([string]$mainRoot, [switch]$Force) {
    $builder = Join-Path $mainRoot 'scripts/Update-DevBranch.ps1'
    if (-not (Test-Path -LiteralPath $builder)) { return }
    if (-not $Force -and ((Get-Date) - $script:lastDevBuild).TotalSeconds -lt 30) { return }
    $script:lastDevBuild = Get-Date
    $fetch = ((Get-Date) - $script:lastDevFetch).TotalMinutes -ge 5
    if ($fetch) { $script:lastDevFetch = Get-Date }
    try {
        # Detached: the gate takes minutes and must not stall the sync of everyday edits. The builder's
        # own mutex keeps runs from overlapping; its one-line result goes to dev-branch-update.log.
        $updateLog = Join-Path $devHome 'dev-branch-update.log'
        Start-Process -FilePath $pwsh -WindowStyle Hidden -ArgumentList (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $builder + '"')) + @(if ($fetch) { '-Fetch' })) `
            -RedirectStandardOutput $updateLog -RedirectStandardError "$updateLog.err"
        $out = 'unchanged'
        if ($out -notmatch 'unchanged') { Add-Content -LiteralPath $log -Value "[supervisor] $out" }
    } catch { Add-Content -LiteralPath $log -Value "[supervisor] dev branch update failed: $($_.Exception.Message)" }
}
function Sync-FromMain([switch]$Force) {
    $mainRoot = Get-MainRoot
    if (-not $mainRoot) { return }
    Update-DevBranchRef $mainRoot -Force:$Force
    $syncScript = Join-Path $mainRoot 'scripts/Sync-DevLive.ps1'
    if (-not (Test-Path -LiteralPath $syncScript)) { return }
    try {
        $signature = Get-MainSignature $mainRoot
        if ($signature -ne $script:lastSignature) { $script:lastSignature = $signature; $script:signatureChangedAt = Get-Date }
        if (-not $Force) {
            if ($signature -eq $script:syncedSignature) { return }
            if (((Get-Date) - $script:signatureChangedAt).TotalSeconds -lt $syncQuietSeconds) { return }
        }
        $out = (& $syncScript 2>&1) -join ' '
        $script:syncedSignature = $signature
        if ($out -match 'moved to') { $script:syncMoved = $true }
        if ($out -match 'moved to|copied [1-9]|removed [1-9]') { Add-Content -LiteralPath $log -Value "[supervisor] $out" }
    } catch { Add-Content -LiteralPath $log -Value "[supervisor] sync from main failed: $($_.Exception.Message)" }
}

$env:LEONIDAS_DEV_ICON = '1'   # the dev web server serves the green icon, not the shipped one
while ($true) {
    Sync-FromMain -Force
    Repair-PatchedPackages
    $label = Get-DevVersionLabel
    if ($label) { $env:LEONIDAS_VERSION_LABEL = $label }
    # Leftover watchers and searches slow the whole machine; name them in the log (report only).
    $runaway = (& (Join-Path $PSScriptRoot 'Find-RunawayProcesses.ps1') 2>&1) -join "`n"
    if ($runaway -notmatch '^No runaway') { Add-Content -LiteralPath $log -Value "[supervisor] $runaway" }
    # The dev runner writes straight to its console, so capture it through file redirection.
    $proc = Start-Process -FilePath $pwsh -WindowStyle Hidden -PassThru `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'dev-isolated.ps1') + '"'), '-Mode', 'web') `
        -RedirectStandardOutput $log -RedirectStandardError (Join-Path $devHome 'dev-server.err.log')
    # When the server crashes on a half-written file (a merge or checkout in progress), the dev runner
    # stays alive printing "Waiting for file changes" and nothing restarts it, so the web page shows a
    # 502 until someone edits a file. Watch the server port and restart the runner we started
    # (by its captured PID only) when the server stays down.
    $startedAt = Get-Date
    $downSince = $null
    $webSilentSince = $null
    $lastSync = Get-Date
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 5
        if (((Get-Date) - $lastSync).TotalSeconds -ge 10) { Sync-FromMain; $lastSync = Get-Date }
        # The version label is baked into the runner at start. A publish moved dev to a new commit, so
        # restart the runner (by its captured PID only) when the label changed.
        if ($script:syncMoved) {
            $script:syncMoved = $false
            $newLabel = Get-DevVersionLabel
            if ($newLabel -and $newLabel -ne $label) {
                Add-Content -LiteralPath $log -Value "[supervisor] version label $label -> $newLabel; restarting the runner"
                & taskkill.exe /PID $proc.Id /T /F *> $null
                break
            }
        }
        # Vite sometimes freezes with no CPU use (stuck dependency optimizer) and then never answers.
        # Probe the page; when it stays silent for $webFrozenSeconds, restart the runner we started
        # (by its captured PID only) with a clean Vite cache.
        if (((Get-Date) - $startedAt).TotalSeconds -ge 30) {
            $webOk = $false
            try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$webPort/" -UseBasicParsing -TimeoutSec 5; $webOk = $true } catch { }
            if ($webOk) { $webSilentSince = $null }
            elseif (-not $webSilentSince) { $webSilentSince = Get-Date }
            elseif (((Get-Date) - $webSilentSince).TotalSeconds -ge $webFrozenSeconds) {
                Add-Content -LiteralPath $log -Value "[supervisor] web page on port $webPort silent for $webFrozenSeconds s (frozen Vite); restarting with a clean cache at $(Get-Date -Format o)"
                & taskkill.exe /PID $proc.Id /T /F *> $null
                Remove-Item -LiteralPath (Join-Path $repoRoot "apps/web/node_modules/.vite-$webPort") -Recurse -Force -ErrorAction SilentlyContinue
                break
            }
        }
        $up = $null -ne (Get-NetTCPConnection -LocalPort $serverPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($up) { $downSince = $null; continue }
        if (((Get-Date) - $startedAt).TotalSeconds -lt $startGraceSeconds) { continue }
        if (-not $downSince) { $downSince = Get-Date; continue }
        if (((Get-Date) - $downSince).TotalSeconds -ge $downRestartSeconds) {
            Add-Content -LiteralPath $log -Value "[supervisor] server port $serverPort down for $downRestartSeconds s while the dev runner is alive; restarting it at $(Get-Date -Format o)"
            & taskkill.exe /PID $proc.Id /T /F *> $null
            break
        }
    }
    $proc.WaitForExit(15000) | Out-Null
    Add-Content -LiteralPath $log -Value "[supervisor] dev server exited ($(if ($proc.HasExited) { $proc.ExitCode } else { 'killed' })) at $(Get-Date -Format o); restarting in 10 s"
    Start-Sleep -Seconds 10
}
