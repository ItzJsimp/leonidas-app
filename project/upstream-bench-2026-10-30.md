# Server bench: base vs batch 2 (step 0 of the deferred-7 plan)

Plan: [upstream-triage-2026-10-30.md](./upstream-triage-2026-10-30.md). Date: 2026-10-30.

## What was measured

- **Tool:** `scripts/server-bench.mjs` on branch `upstream-port/2026-10-30` (worktree `C:/lcw/up-port`). It copies a frozen database snapshot to a temp home, boots one checkout's server, and times HTTP reads. It prints one JSON line per run.
- **Data:** a read-only snapshot of the live database (`VACUUM INTO`, no write to the live file). 1131 threads, 179,116 turn items, 5.0 GB, migration 65. The snapshot stays on this machine in `C:/lcw/p5/bench-fixture` and never goes into a repo.
- **Base:** `6a95384a6a` (`origin/main`, worktree `C:/lcw/up-hotfix`). **Batch 2:** `3b3006b754` (5 upstream commits plus the typecheck fix).
- **Runs:** 3 per tree, alternating, 9 timed calls per metric. The Scribe engine was off. The batch 2 boot includes migration 66 (two new indexes).

## Results (median of 3 runs; range in brackets)

| Metric                                           | Base                      | Batch 2                   | Change |
| ------------------------------------------------ | ------------------------- | ------------------------- | ------ |
| Boot to ready (ms)                               | 15,406 [15,377 to 15,418] | 13,487 [10,486 to 14,042] | -12%   |
| Shell snapshot, cold (ms)                        | 402.8 [389 to 861]        | 468.5 [246 to 679]        | +16%   |
| Shell snapshot, warm p50 (ms)                    | 315.2 [271 to 397]        | 298.7 [181 to 311]        | -5%    |
| Thread open, largest (2076 items), warm p50 (ms) | 178.7 [149 to 224]        | 181.9 [134 to 184]        | +2%    |
| Thread open, 797 items, warm p50 (ms)            | 119.9 [105 to 136]        | 135.0 [105 to 151]        | +13%   |
| Shell under write load, p50 (ms)                 | 327.3 [309 to 516]        | 277.5 [245 to 303]        | -15%   |
| Idle file reads per minute                       | 10,337                    | 10,294                    | 0%     |
| Idle read volume (KB per minute)                 | 39,190                    | 39,033                    | 0%     |
| Idle CPU (seconds per minute)                    | 1.16                      | 1.04                      | -11%   |

Shell snapshot size: 2.35 MB on both trees.

## What the numbers say

- **Batch 2 makes no speed claim.** Every change sits inside the run-to-run spread of the base tree (warm shell: 271 to 397 ms on the same code). No metric moved outside that spread. Do not report batch 2 as faster.
- **Step 1 (SQLite reader pool) shows no gap.** Base shell reads under 20 writes per second took 327 ms, against 315 ms with no writes. The load was light (small `project.update` writes). A heavier writer may show a gap. The plan gate says to drop a step that moves no number.
- **Idle cost is real and equal on both trees.** With no client connected, the server tree does about 10,300 file reads (39 MB) and 1.1 CPU seconds per minute. That is 172 reads per second. The cause is not known. It may be SQLite, git processes, or a poll. Find it before step 4.
- **Shell snapshot weighs 2.35 MB and takes about 300 ms warm.** This is the number step 4 (#27106, #27098) must lower.

## Not measured (gaps)

- **Git status time through the server.** It needs the WebSocket RPC. The bench has no WebSocket client yet. Step 2 needs one, or an in-process test of `GitVcsDriverCore.ts`.
- **Query count per minute.** The bench counts file reads of the process tree, which is a proxy. A true count needs a hook in the SQL client.
- **Runs with a connected client.** Real idle load comes from client subscriptions over WebSocket.
- One base run had a bad idle counter (the process tree changed). It is dropped from the idle rows.

## Next

1. Find what causes 172 idle file reads per second (trace which files the server tree reads).
2. Add a WebSocket client to the bench for git status and a connected-client idle run.
3. Re-run both trees with 5 runs each before any speed claim.
