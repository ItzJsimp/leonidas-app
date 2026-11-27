# Recap: Instant Session Execution & Change Summary

Moved whole from the retired `recap` skill on 2026-11-20. It was the `/recap` command.

Instant, zero-write inline session summary. Audits active chat history, tool calls, and working tree state to emit a scannable report of changes landed, commands executed, or planned actions if no edits have occurred yet.

**Chain position:** Orthogonal to the Session Ritual Chain: runs at any time as a read-only reporter and owns no artifact. It never substitutes for a chain step.

---

## Core Operational Discipline

1. **Zero File Mutations (Pure Reporter):** Never write, create, or alter files on disk during a recap. Unlike [`session-handoff`](../SKILL.md) or [`chat-sync`](../../chat-sync/SKILL.md), this skill is strictly an analytical status reporter.
2. **Ground Truth Over Inference:** Run `git status -s` and inspect actual tool call outputs rather than guessing what changed.
3. **Mandatory Relative Links:** Format every file reference as a clickable repo-relative markdown link (e.g. `scripts/Build-Index.ps1`).
4. **Zero Em-Dash Standard:** Strictly enforce the zero em dash (U+2014) standard across all headings, badges, bullet points, and summaries per ADR-0012.
5. **High Token Density:** Use bullet points, bold callouts, and structured category headers. Omit pleasantries, preambles, and conversational filler.

---

## 3-Phase Execution Pipeline

### Phase 1: Environment & State Inspection

1. Execute `git status -s` to inspect uncommitted, modified, added, or deleted files.
2. Inspect the session trajectory:
   - Identify all files created, modified, or deleted in this chat.
   - Collect all commands executed (`pwsh`, `npx`, `git`, test suites, scripts) along with their exit outcomes.
   - Compare prompt requests against landed actions to detect deferred or incomplete items.
   - Note any architectural decisions, user approvals, or active constraints established.
3. Select the operating branch:
   - **Branch A (Changes Executed / In-Flight):** File edits or CLI commands have been performed.
   - **Branch B (Planning / Pre-Execution):** Zero files touched yet; discussion, research, or planning is active.

### Phase 2: Category Structuring

Sort all session actions into distinct categories:

- **🚀 Features & Upgrades:** New capabilities, new files, upgraded scripts, added skills, or architectural additions.
- **🛠️ Fixes & Refactors:** Bug resolutions, syntax adjustments, performance optimizations, or code simplifications.
- **⚙️ Standards & Config:** Frontmatter updates, rule alignments, symlinks, or documentation refinements.
- **⚡ Execution Telemetry:** Deterministic verification commands, tests passed/failed, and working tree diff counters.
- **🎯 Deferred / Open Scope (Conditional):** Any items requested by the user that were skipped, blocked, or deferred to later turns.

### Phase 3: Emit Standardized Output

Render the scannable recap matching the exact template for the selected branch.

---

## Output Templates

### Branch A: Executed or In-Flight Changes

````markdown
# 📋 Session Recap: [1-Line Session Focus / Title]

**Status:** `🟢 COMPLETED` | `🟡 IN PROGRESS` | **Files Touched:** `N` | **Commands Executed:** `N` | **Session Turns:** `N`

---

## 🚀 Key Changes & Completed Upgrades

- **[Component / Category 1]**:
  - `path/to/file.ext`: [Concise 1-line description of change or upgrade]
  - `path/to/new_file.ext`: [NEW: Purpose and responsibilities of new file]
- **[Component / Category 2]**:
  - `path/to/file2.ext`: [Concise 1-line description of change]

## ⚡ Execution Summary

- **Commands & Tests Executed:**
  - `[command string]`: `[PASS / Exit 0]` (Result summary)
  - `[verification script]`: `[PASS / Exit 0]` (Outcome)
- **Working Tree State (`git status -s`):**
  ```text
  M  path/to/file.ext
  ?? path/to/new_file.ext
  ```
````

<!-- ONLY display this section if specific user-requested items were skipped or deferred -->

## 🎯 Deferred / Open Scope

- `[Deferred Item 1]`: [Reason deferred, e.g. blocked on dependency or held for separate PR]

## ⚡ Immediate Next Actions / Remaining Scope

1. [ ] [Immediate next procedural action or verification check]
2. [ ] [Optional follow-up item]

````

### Branch B: Pre-Execution / Planned Changes (0 Edits Yet)

```markdown
# 📋 Proposed Execution Plan: [1-Line Session Focus / Title]

**Status:** `🔵 PLANNED (0 Edits Yet)` | **Target Files:** `N` | **Estimated Scope:** `[Small / Medium / Large]`

---

## 🎯 Target Changes & Upgrades
- **[Target Component 1]**:
  - `path/to/file.ext`: [Planned modification and architectural intent]
  - `path/to/new_file.ext`: [NEW: Proposed new file and responsibilities]
- **[Target Component 2]**:
  - `path/to/file2.ext`: [Planned modification]

## ⚡ Planned Execution Sequence
1. [ ] **Step 1:** [First concrete action / file creation]
2. [ ] **Step 2:** [Second implementation step / refactor]
3. [ ] **Step 3:** [Verification / test run / index build]

## ⚠️ Constraints & Key Decisions
- **Constraints:** [Hard boundaries, non-negotiables, or rules to adhere to]
- **Locked Decisions:** [Settled architectural choices or patterns]
````

---

## Done When

The recap is complete when:

1. Every modified, created, or targeted file is linked with a valid repo-relative markdown link.
2. All commands executed during the session are accounted for with pass/fail status.
3. No file writes or disk mutations were initiated by the recap invocation itself.
4. Zero Unicode U+2014 em dashes appear anywhere in the generated output.
