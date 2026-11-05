# Perf regression hunt: 2026-11-05

Scope: Leonidas Code request latency, UI freezes and crashes. Compared v0.124.18 (61c39b57ae, 2026-10-31) with v0.124.39 (41dcc912d3, installed). Result: **no fix was committed.** No root cause had a proven fix that met the rules. Open work is in task cards.

## Verdict

- **Server code:** no regression. Boot, startup lag and thread open are equal or better on v0.124.39. The sidebar shell is about 20 ms slower (see table).
- **Client code:** no regression. The first A/B showed a longer thread-switch freeze (209 to 262 ms). A follow-up with a steadier metric and 6 runs for each version did not reproduce it (see "Follow-up").
- **Memory leak:** confirmed, and it exists in both versions. ChatView keeps old render scopes through memoized callbacks. The JS heap grows about 1.5 to 1.8 MB for each 4 thread opens, after forced GC.
- **Crashes:** unconfirmed. There are 0 Leonidas Code events in the Windows Application log (IDs 1000, 1001, 1002, last 14 days). There are 0 `.dmp` files under `%APPDATA%`, `%LOCALAPPDATA%` or `CrashDumps`. There are 0 `render-process-gone` records in `renderer-history.ndjson` (from 11-04 00:23). Each restart in the window was an update install or a clean stop.
- **Disk:** C: (the NVMe disk with `statev2.sqlite`) had 0.00 GB free during this session. Jake freed space to 131 GB. The retained traces show no ENOSPC or SQLITE_FULL errors, so its effect on crashes is unconfirmed.

## Phase 1: regression window

- The server keeps only 12 h of traces (`server.trace.ndjson*`, 11 files of 10 MB). The desktop trace goes back to 10-27. Field data before 11-04 is gone.
- Backend ready time (desktop trace, start to `onReady`): 7 to 12 s from 10-28 to 10-31 morning. Then 51 s (10-31 16:19), 73 s (11-03 16:20, the 60 s readiness probe failed), 43 s, 40 s. On 11-04: 12 s, 12 s, 6 s. The bench does not show a code cause (boot table below), so these spikes are load or data, not code.
- Suspect range: v0.124.18..v0.124.39, 147 commits on origin/main. Bisect is not done yet (task card).

## Phase 2: baseline and A/B numbers

Method: [server-bench.mjs](./server-bench.mjs) (the project bench plus p95 and a 30 s post-ready lag probe) and [client-bench.mjs](./client-bench.mjs) (headless Chrome drives the built UI against a bench server). Both use the frozen fixture `C:/lcw/p5/bench-fixture` (1131 threads, 179k turn items, 4.7 GB). The runs alternate old and new, so machine load hits both. Raw lines: [ab1.jsonl](./ab1.jsonl), [client-ab1.jsonl](./client-ab1.jsonl).

### Server: 10 boots per version, 11 timed requests per boot (first request is the warm-up)

Each value is the median across boots, with the range across boots.

| Metric (ms)                        | v0.124.18           | v0.124.39          | Change      |
| ---------------------------------- | ------------------- | ------------------ | ----------- |
| Boot to ready                      | 9834 (9084..155651) | 9187 (8810..32983) | -7% (noise) |
| Startup lag p95 (30 s after ready) | 55.7 (36..84)       | 11.5 (2..87)       | -79%        |
| Startup lag max                    | 320 (205..1890)     | 115 (7..406)       | -64%        |
| Sidebar shell warm p50             | 197.7 (165..394)    | 232.8 (187..505)   | +18%        |
| Sidebar shell warm p95             | 226.6 (187..537)    | 294.6 (204..1290)  | +30%        |
| Thread open largest p50            | 129.9 (106..206)    | 118.5 (106..215)   | -9%         |
| Thread open largest p95            | 157.7 (111..218)    | 129.3 (108..235)   | -18%        |
| Shell under write p95              | 299.8 (187..410)    | 294.7 (209..878)   | -2%         |
| Idle CPU s/min                     | 0.6                 | 0.2                | -67%        |

Shell detail: the fast cluster moved from 165..176 ms to 187..194 ms. The payload grew 2.1% (2,349,692 to 2,399,915 bytes). P(old < new) = 0.72. This is probably real but small.

### Client: 3 runs per version, 10 cycles (each cycle opens 4 threads), 10 app starts

| Metric (ms)                             | v0.124.18          | v0.124.39          | Change       |
| --------------------------------------- | ------------------ | ------------------ | ------------ |
| App start (reload to timeline rows) p50 | 1126 (917..1160)   | 1160 (1154..1185)  | +3% (noise)  |
| App start p95                           | 1236 (1194..1251)  | 1286 (1285..1370)  | +4%          |
| Switch to largest thread p95            | 173.8 (160..187)   | 199.2 (181..229)   | +15%         |
| Switch p20 thread p95                   | 173.1 (130..176)   | 104.2 (102..128)   | -40%         |
| Long-thread scroll p95                  | 749.6 (722..917)   | 828.2 (691..849)   | +10% (noise) |
| **Worst long task in switches**         | **209 (196..229)** | **262 (251..301)** | **+25%**     |
| Long tasks over 200 ms                  | 2 (0..2)           | 2 (1..4)           | 0%           |
| JS heap after cycle 1, MB               | 66.4               | 70.3               | +6%          |
| JS heap after cycle 10, MB              | 83.6               | 82.8               | -1%          |

Heap series (MB, forced GC, one sample per cycle), old: 59.6, 66.4, 71.6, 73.0, 74.3, 75.9, 77.4, 78.8, 80.3, 81.8, 83.3. New: 67.0, 69.5, 73.8, 75.2, 76.8, 78.7, 80.6, 82.1, 83.7, 85.0, 86.4. DOM nodes and listeners stay flat.

Not measured: message send and first token. They need a live provider turn. Field data is used instead (Phase 5).

### Live app (v0.124.39, Jake's real data)

- Event-loop probe: [lagprobe.mjs](./lagprobe.mjs) timed `/.well-known/t3/environment` every 100 ms for 10 min. n = 5256, p50 1.5 ms, p95 6.5 ms, p99 88 ms, max 2701 ms, 32 probes over 200 ms. Raw: [lag-live-1.ndjson](./lag-live-1.ndjson).
- Renderer working set (main window): 314 MB at start to 785 MB after 1 h (11-04 20:09 to 21:10). Overnight idle growth: 590 to 853 MB from 01:25 to 08:56 (about 35 MB/h). One session peaked at 2634 MB.
- Database: `statev2.sqlite` is 5.6 GB. The legacy v1 table `orchestration_events` holds 2.47 GB (969k rows). `orchestration_v2_projection_turn_items` holds 1.1 GB. Jake decided to keep the legacy data for now.

## Phase 3 and 5: evidence and root causes

| #   | Symptom                                          | Cause                                                                                                                                                                                                                                                                                                                                                | Location                                                                                                                                                                                                                                                                                               | Proof                                                                                                                                                                                                                                                                 | Status                                                                                                                       |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Renderer memory grows during use                 | ChatView keeps old render scopes. V8 makes one context per render for all closures. A memoized callback from render K keeps all of render K, including `serverProjection` (thread data) and memoized callbacks from earlier renders.                                                                                                                 | [ChatView.tsx](../../apps/web/src/components/ChatView.tsx): `timelineRealContentOverflowsViewport` (line 6688, deps `[composerTimelineInset]`), `persistProjectScripts` (5274), `copyActiveThreadReference` (7364), root through the `onStartArena` prop (12294). 158 `useCallback`s in the component. | Heap snapshots after cycle 2 and 12: ChatView scope count 39 to 139. Largest-thread key strings 0 to 3570, while the last open thread was p40. Shortest GC-root path: fiber `pendingProps.onStartArena` to a chain of ChatView scopes. [heapdiff.txt](./heapdiff.txt) | Confirmed, exists in both versions. No fix: ChatView stays mounted across threads on purpose, so the fix is a design choice. |
| 2   | Thread switch freeze is longer                   | Not a regression. The first signal was one max over 3 runs, and it also counted first opens and forced-GC samples.                                                                                                                                                                                                                                   | Not found                                                                                                                                                                                                                                                                                              | Follow-up, 6 runs for each version: worst switch task 167..227 ms (old) and 154..225 ms (new)                                                                                                                                                                         | Not reproduced, closed                                                                                                       |
| 3   | Live stalls up to 2.7 s, worst right after start | Startup storm: usage scans, provider probes, storage cleanup, PR sync and editor discovery all start together. Unrelated spans share a max near 20.5 s at 18:37 and 20:09. Hypothesis: `TRANSCRIPT_READ_CONCURRENCY = 4` (UsageService.ts:104) equals the default libuv pool size, so file reads wait (`ServerSecretStore.get` p50 3 ms, max 4.3 s). | `apps/server/src/usage/UsageService.ts`, `storageCleanup.ts`, `provider/ProviderRegistry.ts`                                                                                                                                                                                                           | Trace correlation ([stalls.py](./stalls.py), [probecorr.py](./probecorr.py)): 46 stall windows (142 s) in 12 h                                                                                                                                                        | Unconfirmed: the bench did not go red (startup lag p95 11.5 ms), and these files did not change after 10-19                  |
| 4   | Provider refresh load                            | `server.refreshProviders` comes in bursts: 880 of 1427 gaps are under 1 s, up to 48 calls/min. Each call probes every provider CLI. Client p95 3.7 s.                                                                                                                                                                                                | Many web callers (CommandPalette, UsageOverlayCard, ChatComposer, ...)                                                                                                                                                                                                                                 | [rpc.py](./rpc.py), cadence check                                                                                                                                                                                                                                     | Unconfirmed as a regression                                                                                                  |
| 5   | Slow first token                                 | `ClaudeAgentSdkQueryRunner.open.mcpInit` p50 3.1 s, max 13.7 s (n=16). It waits for the Claude CLI to connect the user's MCP servers. The 90 s timeout has not changed since 10-13.                                                                                                                                                                  | `ClaudeAdapterV2.ts:766`                                                                                                                                                                                                                                                                               | Server spans                                                                                                                                                                                                                                                          | External (MCP server config), not a code regression                                                                          |
| 6   | Asset URLs slow on thread open                   | Client p50 652 ms against server handling p50 20 ms. Bursts of about 100 calls per second queue.                                                                                                                                                                                                                                                     | `assets.createUrl` callers                                                                                                                                                                                                                                                                             | Client vs server spans                                                                                                                                                                                                                                                | Unconfirmed as a regression                                                                                                  |

## Phase 4: sources

- Node.js docs, "Don't Block the Event Loop (or the Worker Pool)": https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop (the worker pool has 4 threads by default, and fs work shares it). Matches hypothesis 3. Not applied, because the bench did not reproduce it.
- libuv thread pool docs (`UV_THREADPOOL_SIZE`): https://docs.libuv.org/en/v1.x/threadpool.html
- Kevin Schiener, "Sneaky React Memory Leaks: How useCallback and closures can bite you" (2024): https://schiener.io/2024-03-03/react-closures . It describes the shared-context closure chain in cause 1.
- Chrome DevTools, "Fix memory problems": https://developer.chrome.com/docs/devtools/memory-problems (heap snapshot comparison and retainers, the method used here).

The sources were not fetched again in this session. Check each link before you apply a technique from it.

## Phase 6 to 8: fixes, re-benchmark, guards

No fix was committed, so there is no after number, no soak test and no new guard. The rules say: no fix without a proven cause and a measured gain. Each open item has a task card with testable gates.

## Follow-up: thread-switch freeze (bisect request)

- **Why no bisect:** the first bisect step gave 196 ms and 315 ms on the same commit. One max per run is too noisy to judge a commit. I stopped the bisect after 1 step.
- **New metric:** [client-bench.mjs](./client-bench.mjs) now records the longest task inside each timed switch (`perSwitchLongTask`), and the first open of each thread (`coldOpen`). Raw: [client-ab2.jsonl](./client-ab2.jsonl), [client-ab3.jsonl](./client-ab3.jsonl). Summary script: [coldagg.py](./coldagg.py).
- **Forced GC check:** 5 forced GCs gave one long task of 85 ms (old) and 72 ms (new). GC explains only part of the first signal.

| Metric (ms), 6 runs for each version | v0.124.18                    | v0.124.39                    |
| ------------------------------------ | ---------------------------- | ---------------------------- |
| Per-switch longest task p90, by run  | 142, 155, 160, 163, 165, 168 | 111, 116, 143, 145, 154, 163 |
| Per-switch longest task max, by run  | 167, 178, 199, 200, 203, 227 | 154, 161, 184, 194, 203, 225 |
| First open longest task (n=12)       | median 98, max 171           | median 97, max 174           |
| First open time (n=12)               | median 81, max 172           | median 100, max 175          |

First open time is +19 ms at the median, but the ranges overlap (48..172 and 63..175). This is inside the noise, so I do not report it as a gain or a loss.

## Attempts ledger

| Idea                                          | Result                                                                              | Verdict                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Server code regression v0.124.18 to v0.124.39 | 10 boots each, no metric worse beyond noise except shell +18%                       | Not a server regression                                  |
| Threadpool starvation at startup              | Bench startup lag p95 11.5 ms (green), so the bench cannot go red on it             | Unconfirmed, needs a loop that reproduces the live storm |
| Bisect the thread-switch freeze               | First step 196 and 315 ms on one commit. Steadier metric: no difference over 6 runs | Stopped, not a regression                                |
