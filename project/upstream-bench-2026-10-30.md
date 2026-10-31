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
- **Idle file reads are SQLite page reads, and they are cheap (traced 2026-10-30, see the section below).** With no client connected, the server tree does about 10,300 file reads (39 MB) and 1.1 CPU seconds per minute. That is 172 reads per second, but SQL time is only about 0.2 seconds per minute.
- **Shell snapshot weighs 2.35 MB and takes about 300 ms warm.** This is the number step 4 (#27106, #27098) must lower.

## Not measured (gaps)

- **Git status time through the server:** measured since the WebSocket client was added (see the section below).
- **Query count per minute.** The bench counts file reads of the process tree, which is a proxy. A true count needs a hook in the SQL client.
- **Runs with a connected client:** measured since the WebSocket client was added (see the section below).
- One base run had a bad idle counter (the process tree changed). It is dropped from the idle rows.

## Next

1. Find what causes 172 idle file reads per second (trace which files the server tree reads).
2. Add a WebSocket client to the bench for git status and a connected-client idle run.
3. Re-run both trees with 5 runs each before any speed claim.

## Idle trace (2026-10-30)

Method: a preload (`--import`) counted every `node:sqlite` call and every `fs` call in the idle server (no client, 45 s window after a 30 s settle). A per-process sampler checked the process tree. Scripts: `C:/lcw/p5/idle-probe.mjs`, `sql-probe.mjs`, `fs-probe.mjs`, `page-read-test.mjs` (not in a repo).

- **Source of the reads:** the server's own `node.exe`, 13,400 read operations and 52 MB per minute, 3.9 KB each. Child processes (`nvidia-smi`, `typeperf`, `powershell` from the hardware watch) read almost nothing.
- **SQL:** 117 statements per minute in total, using about 220 ms. The most frequent: `BEGIN IMMEDIATE` and `COMMIT` (16 each), the failed-run check (13), scheduled tasks due (13), saved item effects (13 and 13), the effect outbox lease (10 and 10). The heaviest is the shell thread-rows query (once a minute, 167 ms).
- **fs:** only 289 calls per minute, all `stat`, `access` and `lstat` checks of worktree folders (`C:/lcw` 65 per minute, `C:/` 51). No large file reads.
- **Why 117 statements make 13,400 reads:** one scan of the thread payloads costs 585 read operations (2.3 MB, 3 ms), even from cache. The SQLite page cache is 2 MB (`cache_size -2000`, 4 KB pages), so each query rereads its pages through the OS. The OS file cache serves them.

**Verdict:** the idle read count looks large but costs little. Do not treat it as a defect. Option if the count matters: raise `PRAGMA cache_size` or set `PRAGMA mmap_size` (would cut `ReadFile` calls; needs a before and after bench with a connected client). The remaining idle CPU (about 0.9 of 1.1 seconds per minute) is not SQL or fs. A `--cpu-prof` run would find it. Not done.

## WebSocket bench (2026-10-30, second pass)

Tools: `apps/server/scripts/server-bench-ws.ts` (WebSocket client), `scripts/server-bench.mjs` (adds git status and a connected-client idle run), `scripts/server-bench-git.mjs` (local git status per folder on an empty home). Base `6a95384a6a`, batch 2 `357febc81a`. 3 alternating runs per tree.

| Metric (median of 3)                                           | Base   | Batch 2 |
| -------------------------------------------------------------- | ------ | ------- |
| Shell snapshot, warm p50 (ms)                                  | 219    | 224     |
| Thread open, largest, warm p50 (ms)                            | 134    | 124     |
| Shell under write load, p50 (ms)                               | 208    | 205     |
| Explicit git refresh through the server, warm p50 (ms)         | 2,049  | 2,081   |
| Raw `git status` in the same folder (ms)                       | 103    | 109     |
| First local git status of a new folder through the server (ms) | 1,107  | 1,107   |
| Idle file reads per minute, no client                          | 13,743 | 13,787  |
| Idle file reads per minute, client connected                   | 13,699 | 13,702  |
| Idle CPU seconds per minute, client connected                  | 0.84   | 1.04    |

- **Batch 2 still shows no speed change.** All pairs sit inside the noise. This pass had less noise than the first (warm shell 212 to 228 ms on the base tree).
- **Git status has a real gap (step 2).** A new folder takes about 1.1 s through the server, while raw `git status` takes about 0.11 s in the same folder. That is 10 times slower. The overhead is about 1.0 s for each folder. The explicit refresh takes 2.0 s because it also does a remote check.
- **A connected client adds no idle cost.** The three held subscriptions (server config, shell stream, git status) gave 3 events in 65 s and the same reads as no client.
- **Plan impact:** step 2 (git status, #27103) has a measurable target: bring 1.1 s toward 0.2 s. Steps 1 and 4 still show no gap. Step 3 (connection routing) has no number yet.
- **Not known:** where the 1.0 s goes (extra git commands per status, process start cost on Windows, or serial calls). Count the git processes the server starts for one status. That is the next trace.
