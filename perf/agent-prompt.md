# Perf improvement agent prompt

Scheduled prompt for the every-2-days benchmark run. Target: Haiku (procedural scaffolding). The schedule sends the code block below to one Haiku chat with full write access. After an edit here, update the scheduled task prompt with the same text.

```markdown
## Objective

Make Leonidas Code measurably faster, one small verified change per run. All benchmark data lives in C:/lcw/perf-bench/perf/benchmarks.jsonl.

## Environment

- Bench checkout: C:/lcw/perf-bench, a git worktree on branch perf/harness with its own node_modules. Work only here.
- Benchmark: from C:/lcw/perf-bench run node --no-deprecation scripts/perf-bench.mjs --note "<text>". Add --only <step,step> to run some steps.
- Steps: typecheck_web, typecheck_server, test_web, test_desktop, build_web, server_live, boot_web. Each run appends one JSON line (ms, ok, error counts, bundle KB). server_live boots the server on a temp home: readyMs (boot), commandMs (one live command), idleMb and afterCommandMb (memory).
- History of ideas: perf/journal.md. Read it first.
- Timings vary up to 2x with machine load. Trust a change only when it repeats.

## Steps

1. In C:/lcw/perf-bench run git switch perf/harness, git fetch -q origin, then git rebase origin/main. If the rebase stops, run git rebase --abort, record it in the journal, and measure the current tip. If pnpm-lock.yaml changed, run pnpm install --frozen-lockfile.
2. Run the full benchmark with --note "scheduled baseline".
3. Compare the new line with the median of the last 5 lines. A regression is a step 25% or more slower, idleMb up 15% or more, jsKb or largestJsKb up 5% or more, a new failure, or a higher error count.
4. If a step newly fails: record the failure and its detail in the journal. Skip to step 9.
5. Pick ONE target: the largest regression, else the largest JS chunk, else the slowest step. Skip ideas the journal marks as tried.
6. Run git switch -c perf/<YYYY-MM-DD>-<short-slug>. Make one small change in 1 to 3 source files. Good candidates: lazy-load a heavy import, split a large chunk, drop an unused dependency.
7. Run the affected steps twice with --only and --note "perf/<slug>: <change>". Run the scoped tests for the files you changed with node_modules/.bin/vp test run <files>.
8. Keep the change only if both runs beat the baseline by 5% or more and all tests pass. Then commit on the branch with the before and after numbers in the message. Else run git checkout -- . and git switch perf/harness, then git branch -D the branch.
9. Run git switch perf/harness. Append to perf/journal.md: date, baseline numbers, regressions, the change tried, before -> after, kept or reverted, and the next idea.
10. Commit on perf/harness: git commit -m "perf(bench): run <date>" -- perf/benchmarks.jsonl perf/journal.md

## Rules

- Kill only a PID you started. Never kill by name or pattern.
- DO NOT push any branch. A push to main ships a release to users.
- DO NOT touch D:/Leonidas AIOS/projects/leonidas-app, ~/.t3/userdata, or any other checkout.
- DO NOT change test files, TEST_FILES, or benchmark steps to make numbers look better.
- Write in short, plain sentences. No em dash.

## Done when

- perf/benchmarks.jsonl has a new line from today.
- perf/journal.md has a new entry from today, committed on perf/harness.
- Any kept change is a commit on a perf/ branch with before and after numbers. Nothing is pushed.

## Final reply

Five lines: baseline total ms, regressions found, change tried, before -> after, branch name or "reverted".
```
