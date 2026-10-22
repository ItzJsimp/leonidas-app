---
name: "safe-parallel-commit"
description: "Commit safely during concurrent sessions: explicit path staging only, pre-commit recovery, and scope checks. Use when committing while other sessions edit the same repo."
category: code
scope: structural
distribution: core
verified: 2026-09-15
related:
  [
    "scoped-git-staging-guard",
    "cross-session-git-collision",
    "concurrent-session-commit-collisions",
  ]
---

# Safe Parallel Commit

the user routinely runs multiple Claude Code sessions against `<repo root>` at once. They share one working tree and one git index, there is no isolation between them (see [`memory/parallel-agent-git-worktree-isolation.md`](../../../memory/parallel-agent-git-worktree-isolation.md), decided but not yet wired up for ad-hoc chats). Commit only what this session actually changed, every time.

## Procedure

1. **Full unscoped `git status --short` immediately before staging anything**, not a path-scoped one. A path-scoped check only proves _your_ files are clean, it says nothing about what else is sitting in the shared index from another live session.
2. **Stage explicit paths only.** Never `git add -A`, `git add -u`, `git add .`, or `git add :/`. A shell-level guard (ADR-0037) already blocks the bulk flags and will error with `BLOCKED: 'git add -u' stages the whole tree...`, that error is expected, not a bug, switch to explicit paths. For a large batch, write the file list to a temp file and `xargs -a <file> git add --`, strip trailing `\r` first if the list was built via a Windows-context heredoc or script (`sed -i 's/\r$//' <file>`), a stray `\r` turns the last path into a literal non-matching pathspec.
3. **If the pre-commit hook rejects the commit citing a file you never touched** (commonly `Invalid YAML frontmatter in staged file: <path>`), that file was already staged by another live session before you started, not by your `git add`. Confirm with `git status --short -- <path>` (a bare `A ` or `M ` with no leading space means staged). Unstage it with `git restore --staged <path>`, this only changes staging status, the file's content on disk is untouched and the other session can re-stage it once it fixes the issue. Never edit or discard content you don't recognize.
4. **After staging, run `git diff --cached --name-only` and check every line is a file you meant to touch** before running `git commit`. `git commit` commits the _entire_ current index, not just what you `git add`ed this turn; a file another session staged minutes ago rides along silently otherwise.
5. **To commit a subset while other sessions' files share the index, use a pathspec-scoped commit** (`git commit -m "<Prefix>: <msg>" --pathspec-from-file=<file>` with one path per line), never stage-then-commit: `git commit` always takes the whole index, but commit-with-pathspec commits only the named paths and leaves everything else staged exactly as it was. Pathspec commits do not pick up untracked files - `git add -- <paths>` those explicitly first.
6. **Commit messages must match the repo hook format `<Prefix>: <Description>` with a valid prefix** (Decision, Fix, Build, Canon, Audit, Task, Chore, Docs, Refactor, Test, Sync, Export, Verify). The pre-commit hook rejects any other prefix, including a project or feature name used as one, which wastes a commit attempt - pick the prefix before running the commit.
7. **Expect the post-commit Skill Synchronizer hook to regenerate generated files** (`TASKS.md`, `tasks/tasks-index.md`) during the commit. If `git status` shows fresh residue on those files afterward, `git add` just them: if the diff was only line-ending noise it collapses to a clean tree with "nothing to commit", which is success, not failure.
8. **When another session has uncommitted edits in the same file you changed**, pathspec commits take the whole working-tree copy and would ship their half-done work. Commit only your hunk through a temporary index: `export GIT_INDEX_FILE=.git/index-tmp; git read-tree HEAD; git add -- <your whole files>`, then for the shared file write `HEAD`'s copy plus only your change to a scratch file and `git update-index --cacheinfo 100644,$(git hash-object -w <scratch>),<path>`; commit, `unset GIT_INDEX_FILE`, delete the temp index, and `git reset -q -- <your paths>` so the real index matches the new HEAD without touching other sessions' staged entries. The pre-commit hook still regenerates and stages every generated index into that commit, and one missing pathspec makes `git add` abort the whole list (use `git rm --cached` for moved or deleted paths).
9. **If a commit already landed with unintended files** (caught after the fact): `git reset --soft HEAD~1` uncommits without losing any change (everything returns to staged), then repeat steps 1-4 to re-stage only your files and re-commit. The other session's files return to their pre-commit staged/unstaged state, unaffected.

## Completion Criteria

- [ ] `git diff --cached --name-only` before commit lists only files this session intentionally changed.
- [ ] No `git add -A`, `-u`, `.`, or `:/` was run (would have errored via ADR-0037's guard if attempted).
- [ ] Any stray staged file from another session was unstaged, never edited or discarded.
