# Stack-specific traps

Read only the section for the stack you changed.

## Leonidas (TypeScript, Effect, React, Electron, Node WebSocket server, React Native mobile)

- Upstream's rule applies: never send more data over the WebSocket than the client uses, and no CSS animation that spikes the GPU. Both are named in the project's `AGENTS.md`.
- Server: Effect scopes and finalizers own every listener, fiber, stream and child process; a resource created outside a scope is a leak. Streams must apply backpressure, never buffer a whole run.
- Orchestration and provider adapters: do not grow the already oversized files (`ClaudeAdapterV2.ts`, `CodexAdapterV2.ts`, `Sidebar.tsx`). New logic goes in a new module with one reason to change.
- Web: stable keys, selector-based store reads, `React.memo` only where a profile shows a win, virtualize long thread and message lists, lazy-load routes and heavy panels, no layout-property animation.
- Desktop (Electron): keep the main process free of sync I/O; IPC payloads are small and typed; dispose windows, webContents listeners and tray handlers.
- Mobile: no per-frame JS work; follow [`react-native-best-practices`](../../react-native-best-practices/SKILL.md).
- Cross-surface: a feature must work on web, desktop and mobile, so check that a perf fix on one surface does not regress another.

## Leonidas Scribe (Python 3.14, PySide6, Whisper, C# capture helper)

- Qt: GUI only on the main thread; worker threads emit signals. Disconnect signals and stop `QTimer`s on teardown; parentless widgets and lambdas bound to `self` leak.
- Models and audio: load the Whisper model once and keep one instance; never copy audio buffers per call; free the buffer after transcription; cap meeting and history logs on disk and in memory.
- Never block the dictation hot path (hotkey to text): no network or disk scan before paste; the LLM polish step must time out and fall back.
- The app re-execs on a saved `.py` change once idle, so import-time work runs on every re-exec: keep module top levels free of I/O and heavy imports (import lazily inside the function).
- Regression suite: `python -m pytest -q` (about 13 s) must pass; add a test for any fixed leak or slow path.
- Public-safe repo: no paths, keys or contacts in the diff.

## AIOS scripts (PowerShell, Python)

- Always `-LiteralPath`; read a file once, not once per line; filter left (`Where-Object` late is slow, use `-Filter` or `git ls-files`); no sequential per-file edit loops (canon rule 3, one batch script).
- Scheduled tasks run silent and short; add no polling loop where an event or a longer interval works.
- Pre-commit hooks are on the commit path: keep added checks to seconds.
