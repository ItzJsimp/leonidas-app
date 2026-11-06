# Shared browser release audit exception

Owner: Jake. Expires: 2026-11-01.

Jake approved this exception and release at Gate 2 on 2026-10-31.
It covers only the existing `vp run knip:check` findings listed below.
The shared browser update adds none of these files or dependencies.
New findings are not covered. All scoped code checks must pass.

Existing unused-file findings:

- [Desktop snip preload](../../apps/desktop/src/snip-overlay-preload.ts)
- [Crash worker](../../apps/server/src/crash/crashWorker.ts)
- [AIOS home card](../../apps/web/src/components/taskBoard/AiosHomeCard.tsx)
- [Home extra cards](../../apps/web/src/components/taskBoard/HomeExtraCards.tsx)
- [Laya monitor card](../../apps/web/src/components/taskBoard/LayaMonitorCard.tsx)
- [Dev health](../../scripts/dev-health.mjs)
- [Prompt style extraction](../../scripts/extract-prompt-style-standard.ts)
- [AIOS folder generation](../../scripts/generate-aios-folders.ts)
- [Harness acceptance](../../scripts/harness-acceptance.mjs)
- [Feedback relay mock](../../scripts/mock-feedback-relay.ts)
- [Performance bench](../../scripts/perf-bench.mjs)
- [Ponytail commit size](../../scripts/ponytail-commit-size.mjs)
- [Server bench](../../scripts/server-bench.mjs)
- [Latency report](../../scripts/trace-latency-report.ts)

Existing dependency finding: `@vitest/coverage-v8` in the [root package](../../package.json).

This exception does not approve removing these files or dependencies.
