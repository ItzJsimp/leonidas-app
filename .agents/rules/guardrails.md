# Guardrails: hooks and lint rules

A guardrail is code that enforces a rule. Text rules only ask. Add a guardrail when the same mistake happens twice, or once with a high cost (data loss, leaked secret, broken release). Do not add one for taste.

## Pick the lowest step that fits

1. **Lint rule:** the mistake is a code pattern. Add it to `oxlint-plugin-t3code/rules/` with a test (one bad case, one good case).
2. **Git hook:** the mistake appears at commit time. Edit `.vite-hooks/pre-commit`. It works for every author.
3. **Engine hook:** the mistake is an agent action or missing context. Claude reads `.claude/settings.json`. Codex reads `.codex/hooks.json`. The two files do not share config: add the hook to both and point both at one script. Antigravity has no known hook file here.
4. **Text rule:** only when code cannot detect the mistake. One line.

## Quality bar

- One job. Finishes in 10 seconds or less. Set a `timeout`.
- Fails open: a broken hook exits 0 and prints nothing. Block only on a real match.
- A block message states the rule, the cause and the fix in 3 short lines.
- Tested. A hook has a manual run with a sample input. Prove it fires in a live session before you say "done".
- No false alarms. A noisy rule gets disabled, so tune it or remove it.
- Repo-relative paths only. No secret, no personal path (this repo is public).
- Never weaken a guardrail to pass a change. Fix the code or ask.

Full standard (AIOS, when present): `../../standards/hooks-and-lint-standard.md`.

## Register

Add or remove a row in the same commit as the guardrail.

| Guardrail                             | Kind        | Engine or tool                                                                 | Event or scope                           | What it stops                                                                                                                                                                         | Test                                                                                        |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/Session-Start.ps1`           | engine hook | Claude, Codex                                                                  | `SessionStart`                           | Stale source, tasks and next action at session start                                                                                                                                  | Start a session and read the hook output                                                    |
| `scripts/Hook-PushCompleteSignal.ps1` | engine hook | Claude, Codex                                                                  | `PostToolUse` on Bash                    | A push to main with no completion signal                                                                                                                                              | Run a push in a test clone                                                                  |
| `.claude/hooks/laya-gate.py`          | engine hook | Claude                                                                         | `PreToolUse` on Bash                     | Unsafe Bash calls, when the per-user Laya pack is installed                                                                                                                           | Run with no pack: exit 0, no output                                                         |
| `.vite-hooks/pre-commit`              | git hook    | git                                                                            | `pre-commit`                             | A commit with unchecked code (`guard-unchecked-commit.mjs`, `vp staged`)                                                                                                              | Stage a bad file and commit                                                                 |
| `oxlint-plugin-t3code/rules/*.ts`     | lint rules  | oxlint (`vite.config.ts`)                                                      | Editor, pre-commit, CI                   | Repo-specific bad patterns (20 rules, 16 with a test; no test yet: `no-low-value-comments`, `no-outset-state-indicators`, `no-raw-resize-observer`, `require-centered-scroll-gutter`) | `vp test run oxlint-plugin-t3code`                                                          |
| `scripts/Test-DevTip.ps1`             | merge gate  | merge queue (`Invoke-MergeQueue.ps1`)                                          | Before a push to `main`                  | New type errors, and new failures in changed or sibling tests, including web browser tests (not indirect importers)                                                                   | Run it at `64aacbc876` with `-Base 64aacbc876^`: red on `BottomStatusRail.browser.test.tsx` |
| `scripts/guard-commit-message.ts`     | git hook    | git (`.vite-hooks/commit-msg`)                                                 | `commit-msg`                             | A bad or missing Release-Note trailer on a user-visible commit, before the merge queue run                                                                                            | `vp test run scripts/guard-commit-message.test.ts`; commit with a 20-word note              |
| `scripts/guard-staged-policy.mjs`     | git hook    | git (`.vite-hooks/pre-commit`)                                                 | `pre-commit`                             | A secret, personal path, em dash or assigned `VITE_HTTP_URL` or `VITE_WS_URL` in added lines                                                                                          | `vp test run scripts/guard-staged-policy.test.ts`; stage a bad line                         |
| `scripts/agent-guard.mjs` (edit)      | engine hook | Claude (`.claude/settings.json`), Codex (`.codex/hooks.json`, not proven live) | `PreToolUse` on Edit, Write, apply_patch | An agent edit inside the main checkout                                                                                                                                                | `vp test run scripts/agent-guard.test.ts`; edit in the main checkout                        |
| `scripts/agent-guard.mjs` (bash)      | engine hook | Claude, Codex (not proven live)                                                | `PreToolUse` on Bash                     | Kill by pattern (`pkill`, `taskkill /IM`, `Stop-Process -Name`) and repo-wide runs (`vp check`, `-r`)                                                                                 | same test; run `pkill -f x`                                                                 |

Overrides: `LEONIDAS_ALLOW_STAGED_POLICY=1` skips the staged scan for one commit. `LEONIDAS_ALLOW_MAIN_EDIT=1` allows a main checkout edit. A user-approved repo-wide run adds the token `REPO_WIDE_APPROVED` to the command. Kill by pattern has no override.
