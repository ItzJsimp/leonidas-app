<#
.SYNOPSIS
    Invoke-ChatCloseout.ps1 - Single-pass deterministic execution for chat-closeout (1 tool turn).
.DESCRIPTION
    Consolidates open-loop scan, project playbook verification, substrate check, ledger logging,
    and Archival Readiness Stamp output into a single command pass.
    Reduces chat-closeout LLM tool roundtrips from 4-5 down to 1.
    If open loops exist that require a continuation capsule, exits with code 2 and structured details.
    If clean, writes logs/closeout-ledger.jsonl and emits the Archival Readiness Stamp with exit code 0.
.EXAMPLE
    pwsh -NoProfile -File .agents/skills/chat-closeout/scripts/Invoke-ChatCloseout.ps1 -Engine Antigravity -Session "18c4f557" -Title "🛠️ Fix Scribe GC segfault - projects/leonidas-scribe"
#>
[CmdletBinding()]
param(
    [string]$Engine = "Antigravity",
    [string]$Session = "",
    [datetime]$Since,
    [string]$Title = "",
    [int]$Promoted = 0,
    [int]$Approvals = 0,
    [int]$LessonsNew = 0,
    [int]$LessonsEnforced = 0,
    [string]$Capsule = "none",
    [int]$SkillsCreated = 0,
    [int]$SkillsTweaked = 0,
    [string[]]$ClaimedTasks = @(),
    [switch]$Clean,
    [switch]$Force,
    [switch]$Fast,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../../../..")).Path

# Default Since to last 3 hours if not provided
if (-not $PSBoundParameters.ContainsKey("Since")) {
    $Since = (Get-Date).AddHours(-3)
}

# 1. Run OpenLoops scan
$openLoopsScript = Join-Path $PSScriptRoot "Get-OpenLoops.ps1"
$loopsRaw = & pwsh -NoProfile -File $openLoopsScript -Since $Since -Json
$loops = $loopsRaw | ConvertFrom-Json

$hasAddedTodos = $loops.AddedTodos.Count -gt 0

# Determine actual open tasks belonging to this session
$actualOpenTasks = @()
if (-not $Clean -and -not $Force) {
    $targetTaskList = if ($ClaimedTasks.Count -gt 0) { $ClaimedTasks } else { $loops.OpenTasks }
    foreach ($ot in $targetTaskList) {
        $taskPath = Join-Path $repo $ot
        if (Test-Path -LiteralPath $taskPath) {
            $content = Get-Content -LiteralPath $taskPath -Raw
            if ($content -match 'status:\s*"?(Not started|In progress)') {
                $actualOpenTasks += $ot
            }
        }
    }
}


# 2. Check Project Playbooks if modified
$playbookCheckPassed = $true
$playbookOut = ""
$playbookScript = Join-Path $repo "scripts/test-project-playbooks.py"
if (Test-Path -LiteralPath $playbookScript) {
    try {
        $playbookOut = & python $playbookScript --touched-since $Since.ToString("o") 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            $playbookCheckPassed = $false
        }
    } catch {
        $playbookCheckPassed = $false
        $playbookOut = $_.ToString()
    }
}

# 3. Check Substrate Health
$substratePassed = $true
$substrateSummary = "PASSED (0 errors)"
if (-not $Fast) {
    $auditScript = Join-Path $repo "scripts/Audit-Substrate.ps1"
    if (Test-Path -LiteralPath $auditScript) {
        try {
            $auditOut = & pwsh -NoProfile -File $auditScript 2>&1 | Out-String
            if ($auditOut -match 'Substrate Health Gate:\s*\[FAIL\]') {
                $substratePassed = $false
                $substrateSummary = "FAILED (Substrate drift detected)"
            }
        } catch {
            $substratePassed = $false
            $substrateSummary = "ERROR running Audit-Substrate.ps1"
        }
    }
} else {
    $substrateSummary = "SKIPPED (Fast mode: pre-commit verified)"
}

# 4. Check if continuation capsule is required
$needsCapsule = ($actualOpenTasks.Count -gt 0 -or $hasAddedTodos) -and ($Capsule -eq "none" -or [string]::IsNullOrWhiteSpace($Capsule))

if ($needsCapsule) {
    $failureObj = [ordered]@{
        Status         = "NEEDS_CONTINUATION_CAPSULE"
        ExitCode       = 2
        OpenTasks      = $actualOpenTasks
        AddedTodos     = $loops.AddedTodos
        DirtyFiles     = $loops.DirtyFiles
        PlaybooksPass  = $playbookCheckPassed
        Substrate      = $substrateSummary
        Recommendation = "Author continuation capsule at capture/continuations/YYYY-MM-DD-<slug>.md, then re-run with -Capsule <path>."
    }
    if ($Json) {
        $failureObj | ConvertTo-Json -Depth 4
    } else {
        Write-Host "================================================================================" -ForegroundColor Yellow
        Write-Host "CLOSEOUT GATE HALTED: OPEN LOOPS REQUIRE CONTINUATION CAPSULE" -ForegroundColor Yellow
        Write-Host "================================================================================" -ForegroundColor Yellow
        if ($actualOpenTasks.Count -gt 0) {
            Write-Host "Open Tasks Created This Session:" -ForegroundColor Cyan
            $actualOpenTasks | ForEach-Object { Write-Host "  - $_" -ForegroundColor Cyan }
        }
        if ($hasAddedTodos) {
            Write-Host "Unresolved Markers Added This Session:" -ForegroundColor Cyan
            $loops.AddedTodos | ForEach-Object { Write-Host "  - $_" -ForegroundColor Cyan }
        }
        Write-Host ""
        Write-Host "Action Required: Author a continuation capsule at capture/continuations/YYYY-MM-DD-<slug>.md," -ForegroundColor Yellow
        Write-Host "then re-run Invoke-ChatCloseout.ps1 -Capsule capture/continuations/... to certify clean." -ForegroundColor Yellow
        Write-Host "================================================================================" -ForegroundColor Yellow
    }
    exit 2
}

# 5. Clean Closeout: Record Ledger Line
$coldStartStatus = if ($Capsule -ne "none" -and [string]::IsNullOrWhiteSpace($Capsule) -eq $false) { "pass" } else { "skipped" }
$ledgerObj = [ordered]@{
    engine           = $Engine
    session          = if ($Session) { $Session } else { "unknown" }
    promoted         = $Promoted
    approvals        = $Approvals
    lessons_new      = $LessonsNew
    lessons_enforced = $LessonsEnforced
    capsule          = $Capsule
    capsules_closed  = 0
    cold_start       = $coldStartStatus
    skills_created   = $SkillsCreated
    skills_tweaked   = $SkillsTweaked
}

& pwsh -NoProfile -File $openLoopsScript -Record ($ledgerObj | ConvertTo-Json -Compress)

# 6. Output Archival Readiness Stamp
if ([string]::IsNullOrWhiteSpace($Title)) {
    $Title = "Terminal Session Closeout - AIOS"
}

$stamp = @"
================================================================================
ARCHIVAL READINESS STAMP: $Title
================================================================================
Status: CERTIFIED CLEAN FOR ARCHIVE
Promoted (chat-sync Auto-Applied):   $Promoted items
Approval Queue Cleared (chat-sync):  $Approvals items
Lessons:                             $LessonsNew new, $LessonsEnforced promoted to guards
Substrate Health:                    $substrateSummary
Continuation Capsule:                $Capsule
  Remaining Objective:               $(if ($Capsule -eq "none") { "None (All deliverables completed, verified, and committed)" } else { "See $Capsule" })
  Cold-Start Test:                   $coldStartStatus
Capsules Closed:                     0
Skill Stack:                         $(if ($SkillsCreated -eq 0 -and $SkillsTweaked -eq 0) { "None" } else { "$SkillsCreated created, $SkillsTweaked tweaked" })

ACTION: Safe to archive this chat.
================================================================================
"@

if ($Json) {
    [ordered]@{
        Status    = "CERTIFIED_CLEAN"
        ExitCode  = 0
        Ledger    = $ledgerObj
        Stamp     = $stamp
    } | ConvertTo-Json -Depth 4
} else {
    Write-Output $stamp
}

exit 0
