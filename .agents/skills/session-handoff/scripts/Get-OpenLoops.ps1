<#
.SYNOPSIS
    Deterministic open-loop scan for chat-closeout (0 LLM tokens).
.DESCRIPTION
    Default: reports commits since session start, task files added since then still open,
    TODO/FIXME lines added since then, dirty working-tree files, and stale open capsules.
    -StaleDays alone: returns only stale open capsules (used by Get-DailyBriefingData.ps1).
    -Record '<json>': appends one line to logs/closeout-ledger.jsonl and exits.
.EXAMPLE
    pwsh -NoProfile -File .agents/skills/chat-closeout/scripts/Get-OpenLoops.ps1 -Since "2026-09-26 02:20" -Json
#>
param(
    [datetime]$Since,
    [int]$StaleDays = 3,
    [string]$Record,
    [switch]$Json
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../..')).Path

if ($Record) {
    $entry = $Record | ConvertFrom-Json -AsHashtable
    $entry = [ordered]@{ timestamp = (Get-Date).ToString('o') } + $entry
    Add-Content -LiteralPath (Join-Path $repo 'logs/closeout-ledger.jsonl') -Value ($entry | ConvertTo-Json -Compress) -Encoding utf8
    return
}

# Open capsule = no status frontmatter (legacy) or status: open. Age from the YYYY-MM-DD filename prefix.
$capDir = Join-Path $repo 'capture/continuations'
$stale = @(Get-ChildItem -LiteralPath $capDir -Filter '*.md' -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(\d{4}-\d{2}-\d{2})-' -and
    ([datetime]$Matches[1]) -lt (Get-Date).Date.AddDays(-$StaleDays) -and
    -not (Select-String -LiteralPath $_.FullName -Pattern '^status:\s*"?(resumed|abandoned|merged)' -Quiet)
} | ForEach-Object { "capture/continuations/$($_.Name)" })

if (-not $PSBoundParameters.ContainsKey('Since')) {
    $out = [ordered]@{ StaleCapsules = $stale; StaleCount = $stale.Count }
    if ($Json) { $out | ConvertTo-Json -Depth 4 } else { [pscustomobject]$out }
    return
}

$iso = $Since.ToString('o')
Push-Location -LiteralPath $repo
try {
    $commits = @(git log --since=$iso --format='%h %s' | ForEach-Object { $_.Substring(0, [Math]::Min(100, $_.Length)) })
    $added = @(git log --since=$iso --diff-filter=A --name-only --format= -- 'tasks/*.md' | Sort-Object -Unique)
    $added += @(git ls-files --others --exclude-standard -- 'tasks/*.md')
    $openTasks = @($added | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath $_ } | Where-Object {
        Select-String -LiteralPath $_ -Pattern '^status:\s*"?(Not started|In progress)' -Quiet
    })
    # Only marker lines this session ADDED ("TODO:" / "FIXME(x)"), never pre-existing ones or prose naming the words.
    $diff = @(git log --since=$iso -p -U0 --format=) + @(git diff HEAD -U0 2>$null)
    $todos = @($diff | Where-Object { $_ -match '^\+(?!\+\+).*\b(TODO|FIXME)\b\s*[:(]' } | ForEach-Object { $_.Substring(1).Trim() } | Select-Object -Unique -First 20)
    $dirty = @(git status --porcelain | ForEach-Object { $_.Substring(3) })
} finally { Pop-Location }

$out = [ordered]@{
    Since          = $iso
    CommitsSince   = $commits   # includes other live sessions' commits: claim only your own hashes
    OpenTasks      = $openTasks
    AddedTodos     = $todos
    DirtyFiles     = $dirty     # stage only the paths this session wrote
    StaleCapsules  = $stale
    Fired          = [ordered]@{ tasks = $openTasks.Count -gt 0; todos = $todos.Count -gt 0 }
}
if ($Json) { $out | ConvertTo-Json -Depth 4 } else { [pscustomobject]$out }
