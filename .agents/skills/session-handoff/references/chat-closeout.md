# Chat Closeout

Moved whole from the retired `chat-closeout` skill on 2026-11-20. It was the `/chat-closeout` command. AIOS only: it needs the scripts in `scripts/`, `logs/` and `capture/`. Scripts moved to `../scripts/`.

Terminal, one-time pre-archival ritual. Where [`chat-sync`](../../chat-sync/SKILL.md) runs repeatedly mid-session over a recency-filtered window, chat-closeout runs once at the end over the full conversation, then certifies the session safe to archive. It delegates all extraction and promotion to chat-sync's engine and adds only what a terminal pass needs: a deterministic open-loop scan, a cold-start-tested continuation capsule, a lessons channel that promotes repeats into guards, a substrate check, a ledger line, and the Archival Readiness Stamp. Run this at the end of every substantive chat, not just before an explicit archive.

**Chain position:** Step 3 of the Session Ritual Chain: the terminal gate at session end, after any [`session-handoff`](../SKILL.md) for that session. Downstream neighbor: [`daily-closeout`](daily-closeout.md) closes the working day.

---

## When to Use

- At the conclusion of a substantive work session before right-clicking "Archive" in Google Antigravity.
- Before exiting or archiving a Claude Code terminal session.
- When turn depth approaches 45-50 turns and an explicit continuation capsule is needed.
- Whenever unclosed loops, uncommitted code, or unpromoted thoughts remain.

### When to SKIP (4-Gate Fast Exit)

**Do NOT run `chat-closeout` on clean sessions.**
If the session already concluded with `### 🏁 Session Complete (Ready to Close)` (primary deliverables verified, git state committed, zero blockers/approvals remain, and zero open loops exist):

- **Action:** Simply close the chat window or exit the terminal directly.
- **Why:** In-Flight Auto-Capture (AGENTS.md Rule 12 & 14) already locked memories and tasks to disk mid-flight. Running closeout on a clean session re-reads 200,000+ tokens across multiple tool turns solely to confirm what was already certified, burning \$0.25 to \$1.25+ and rate-limit quota with zero yield.

---

## Execution Procedure

### Fast-Path: Single-Turn Deterministic Runner (Recommended)

To close out with minimum token burn (1 tool turn instead of 4-5), execute the single-pass runner:

```powershell
pwsh -NoProfile -File scripts/Invoke-ChatCloseout.ps1 -Engine <Engine> -Session "<id>" -Title "<Emoji> <Verb> <Object> - <Scope>" [-Clean] [-Fast]
```

- **Clean Exit (Exit Code 0):** Runs loop scan, checks playbooks, verifies substrate health, appends to `logs/closeout-ledger.jsonl`, and outputs the formatted Archival Readiness Stamp in one atomic step.
- **Open Loops Detected (Exit Code 2):** If unclosed tasks created this session or added `TODO` markers exist, the script halts and outputs the exact open loops requiring synthesis. Proceed to Step 2 below to author a continuation capsule, then re-run with `-Capsule <path>`.

---

### Detailed Underlying Protocol

### Step 0: Open-Loop Scan & Capsule Lifecycle (0 tokens)

Run the deterministic scan with this session's start time (first turn; if unknown, just before this session's first commit):

```powershell
pwsh -NoProfile -File .agents/skills/session-handoff/scripts/Get-OpenLoops.ps1 -Since "<session start>" -Json
```

It returns `CommitsSince`, `OpenTasks` (task files added since start, still open), `AddedTodos` (TODO/FIXME lines added, never pre-existing), `DirtyFiles`, and `StaleCapsules` (open capsules older than 3 days).

- **Close what this session resumed:** if this session picked up a capsule or handoff doc, set its frontmatter `status: resumed` (or `abandoned` / `merged` if that is what happened). An open capsule is one with no status or `status: open`.
- **Own footprint only:** `CommitsSince` and `DirtyFiles` include other live sessions' work (see the Live Sessions hook). Claim only the commit hashes this session produced, stage explicit paths only per [`safe-parallel-commit`](../../safe-parallel-commit/SKILL.md), and if a live session touched the same files, name it in the capsule's AIOS pointers.

### Step 1: Full-History Extraction (delegates to chat-sync)

Run [`chat-sync`](../../chat-sync/SKILL.md)'s 5-step workflow (Freshness Pass -> Extract Candidates -> Durability Gate -> Risk-Tier Gating -> Deterministic Execution & Routing) in **full-history mode**: scan the entire conversation, not the last 15-30 turns. The recency filter exists to keep mid-session syncs cheap; a terminal pass has nothing left to filter, so everything unpromoted surfaces once. Every 🔴 item still queues for approval exactly as chat-sync defines it, no looser gate for being last.

### Step 2: Continuation Capsule (chat-closeout only)

Three open-loop signals, never a freeform re-judgment of the conversation:

1. **Unanswered `❓` blocks**: any grilling-format question posed in this session with no operator answer before closeout (the only signal read from chat).
2. **Own unfinished tasks**: Step 0 `OpenTasks`, minus any the session actually finished (set those `Done` now) and minus deliberate deferrals with a `verify:` gate (a task file is already its own resume artifact).
3. **Unresolved `TODO`/`FIXME`**: Step 0 `AddedTodos`.

If all three are empty, skip this step entirely: never invent a Remaining Objective for a session that closed clean.

**Handoff dedupe:** if [`session-handoff`](../SKILL.md) already wrote `handoff-docs/YYYY-MM-DD-*.md` this session, write no capsule; cite that doc in the stamp's Continuation Capsule line. One resume artifact per session.

Otherwise write **one** capsule to `capture/continuations/YYYY-MM-DD-<slug>.md` with frontmatter `type: continuation`, `status: open`, `created:`, then four fields: Origin ID (this session's chat title/id), Accomplished State, Remaining Objective, AIOS pointers. Synthesize a single Remaining Objective across all firing signals, never one capsule per signal.

**Cold-start test:** hand the resume artifact (capsule or handoff doc) to a zero-context subagent on the cheapest model (Claude Code: `Agent` with `model: haiku`; Antigravity: a Flash subagent) with only: "Read `<path>` and the repo. State the next action and the first 3 files you would open." If its answer misses the Remaining Objective or the right files, rewrite the artifact and retest once. Two misses: stamp `FAILED` and say what was missing.

### Step 3: Skill Stack Reflection (chat-closeout only)

Scan two mechanical signals, do not freeform-judge "what could be a skill":

1. **New-skill candidate:** a manual tool-call sequence or workflow repeated 2+ times within this session.
2. **Tweak candidate:** an existing skill whose documented steps the operator explicitly corrected, overrode, or extended during this session.

If both are empty, skip this step entirely.

- **New-skill candidate:** check `skills-index.md` for existing coverage first; if novel and unambiguous, scaffold via [`skill-creator`](../../skill-creator/SKILL.md) with `disable-model-invocation: true` (flag ADR-0051 core-kernel candidates for manual review).
- **Tweak candidate:** apply a single unambiguous edit directly; queue anything ambiguous or multi-file for approval.

### Step 4: Lessons Learned (chat-closeout only)

Scan the full history for failed commands, API quirks, tool limitations, slow paths, or edge cases already paid for.

**Recurrence gate first:** grep each lesson's key term across `logs/lessons-learned.md`, `projects/*/agent-playbook.md`, and `memory/observed/antifragile.md`. A hit means the lesson was paid for twice, so a third log line will not stop a fourth. Promote it instead:

- **Guard it now** if a mechanical check fits in this session (hook, lint gate, script self-check, `Audit-Substrate` rule).
- Otherwise add one rule to `antifragile.md` and create a task via `scripts/New-Task.ps1` naming the guard to build.

New lessons (no hit) route where the next agent will read them:

- **About one project:** into `projects/<project>/agent-playbook.md` (sections 3 to 6, plus one dated line in section 7), created from `templates/agent-playbook-template.md` if missing. A global log is not read when an agent starts on a project; the playbook is.
- **Cross-project:** append to `logs/lessons-learned.md` under a new date entry.

Then run `python scripts/test-project-playbooks.py --touched-since "<session start>"`: every project this session changed must show `ok`.

### Step 5: Mechanical Substrate Verification

```powershell
pwsh -NoProfile -File scripts/Audit-Substrate.ps1
```

If any link, frontmatter, or em-dash failure is detected, remediate it immediately before completing the closeout.

### Step 6: Ledger Line & Archival Readiness Stamp

Append one ledger line so `telemetry-analyst` can prove which steps ever fire and cut the dead ones:

```powershell
pwsh -NoProfile -File .agents/skills/session-handoff/scripts/Get-OpenLoops.ps1 -Record '{"engine":"<engine>","session":"<id>","promoted":0,"approvals":0,"lessons_new":0,"lessons_enforced":0,"capsule":"<path|none>","capsules_closed":0,"cold_start":"<pass|fail|skipped>","skills_created":0,"skills_tweaked":0}'
```

Then output the stamp. The title line uses the `Functional Emoji Action-First` formula, matching the session's own Chat Title badge:

```text
================================================================================
ARCHIVAL READINESS STAMP: <Emoji> <Action Verb> <Direct Object> - <Context/Scope>
================================================================================
Status: CERTIFIED CLEAN FOR ARCHIVE
Promoted (chat-sync Auto-Applied):   <Count> items
Approval Queue Cleared (chat-sync):  <Count> items
Lessons:                             <Count> new, <Count> promoted to guards
Substrate Health:                    PASSED (0 errors)
Continuation Capsule:                <None | capture/continuations/<file>.md | handoff-docs/<file>.md>
  Remaining Objective:               <One-line summary, omit block if None>
  Cold-Start Test:                   <PASSED | FAILED: what was missing | SKIPPED (no capsule)>
Capsules Closed:                     <Count resumed/abandoned/merged>
Skill Stack:                         <Count> created, <Count> tweaked, or None

ACTION: Safe to archive this chat.
================================================================================
```
