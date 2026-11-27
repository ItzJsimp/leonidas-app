# Verification Patterns Reference

Guidelines for establishing the observable Red Phase and validating implementation invariants across AIOS codebases, scripting, and governance systems.

---

## 1. The Counterfactual Mutation Inversion Gate (Anti-Tautology Invariant)

To guarantee an automated test is sensitive and not a vacuous or tautological pass:

1. **The Inversion Check:** Before marking a Green implementation complete, temporarily invert a single boolean condition, mutate a return literal, or disable the primary execution branch in the target code.
2. **Expected Sensitivity:** Re-run the test suite. The test suite MUST fail.
3. **Verdict:** If the test suite still passes green despite the mutated logic, the test is tautological or unexercised. Rewrite the test assertion before proceeding. Restore the valid logic once sensitivity is confirmed.

---

## 2. Static AST & Contract Verification (Pre-Flight Gate)

Run zero-token static syntax checks before spinning up long test suites:

- **PowerShell (AST Parsing):**
  ```powershell
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseInput((Get-Content -LiteralPath $path -Raw), [ref]$null, [ref]$errors)
  if ($errors.Count -gt 0) { throw "AST Parse Failure: $($errors[0].Message)" }
  ```
- **Python (AST Parsing):**
  ```python
  import ast
  ast.parse(open("path/to/script.py", encoding="utf-8").read())
  ```
- **Codebase Knowledge Graph Seam Tracing:**
  When modifying a shared symbol or cmdlet, trace inbound dependents via `codebase-memory-mcp` tools (`trace_path` with `direction="inbound"`) to ensure changes do not break unmocked callers across the repository.

---

## 3. Environment-Specific Red-Phase Patterns

### A. PowerShell & Automation Scripts

- **Strategy:** Targeted assertion script in `scratch/` or Pester test (`*.Tests.ps1`).
- **Red Phase:** Execute against current codebase; observe non-zero exit code or specific assertion failure indicating missing behavior.
- **Green Phase:** Implement minimal cmdlet logic; verify exit code 0 and all assertions passing.

### B. Markdown, Canon & Governance Documents

- **Strategy:** Targeted lint checks, regex assertions, or repo verification scripts (`Detect-Drift.ps1`, `Audit-Substrate.ps1`).
- **Red Phase:** Run validator and observe violation report (missing entry, broken relative link, invalid frontmatter).
- **Green Phase:** Update canon document; verify validator runs with 0 warnings/errors.

### C. Data Schemas, Configuration & Manifests

- **Strategy:** Schema validation parser or PowerShell data file validation.
- **Red Phase:** Test parser against schema; observe failure when new properties or constraints are absent.
- **Green Phase:** Update schema/manifest (`shared-manifest.psd1`); confirm parser succeeds.

### D. Frontend & Web Interfaces

- **Strategy:** Headless DOM assertions, component unit tests, or CLI contract checks.
- **Red Phase:** Run test runner; confirm missing UI element or behavior fails cleanly.
- **Green Phase:** Implement minimal markup and logic to satisfy the test.
