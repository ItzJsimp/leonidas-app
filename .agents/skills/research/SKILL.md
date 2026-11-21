---
name: "research"
description: "Investigate a topic, library or claim against primary sources and web evidence, and keep the findings. Use for open questions, docs or API facts, or reading legwork for a background agent."
category: research
scope: structural
distribution: template
type: skill
id: "skill-research"
title: "Research: Primary Source & External Investigation Engine"
kind: procedure
load: on-demand
owner: shared
verified: 2026-09-12
related: ["skills-index", "wiki-index", "aios-explorer", "master-instructions"]
generated: false
license: MIT
---

# Research Skill

External primary-source investigation engine for your AIOS and any peer AIOS. Operates via air-gapped subagent swarms to gather and verify web evidence without polluting orchestrator context.

---

## 1. Trigger Conditions & Decision Tree

Fires when investigating external libraries, technical documentation, competitive landscapes, or state-of-the-art benchmarks.

```
Incoming Request Analysis
+-- Internal code or OS files? --> STOP: Route to /aios-explorer
+-- Routine bugfix or internal script? --> STOP: Bypass external search (memory/research-first-gate-calibration.md)
+-- External library, API, or topic? --> PROCEED WITH RESEARCH
```

### Autonomous Depth Gating

The agent autonomously infers the depth tier from query scope, announced in the TL;DR header (override via `--quick`, `--standard`, `--deep`):

- **Quick Tier (1–3 sources, 1–2 min):** Parameter checks, API signatures, flags, or configuration keys. Executed inline or with 1 subagent.
- **Standard Tier (5–12 sources, 3–6 min) [DEFAULT]:** Architecture evaluations, library trade-offs, gotchas, or integration patterns. Spawns 2–3 parallel subagents.
- **Deep Tier (15–30+ sources, 8–15 min):** Exhaustive market analysis, multi-model benchmarks, or multi-angle strategic dossiers. Spawns 4–5 parallel subagents with full triangulation.

---

## 2. Hybrid Execution Modes

### Mode A: In-IDE Subagent Swarms (Default)

Executes directly in Antigravity or Claude Code for immediate, in-session deliverables:

1. **Decompose:** Split question into 5–10 orthogonal search angles per [`references/methodology.md`](references/methodology.md).
2. **Check the evidence-index first:** Run `pwsh -File scripts/Query-Evidence.ps1 -Keyword "<term>"` against `wiki/research/evidence-index.jsonl` for each angle before spawning a subagent for it. A prior dossier may have already verified that source; only spawn subagents for angles the index has no coverage for.
3. **Dispatch Swarm:** Spawn parallel `researcher` subagents for the uncovered angles:
   - In **Google Antigravity:** Spawn with `Model: 'flash'` or `'flash_lite'`. Never use `'inherit'` on High effort.
   - In **Claude Code:** Spawn with `--model haiku`.
4. **Stream & Deflate:** Subagents write raw scrapes to disk (`wiki/research/runs/<date>-<topic>/raw/`) and return structured JSON evidence records (`[{"claim", "quote", "locator", "url"}]`) to the parent.
5. **Synthesize:** Parent drafts the report using [`templates/research-report-template.md`](templates/research-report-template.md).

### Mode A-light: Primary-Source Note (Quick Tier, one question)

Spin up one **background agent** with a fresh context window, so you keep working while it reads. Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it. Read a source page as clean Markdown with [`defuddle`](../defuddle/SKILL.md).
2. Write the findings to a single Markdown file and cite each claim's source.
3. Save it where the repo already keeps such notes. Match the existing convention. If there is none, put it somewhere sensible and say where. In an AIOS, the storage sinks in section 3 are the convention.

### Mode B: Web Deep Research Bridge (`--web`)

Used when the user explicitly requests massive (50–150+ source) cloud-scale research:

1. **Prompt Formulation:** Generate an optimized frontier prompt specifying scope, primary source constraints, and structured output sections.
2. **Execution Guidance:** Direct the user to paste into Google Gemini Deep Research (`gemini.google.com`) or Claude.ai Web Research (`claude.ai`).
3. **Ingestion Bridge:** Provide the ready-to-run terminal command to ingest and format the exported Markdown into the target AIOS repository directory.

---

## 3. Storage Sinks & Cross-Tenant Tagging

- **Systemic & Evergreen:** Save to `wiki/research/YYYY-MM-DD-<topic-slug>.md`.
- **Project-Specific:** Save to `projects/<project-name>/research/YYYY-MM-DD-<topic-slug>.md` (or `research.md`).
- **Cross-Tenant Rule:** If the peer AIOS research is conducted within Leonidas AIOS, save in Leonidas storage tagged with `domain: peer` and `scope: the peer AIOS` in frontmatter.

---

## 4. Completion & Quality Gates ("Done When")

1. **Evidence Grounding:** All claims carry verifiable inline citations `[N]` qualified against [`references/credibility-rubric.md`](references/credibility-rubric.md).
2. **Prose Density:** Report body is >=80% narrative synthesis; bullets reserved for registries and lists.
3. **Clean Frontmatter:** Populated with `key_takeaways`, `topics`, `confidence`, and `sources_count`.
4. **Zero Em-Dash:** Validated via `scripts/Find-EmDashes.ps1`.
5. **Index Updated:** Run `pwsh -File scripts/Build-Index.ps1` to update repository indexes.
6. **Evidence-Index Appended:** Append one JSON line per cited source to `wiki/research/evidence-index.jsonl` (`date`, `dossier_id`, `topic`, `source_url`, `source_title`, `credibility_score`, `key_contribution`), so future research on an overlapping topic can query it via `scripts/Query-Evidence.ps1` before spawning new subagents.
7. **Cross-Dossier Reconciliation:** After appending, run `pwsh -File scripts/Test-DossierContradictions.ps1`. If it flags a source this dossier shares with an earlier one but disagrees on, resolve it in the new dossier's Notes section (documented product change) or correct the stale claim, before treating the run as complete.
8. **Canon Promotion:** Any finding whose `applies_to` overlaps an active skill or a durable operating fact (not project-specific trivia) gets promoted out of the dossier: author a short `memory/<finding-name>.md`, via `pwsh -File scripts/New-Memory.ps1` (the generated `memory/memory-index.md` lists it from its `description:`) so it becomes canon every future session inherits, not something only discoverable by reopening this specific dossier.
9. **Telemetry Logged:** Append one line to `wiki/research/telemetry.jsonl` (`date`, `dossier_id`, `topic`, `tier`, `tokens_used`, `tool_calls`, `wall_clock_s`, `sources_verified`) per subagent spawned. Periodically run `pwsh -File scripts/Get-ResearchTelemetryStats.ps1` (or via `ai-efficiency-audit`) to check whether the FFS thresholds above and the tool-call ceilings in `.agents/subagents/researcher.md` still match observed reality, and recalibrate from the medians instead of re-guessing.

Credit: Mode A-light is adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `research` (MIT). See [LICENSE](LICENSE).
