# Scribe architecture

Scribe is a Rust process, `scribe-engine`. Leonidas starts it and talks to it over loopback HTTP. The contract is [`services/scribe-engine/contract.md`](../../../services/scribe-engine/contract.md). Paths below are from the repository root. A line number is an anchor to read, not a promise. Search for the function name if the line moved.

## Parts

| Part               | Where                                                                                                                        | Job                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Engine             | `services/scribe-engine/src/`                                                                                                | Hotkeys, microphone, vendors, clean-up, paste, history, HUD. One process.              |
| Server bridge      | `apps/server/src/scribe/` (`ScribeEngine.ts`, `ScribeSupervisor.ts`, `VoiceKeyStore.ts`, `VoiceDictation.ts`)                | Starts the engine, calls its HTTP API, keeps the Groq key in the OS vault.             |
| UI                 | `apps/web/src/components/scribe/` (Home, Transcripts, Dictionary, Rewrite, Progress, Settings tabs)                          | Shows history and stats, edits words, presets and settings.                            |
| Composer mic       | `apps/web/src/components/voice/ComposerVoiceButton.tsx`                                                                      | On desktop it drives the engine. In a browser it uses `VoiceDictation.ts` (Groq only). |
| Release and bundle | `.github/workflows/scribe-engine.yml`, [`scribe-windows-bundling-plan.md`](../../operations/scribe-windows-bundling-plan.md) | Build `scribe-engine.exe`, test it, ship it inside the installer.                      |

Data lives in `%APPDATA%\Leonidas\scribe-engine`: `config.json`, `dictionary.json`, `history.jsonl`, `failed/`, `models/`, `meetings/`, `engine.log`. Keys live in the OS credential store, service `leonidas-scribe`, one entry per vendor.

## Trace 1: one dictation

1. The engine installs keyboard and mouse hooks. `hotkeys.rs:300` (`spawn`) starts them. `hotkeys.rs:457` (`dispatch`) reads each input.
2. A match becomes `HoldDown`, `HoldUp` or `Toggle` at `hotkeys.rs:242`. Defaults are in `config.rs` (`Bindings`).
3. The hotkey thread (`main.rs:263`) runs `on_hotkey` (`main.rs:347`) for each event.
4. `Engine::start` (`engine.rs:396`) opens the microphone through cpal. The code is `CpalRecorder::start` at `audio.rs:122`.
5. After the mic opens, the engine reads the app in front. It does this last, so the read never delays capture.
6. The same key press warms the vendor connections: `groq.warm()` and `speech.warm()` at `main.rs:330`. Deepgram warm is in `backup.rs` (`DeepgramSpeech::warm`).
7. Samples stay in memory until stop. `audio.maxRecordSeconds` caps the take (default 600 s).
8. Key release, or a second toggle press, calls `Engine::stop` (`engine.rs:440`). A take under `audio.minRecordMs` (250 ms) is dropped.
9. `CpalRecorder::stop` (`audio.rs:181`) closes the mic. `encode` (`audio.rs:344`) resamples to 16 kHz mono (`audio.rs:301`) and writes FLAC.
10. The engine starts the thread `scribe-process` and runs `Engine::process` (`engine.rs:482`). State is `processing`.
11. `Router` (`local_stt.rs:81`) picks the path. Private mode uses the local model only.
12. The cloud path is `CloudChain` (`backup.rs:321`). It tries `backup.speech` in order: Deepgram (`backup.rs:139`), Groq (`groq.rs:254`), Gemini (`backup.rs:231`). A vendor with no key is skipped.
13. The chain starts the next vendor at once if one fails. It also starts it when one is slow: after `backup.speechHedgeMs` plus 1 s per 50 s of audio (`CloudChain::hedged`). The first good reply wins.
14. Groq retries once on `whisper-large-v3` after a timeout, a 429 or a 5xx (`groq.rs:254`).
15. The word list reaches each vendor in its own way. Deepgram gets up to 50 `keyterm` values. Groq gets a `prompt` of up to 800 characters (`dictionary.rs:228`). Gemini gets it in the instruction text.
16. If every vendor fails, and the failure may be local (no key, network, timeout, 429, 5xx), the local whisper model tries.
17. If all fail, `FailedStore` (`failed.rs:13`) keeps the audio (20 files, 7 days) and the engine sends an `stt_error` event. A private take is never kept.
18. Clean-up is `polish_traced` (`polish.rs:562`). It applies the dictionary replacements first.
19. A take of four words or fewer takes the fast path (`polish.rs:84`): capital letter and a full stop. No model runs.
20. Other takes go to `race` (`polish.rs:437`): Groq `qwen/qwen3.8-27b`, then after 800 ms Groq `openai/gpt-oss-20b`, then Gemini. A model that fails sits in a cooldown.
21. `accept_reply` (`polish.rs:201`) rejects an answer, a refusal or a cut-off reply. It also removes any em dash. On any failure the text is the dictionary-applied transcript.
22. `ClipboardPaster::paste` (`paste.rs:33`) saves the plain-text clipboard, sets the text, sends Ctrl+V and restores the clipboard.
23. `History::add` (`history.rs:64`) appends one line to `history.jsonl`. It stores the vendor (`stt`), the clean-up model (`polish`), timings and the private flag.
24. The engine emits `transcript` and `history` events. The stream `/v1/events` (`http.rs:96`) is read by `ScribeEngine.ts:322`. The UI shows the take.
25. State returns to `ready`.

## Trace 2: one rewrite

1. The user selects text in any app and presses the rewrite chord (default Ctrl + Shift + A). The hook emits `HotkeyEvent::Rewrite`.
2. The hotkey thread (`main.rs:263`) allows one picker at a time.
3. The engine reads the window in front, then copies the selection with Ctrl+C (`paste.rs:59`). With no selection it reports "Select text first".
4. `rewrite::presets` (`rewrite.rs:46`) reads `presets.rewrite` from `config.json`. It falls back to the built-in `DEFAULTS` (`rewrite.rs:15`). A row without a name or an instruction voids the whole list.
5. The picker (`hud/picker.rs:372`, `pick`) shows each name and its `summary` line (`rewrite.rs:18`). The keys 1 to 9 pick a preset.
6. The engine puts focus back on the first window. `Engine::rewrite` (`engine.rs:294`) refuses in private mode, because rewrite needs the cloud.
7. `GroqPolisher::rewrite` (`polish.rs:305`) sends `SYSTEM_PROMPT` (`rewrite.rs:13`), then `SELECTED_TEXT` and `INSTRUCTION`. `max_tokens` is 512 to 8,192.
8. `race` (`polish.rs:437`) uses the same models as clean-up. The hedge is 5 s and the timeout is 20 s.
9. `call_model` (`polish.rs:492`) removes think blocks, wrapping quotes and any em dash. Rewrite has no answer or refusal check.
10. The engine restores focus and pastes the result. It saves a history item with mode `rewrite` and the preset name.
11. Escape cancels. A cancelled rewrite never pastes (`rewrite_gen` in `engine.rs`).

Preset editing is in the UI. `ScribeRewriteTab.tsx:189` saves with `patchSettings` (`ScribeEngine.ts:230`). The engine keeps `presets` and `features` but never reads them, except `presets.rewrite`. The web copy of the defaults is `rewrite.logic.ts:16`. It must match `rewrite.rs:15` in names and instructions.

## Settings that change the path

| Field (`config.json`)  | Default                      | Effect                                                 |
| ---------------------- | ---------------------------- | ------------------------------------------------------ |
| `backup.speech`        | `deepgram`, `groq`, `gemini` | Speech vendor order.                                   |
| `backup.speechHedgeMs` | 800                          | Start the next vendor after this wait. 0 turns it off. |
| `groq.whisperModel`    | `whisper-large-v3-turbo`     | First Groq speech model.                               |
| `groq.polishModel`     | `qwen/qwen3.8-27b`           | First clean-up model.                                  |
| `groq.hedgeMs`         | 800                          | Start the backup clean-up model after this wait.       |
| `groq.polishTimeoutS`  | 4                            | Clean-up time limit.                                   |
| `privateMode`          | false                        | Local speech only. No clean-up. No rewrite.            |
| `polish.enabled`       | true                         | Turn clean-up off.                                     |

## Tools

- `scribe-replay` (`src/bin/scribe-replay.rs`) sends saved clips through the real speech chain and clean-up. It prints p50 and p90. `--warm` opens connections first. A `.jsonl` input replays clean-up only.
- `scribe-bench` (`src/bin/scribe-bench.rs`) checks cold start, idle RAM and hotkey-to-capture time against budgets. It does not test vendors.
- Numbers and method: [benchmarks-2026-11.md](./benchmarks-2026-11.md).
