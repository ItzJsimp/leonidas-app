# Perf journal

One entry per benchmark run, newest last. Data: [benchmarks.jsonl](./benchmarks.jsonl). Script: [perf-bench.mjs](../scripts/perf-bench.mjs). Agent prompt: [agent-prompt.md](./agent-prompt.md).

## 2026-10-15: baseline (commit bc20cdd351)

- Steps (see the first line of benchmarks.jsonl): typecheck_web 2648 ms warm (25744 ms cold), typecheck_server 58786 ms with 19 known errors, test_web 10387 ms (47 pass), test_desktop 4562 ms (21 pass), build_web 89393 ms, boot_web 13956 ms. Total 180110 ms.
- Bundle: dist 123058 KB, JS 28884 KB, largest JS chunk 2925 KB.
- Noise: an earlier run the same hour had typecheck_server 30715 ms and build_web 82334 ms. Other agents load this machine; expect up to 2x swings.
- Biggest targets: build_web (about 50% of total time) and the 2925 KB chunk.
- Next idea: find what is in the largest JS chunk and lazy-load it.

## 2026-10-15: scheduled run (commit 22f0224229)

- Merge: origin/main merge into perf/harness stopped. The vp pre-commit hook ran `vp fmt` on 125 staged files and failed with "The command line is too long". The hook was not bypassed. The merge was discarded with `git reset --hard HEAD`. Nothing was lost: the staged content came from origin/main.
- Result: this run measured the perf/harness tip (22f0224229), not the latest origin/main.
- Steps (before in the 14:45 baseline -> now): typecheck_web 2648 -> 1017 ms, typecheck_server 58786 -> 18947 ms (both runs: 19 known errors, same failure), test_web 10387 -> 9313 ms (47 pass), test_desktop 4562 -> 3088 ms (21 pass), build_web 89393 -> 49422 ms, boot_web 13956 -> 13600 ms. Total 180110 -> 95557 ms.
- Bundle: unchanged (dist 123058 KB, JS 28884 KB, largest JS chunk 2925 KB).
- Regressions: none. Every step is faster. The drop is load noise, not a code change.
- Largest chunk: heic-to (2925 KB) is already a dynamic import (imageCompression.ts). It does not load at boot. Not a target.
- Change tried: none. No clear static import of a heavy library in the 1307 KB _chat chunk was found in one pass. The commit blocker also stops larger changes for now.
- Kept or reverted: nothing to keep or revert.
- Next idea: fix the pre-commit hook for Windows (batch `vp fmt` files, or skip it for bench files). Then merge origin/main. Then map the modules in the _chat chunk (for example with a bundle visualizer) and lazy-load the largest one that is not used at boot.

## 2026-10-24: scheduled baseline (commit 2855b225b6, origin/main)

- Setup: the bench worktree C:/lcw/perf-bench did not exist. Created it as a detached worktree of origin/main and ran pnpm install --frozen-lockfile (2m 29s). The brief expected it to exist already.
- Steps (2026-10-15 15:00 run -> now): typecheck_web 1017 -> 13706 ms (cold cache in a fresh worktree, not a code change), typecheck_server 18947 ms with 19 errors -> 16040 ms with 0 errors, test_web 9313 ms (47 pass) -> 2559 ms (51 pass), test_desktop 3088 ms (21 pass) -> 3931 ms (21 pass), build_web 49422 -> 51662 ms, boot_web 13600 -> 13879 ms, server_live new step: 19330 ms (ready 10576 ms, idle 357 MB).
- Total: 95557 -> 121438 ms. Failures: none.
- Bundle: total 123058 -> 127486 KB, JS 28884 -> 29891 KB (+3.5%, under the 5% gate). Largest JS chunk unchanged at 2925 KB.
- Regressions: none at the 15% gate for steps. typecheck_web is cold-cache only. The JS size rise is under 5%.
- Change tried: none this run. Target by rule: slowest step is build_web (51.7 s). Not attempted because this run was the baseline; the journal idea is to map the _chat chunk and lazy-load a large module not used at boot.
- Kept or reverted: nothing to keep or revert.
- Next idea: run the build with a bundle visualizer, find the largest module in the _chat chunk that boot does not need, and lazy-load it. Re-run with --only build_web,boot_web.
