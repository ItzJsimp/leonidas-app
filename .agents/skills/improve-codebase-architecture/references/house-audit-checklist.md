# House audit checklist

Moved whole from the old `improve-codebase-architecture` skill on 2026-11-20. The skill itself now follows the upstream deepening flow. Use this checklist when the user asks for a mechanical structure audit, with a Mermaid diagram, instead of the visual report.

## Purpose

Inspects repository code organization, directory hierarchies, module boundaries, and dependency flows. Produces an actionable structural refactoring blueprint with Mermaid diagrams to decouple components and eliminate structural rot.

---

## Audit Checklist

1. **Module Coupling & Imports:** Scan for circular imports, deep relative path navigation (`../../../../`), and leaked abstractions.
2. **God Modules:** Detect files exceeding 500 lines or handling multiple unrelated responsibilities.
3. **Directory Semantics:** Verify that directories represent true functional domains rather than random file dumps.
4. **State Isolation:** Ensure configuration, secrets, and mutable state are separated from logic.

---

## Procedure

1. Run automated code scans (AST / regex dependency checks).
2. Construct current vs proposed module relationship diagram.
3. Quantify complexity drivers and rank refactoring targets by ROI.
4. Deliver phased refactoring plan with zero breaking changes during intermediate stages.

---

## Output Contract

- **Location:** `audits/architecture-audit-YYYY-MM-DD.md` or `projects/<project>/architecture-refactor.md`
- **Contents:**
  - Executive Architecture Scorecard
  - Mermaid Architecture Diagram (Current vs Proposed)
  - Ranked Refactoring Targets (File, Issue, Recommended Fix)
  - Phased Execution Checklist
