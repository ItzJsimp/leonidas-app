# Leonidas: shipped roadmap (tick when merged to main)

Version plan from v0.35 on: [project-roadmap.json](../project-roadmap.json).

- [x] Subscription token calibration ([v0.2.0](https://github.com/ItzJsimp/leonidas-app/releases/tag/v0.2.0)): session/weekly estimates pair local Claude/Codex tokens with provider quota percentages. Google AI Pro still needs a quota source.
- [x] Shared repo, based on a teammate's build (branch `mob-base`, now `main`)
- [x] Push-to-update: every push to `main` builds the Windows installer and publishes a `0.x` release; the updater shows the toast
- [x] Update toast proven across both machines (sound, OS notification, confirmation dialog)
- [x] Token counter: output and thinking tokens, current-turn t/s, recent-turn averages; missing telemetry stays visible
- [x] Synced task board panel (GitHub Issues store; same list on both machines within about 10 seconds)
- [x] Prompt predictor: ghost text from the user's Scribe `history.jsonl`, Tab accepts
- [x] Thin rebrand to Leonidas; internal ids unchanged so data survives
- [x] Subagents: any chat starts a named subagent as a lean persona; confirm card for premium models; Subagents view to see, create and edit them; `@name` and an attach tab; starters in new setups
- [x] Leonidas shell: Command Center views as a tab; Scribe stays a tray app with a localhost API
- [x] Dev instance isolation: agents test on a separate dev app and never restart the live app
- [x] Agent activity bar above the composer, expanding to plan, next steps, files and reasoning
- [x] Limit failover: another provider takes over the same chat in one click

Not in this repo: the Scribe Copy tab and shared clipboard (Leonidas Scribe).
