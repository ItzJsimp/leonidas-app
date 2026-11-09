# Persistence gate

A composed prompt stays in chat unless it earns a file.

1. **Reuse test.** Will the prompt run 3 to 5+ times, or on a cadence (daily briefing, substrate audit, release checklist)?
   - No: keep it in chat or in the task notes.
   - Yes: ask the user: "This prompt qualifies as a reusable asset (cadence >=3-5 runs). Save it to `prompts/<slug>.md`?"
2. **Save after a yes.**
   - Filename: `prompts/<action>-<domain>-<descriptor>.md`, kebab-case (`audit-substrate-health.md`).
   - Frontmatter:

     ```yaml
     ---
     type: prompt
     id: prompt-<slug>
     title: "Descriptive Actionable Title"
     description: "One-line summary of prompt execution."
     input_source: "active session / working tree"
     target_sink: "chat response | files"
     token_budget: 1500
     model_affinity: "frontier | fast | any"
     status: "Active"
     verified: YYYY-MM-DD
     ---
     ```

   - Rebuild the index: `pwsh scripts/Build-Index.ps1`. The index file is generated, so never hand-edit it.
