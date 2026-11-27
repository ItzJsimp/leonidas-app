# Adversarial Chaos & Environmental Stress Matrix

Pre-commit stress checks for Phase 7 implementation per `standards/execution-standard.md`. Run these checks once a slice reaches Green on happy-path inputs to guarantee environmental resilience before committing.

---

## 1. The 4 Chaos Probing Vectors

| Vector                            | Failure Mode                                                                                 | Concrete Probe / Command                                                                                            | Expected Behavior                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **1. Dirty Paths & Spaces**       | Scripts break when executed inside paths with spaces (e.g. `<repo>/`) or Unicode characters. | Pass target paths containing spaces, accents, or hyphens wrapped in quotes.                                         | Paths resolve via literal pathing (`-LiteralPath`), quotes remain intact, zero argument splitting errors.    |
| **2. Null & Empty Streams**       | Cmdlet or function crashes on `$null`, empty string `""`, or `@()` array pipeline input.     | Pipe `$null` or `@()` directly into the function or test command: `$null \| Test-TargetFunction`.                   | Handles empty input gracefully with early return or validation error; no unhandled `NullReferenceException`. |
| **3. Line Endings & Encoding**    | Git churn or regex mismatches caused by CRLF vs LF line endings or missing UTF-8 encoding.   | Verify regex handles `\r?\n` and file writes use UTF-8 without BOM: `Get-Content $path -Raw`.                       | Multi-line parsing survives both CRLF and LF; diffs show zero phantom whitespace changes.                    |
| **4. Subprocess & Pipe Trapping** | Native CLI tool returns non-zero exit code but parent shell continues silently.              | Test command failure and assert `$LASTEXITCODE -ne 0` or catch termination under `$ErrorActionPreference = 'Stop'`. | Non-zero exit code halts execution immediately; errors are captured without silent swallowed failures.       |

---

## 2. Fast Verification Recipes

### PowerShell AST & Script Invariant Check

```powershell
# Verify syntax and strict parsing in <100ms
$tokens = $null; $errors = $null
[System.Management.Automation.Language.Parser]::ParseInput((Get-Content -LiteralPath $TargetScript -Raw), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw "AST Syntax Error: $($errors[0].Message)" }
```

### Subprocess Exit Trap

```powershell
& git status 2>&1
if ($LASTEXITCODE -ne 0) { throw "Subprocess failed with exit code $LASTEXITCODE" }
```

### KaTeX / Currency Collision Invariant (Markdown & Output Text)

- Inspect generated markdown text: verify literal currency is escaped (`\$15.00`) or backtick-wrapped (`$15.00`) to prevent KaTeX math rendering corruptions.
