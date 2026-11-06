# Plain words sweep: helper brief

Goal: a non-developer understands every user-visible string the first time.

## Read first

- `docs/user/glossary.md` in `C:/lcw/plain-words`. Use the first-column word for each thing. One word for one thing.

## What to change

- Only text a user sees: JSX text, labels, button text, titles, tooltips, `aria-label`, placeholders, toasts, dialog text, empty states, error messages shown in the UI, menu items, notices.
- Replace jargon with the glossary word. When the plain word loses needed detail, keep the plain word and add a one-line tooltip with the old term, using the tooltip component already used in that folder.
- Every button label starts with a verb ("Save", "Add AI account").
- Every empty or error message says what to do next ("No chats yet. Type a message below to start one.").
- Remove every user-visible "T3 Code" or "T3" product name: say "Leonidas". Keep "T3 Code" only as credit to the upstream project (About, licenses).
- Write in ASD-STE100 short form: short active sentences, one idea each, simple tense, no idioms. No em dash (U+2014).

## Do not change

- Code identifiers, ids, keys, storage keys, env vars, analytics event names, test ids, URLs, file paths, `@t3tools/*`, `T3CODE_*`, `~/.t3`, `com.t3tools.t3code`.
- Prompts or instructions sent to AI models, and developer-only log lines.
- The permission mode names (another task owns them).
- Files outside your slice.
- Product names of other companies (Claude, Codex, GitHub).

## Tests

- When you change a string that a test asserts, update the test.
- Run only scoped tests: `node_modules/.bin/vp test run <test files>` from `C:/lcw/plain-words`. If `node_modules/.bin/vp` does not exist yet, the install still runs; wait and retry (it takes about 8 minutes).
- Web typecheck: from `apps/web`, `../../node_modules/.bin/vp run typecheck`. Report only errors in files you changed.

## Git

- Do not commit, stash, switch branches or reset. The lead reviews and commits.

## Return (short)

1. Files changed (count) and strings changed (rough count).
2. New words you needed that are not in the glossary, with your choice.
3. Tests run: command and pass or fail count.
4. Files in your slice you did not finish.
