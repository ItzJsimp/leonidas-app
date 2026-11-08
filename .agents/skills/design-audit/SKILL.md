---
name: "design-audit"
description: "Score a built UI, page, screen or document against a pass/fail design rubric from screenshots at 3 sizes, with plain fixes. Use after any UI change, or when asked to review, check or polish how it looks."
category: design
scope: structural
distribution: template
type: skill
id: skill-design-audit
title: "Design Audit: the pass/fail quality gate"
kind: procedure
load: on-demand
owner: leonidas
verified: 2026-09-28
related: ["design-build", "impeccable", "standard-design-system", "app-building-standard"]
license: MIT
---

# Design Audit

Apply the [design review limits](../design-build/references/review-budget.md).
Review all states and sizes in one batch. Linked skills share that pass.
Save screenshots locally; audit sizes do not require new Doop frames or individual chat images.

Decides, with evidence, whether a design is good enough to ship. the user is not a designer, so this skill is the designer's eye: it catches what he would feel is "off" but could not name, and it names it in plain English with the exact fix. A design either PASSES or FAILS; "looks fine" is not a verdict.

Works on anything with a visual surface: web apps and pages, desktop apps (Qt, Electron, Tauri), generated HTML artifacts and dashboards, and documents or PDFs. Impeccable covers web, iOS and Android; desktop Qt checks live here in [`references/qt-audit.md`](references/qt-audit.md).

## Steps

1. **Resolve the target.** One line each (see [`references/rubric.md`](references/rubric.md) section 0):
   - **What and why:** the surface, what the user does there, how often.
   - **Stack:** web, Qt, other desktop, static HTML, or document/PDF.
   - **Canon:** the project's own design system if it has one (a `DESIGN.md`, a tokens file, a theme module); otherwise AIOS canon, [`standards/design-system.md`](../../../standards/design-system.md) (Command register for apps, Dispatch register for documents) and [`standards/app-building-standard.md`](../../../standards/app-building-standard.md). Say which canon you are judging against.
   - **Mode:** impeccable's modes: _Operate_ (apps, dashboards, tools), _Read_ (docs, reports), _Persuade_ (landing pages), _Experience_ (portfolios, showcases).
2. **Capture evidence before judging.** Never judge from code alone. Screenshot at 3 sizes:
   - Web and HTML: `mcp__Claude_Browser__resize_window` to 1440x900, 1024x768 and 375x812 (or 768x1024 for desktop-only apps), screenshot each.
   - Qt: the `grab()` snippet in [`references/qt-audit.md`](references/qt-audit.md) at full-screen, half-screen and the window minimum.
   - Other desktop apps: OS screenshots at the same three window sizes.
   - Documents and PDFs: render pages to images (first page, a dense page, the last page).
     Also capture one empty state and one error state when the surface shows data.
3. **Run the rubric.** Walk every gate in [`references/rubric.md`](references/rubric.md). Qt surfaces add [`references/qt-audit.md`](references/qt-audit.md). Mark each finding P0 (blocking), P1 (fix before calling done) or P2 (polish). Gates that cannot apply (motion on a PDF) are marked n/a with a reason.
4. **Score heuristics.** For web, run impeccable `critique` ([`../impeccable/reference/critique.md`](../impeccable/reference/critique.md)) for the Nielsen 0-4 table and impeccable `audit` ([`../impeccable/reference/audit.md`](../impeccable/reference/audit.md)) for technical checks (`audit.native.md` for iOS and Android). For everything else, score the same 10 Nielsen heuristics by hand from the screenshots using the anchors in the critique reference, marking non-applicable ones n/a.
5. **Verdict.** FAIL if any P0 exists, or more than 3 P1s, or the heuristic total is under 70 percent of the applicable maximum (28/40 when all ten apply). Otherwise PASS. State it on line one.
6. **Report.** Use the format below, then hand fixes to [`design-build`](../design-build/SKILL.md) or apply them if the user asked for fixes.

## Report format

Line 1: `Verdict: FAIL (2 P0, 4 P1) · Heuristics 26/40 · <surface> · judged against <canon>`

Then one table, worst first. The "In plain English" column is mandatory: it is what the user reads.

| #   | Sev | Where          | Problem                                          | In plain English                                           | Fix                                                                                 |
| --- | --- | -------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | P0  | `voice.py:243` | 8 widgets in one QHBoxLayout, label has no elide | The status line gets chopped off when the window is narrow | Split into a status row and an actions row; elide with the full text in the tooltip |

Then: link the saved evidence or chosen frame. Show one combined image only when useful, within the shared image limit.

## Rules

- **Evidence, not vibes.** Every finding cites a file and line or a screenshot region.
- **Judge against the resolved canon, not taste.** A deviation from the project's design system is a finding even if it looks nice. A project with no system gets AIOS canon, and that absence is itself a P1 if the project will grow.
- **Never fix silently during an audit.** Audit reports; build fixes. Mixing them hides what changed.
- **Confirm after fixes.** Inspect one fresh batch after the combined correction pass. Stop cosmetic iteration after confirmation.

## Done when

1. Line one states PASS or FAIL with P0 and P1 counts, the heuristic score, and the canon judged against.
2. Every finding has a location, a plain-English line, and a concrete fix.
3. Screenshots exist for 3 sizes (plus empty and error states when the surface shows data).
