# Daily Closeout: Evening Wrap-Up & Workspace Hygiene Gate

Moved whole from the retired `daily-closeout` skill on 2026-11-20. It was the `/daily-closeout` command. AIOS only.

Conduct an interactive, low-friction evening closeout. Gathers deterministic substrate telemetry for today's accomplishments, runs a workspace hygiene gate to catch uncommitted Git drift or unsynced tasks, captures open loose ends and tomorrow's seed priorities, logs a structured dashboard to `logs/closeouts/`, and primes tomorrow morning's [`daily-briefing`](../../daily-briefing/SKILL.md) for continuous loop closure.

**Chain position:** Step 4 of the [Session Ritual Chain](../../../../workflows/session-ritual-chain.md): the end-of-day gate, run after the last [`chat-closeout`](chat-closeout.md) of the day. It consumes deterministic telemetry only and never re-runs chat-closeout's extraction.

## When to Use

- Ending a focused session or concluding the working day
- Auditing today's shipped commits, closed tasks, and active branches
- Checking for uncommitted Git modifications or untracked scratch files before shutdown
- Capturing unresolved loose ends, blockers, and tomorrow's seed P0
- Trigger phrases: "daily closeout", "evening closeout", "close out today", "end my day", "wrap up session", "/daily-closeout"

---

## 5-Phase Execution Workflow

```
[Phase 1: Substrate Telemetry Ingest] (scripts/Get-DailyCloseoutData.ps1)
          │
          ▼
[Phase 2: Interactive Exception Intake] (3 Low-Friction Prompts)
          │
          ▼
[Phase 3: Substrate Hygiene Gate] (Uncommitted Git & Scratch Check)
          │
          ▼
[Phase 4: Synthesis, Storage & Indexing] (logs/closeouts/YYYY-MM-DD-closeout.md)
          │
          ▼
[Phase 5: Morning Continuity Bridge] (Seed for next daily briefing)
```

---

### Phase 1: Substrate Telemetry Ingest

Execute the deterministic evening collector script:

```powershell
pwsh -NoProfile -File scripts/Get-DailyCloseoutData.ps1
```

The script runs in <1 second and gathers:
- Session window anchor (since today's morning briefing or today's start)
- Git branch and uncommitted working tree modifications/untracked counts
- Commits landed during today's window
- Tasks moved to `Done` today in `tasks/`
- Remaining active `Now` tasks and backlog counts
- Capture files touched today
- ActivityWatch local REST API status

Present the gathered accomplishments to the operator before prompting for input.

---

### Phase 2: Interactive Exception Intake (The 3 Prompts)

To eliminate late-night cognitive friction, intake uses a telemetry-first exception model: the agent displays what landed from telemetry, asking the operator only 3 rapid questions:

```markdown
### 📋 Daily Closeout Intake

❓ **Q1 - Today's P0 Outcome:**
- `[A]` Landed (Fully achieved the core target)
- `[B]` Partial (Meaningful progress, but carryover required)
- `[C]` Blocked / Missed (External friction, distraction, or blocker)

❓ **Q2 - Open Threads & Blockers:**
Any uncommitted scratch notes, blocker details, or loose ends to log? (Reply with details, or `None`)

❓ **Q3 - Tomorrow's Seed P0:**
What is the single non-negotiable must-win focus for the next working session?

*(Reply like `1A 2: None 3: Finish payment integration` or quick free text)*
```

#### Intake Rules:
1. **Never guess P0 status:** If the user does not specify, default to `1B (Partial)` and prompt to confirm.
2. **Fast-path parsing:** Accept single-line replies or natural conversational dictation.

---

### Phase 3: Substrate Hygiene Gate & Sunday Shadow Audit

Before writing the log, evaluate workspace hygiene:

1. **Uncommitted Git Diffs:** If `Get-DailyCloseoutData.ps1` reports modified or untracked files:
   - Alert the user: `WARNING: N modified, M untracked files detected in working tree.`
   - Offer a one-line commit suggestion to ensure work is committed to Git history per [ADR-0010](../../../../decisions/0010-git-history-replaces-the-master-log.md).
2. **Task State Alignment:** Verify that tasks mentioned during the session match their status in `tasks/`.
3. **Scratchpad Hygiene:** Remind the user if temporary scratch scripts remain in your artifact directory or workspace root.
4. **Sunday Shadow System Diagnostic Card ([ADR-0046](../../../../decisions/0046-boom-automations-5-phase-implementation-and-governance-architecture.md)):**
   - Automatically executes on Sundays (or when `Get-DailyCloseoutData.ps1` flags stray files or >=15 mins in external note apps).
   - Presents the detected rogue files/apps and asks the operator:
     - `[A] Absorb into AIOS:` Instantiate a task in `tasks/` to formalize a native schema and workflow.
     - `[B] Kill Distraction:` Delete or archive stray files and kill legacy tool usage.

---

### Phase 4: Output & Storage

Synthesize telemetry and operator intake into a dense markdown report and save to `logs/closeouts/YYYY-MM-DD-closeout.md`. (If a closeout already exists for today, append timestamp slug e.g. `YYYY-MM-DD-closeout-2.md`).

#### Core Output Schema:

```markdown
# 🌙 Daily Closeout : YYYY-MM-DD

## 🛡️ 1. Substrate Hygiene Gate
- **Git Branch:** `[branch]` | **Tree Status:** [Clean / DIRTY: N modified, M untracked]
- **Session Window Anchor:** Since [Briefing Name] ([Briefing Date])
- **ActivityWatch Status:** [Online / Offline]

---

## 🎯 2. Executive Summary
- **P0 Target Outcome:** [Landed / Partial / Blocked] - [Summary note]
- **Focus Domain:** [Primary domain worked today]
- **Tasks Landed Today:** [N tasks completed]
- **Commits Landed Today:** [N commits authored]

---

## 🚀 3. Accomplishments & Shipped Work
### Landed Commits:
- `[hash]` [Commit message] ([Author])

### Completed Tasks:
- [x] **[Task Name]** (`[file]`) at [Time]

---

## ⚠️ 4. Open Loose Ends & Blockers
- [Carried-over items, uncommitted notes, or "None"]

---

## ⚡ 5. Tomorrow's Seed Action Plan
- [ ] **[P0 Seed Task]:** [Specific first executable step]
- [ ] **[Secondary Priority]:** [Next action]
```

After writing the file, rebuild indexes:
```powershell
pwsh -NoProfile -File scripts/Build-Index.ps1
```

---

### Phase 5: Morning Continuity Bridge

The items listed under `## ⚡ 5. Tomorrow's Seed Action Plan` form the deterministic bridge to tomorrow morning.

[`scripts/Get-DailyBriefingData.ps1`](../../../../scripts/Get-DailyBriefingData.ps1) automatically inspects `logs/closeouts/`. If a closeout log exists newer than the previous morning briefing, its unchecked seed checklist items (`- [ ]`) are ingested and rendered as the primary carryover block in the morning briefing dashboard.

---

## Done When

1. `.agents/skills/session-handoff/references/daily-closeout.md` created with interactive intake and output schema.
2. `scripts/Get-DailyCloseoutData.ps1` runs in <1s and gathers git, task, and service telemetry.
3. Daily closeout logs stored in `logs/closeouts/YYYY-MM-DD-closeout.md`.
4. `scripts/Get-DailyBriefingData.ps1` reads evening closeout logs for morning continuity.
5. Symlink/junction verified via `scripts/Sync-AgentSkills.ps1`.
