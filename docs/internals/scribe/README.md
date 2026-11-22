# Scribe

Scribe types what you say and rewrites text you select. The engine is a Rust process in `services/scribe-engine/`. This page is the hub: every Scribe doc is linked here.

## Start here

| You want to                                             | Read                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Use Scribe                                              | [User guide](../../user/scribe.md)                             |
| Follow one dictation or one rewrite through the code    | [Architecture](./architecture.md)                              |
| See measured speed, accuracy and cost, and what changed | [Benchmarks, November 2026](./benchmarks-2026-11.md)           |
| Compare speech and text models and prices               | [Model research, November 2026](./model-research-2026-11.md)   |
| Call the engine from another program                    | [Engine contract](../../../services/scribe-engine/contract.md) |

## Other Scribe docs

| Doc                                                                       | Covers                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Voice input](../voice-input.md)                                          | The composer mic, the browser path, the iOS controller.      |
| [Discord mute while dictating](../discord-mute-dictation.md)              | The hidden F24 key that mutes Discord during a take.         |
| [Windows bundling plan](../../operations/scribe-windows-bundling-plan.md) | What ships in the installer, sizes, the offline model.       |
| [Agent gotchas](../../../project/agent-gotchas.md)                        | Traps. Search it for "Scribe" and "cargo".                   |
| [Roadmap](../../../project/roadmap.md)                                    | What shipped. Scribe is a tray process with a localhost API. |

Release flow: `.github/workflows/scribe-engine.yml`. The workflow builds, tests and ships `scribe-engine.exe`.

## What is true now

- **Vendors that run.** Speech: Deepgram `nova-3`, then Groq `whisper-large-v3-turbo` (backup `whisper-large-v3`), then Gemini. Clean-up and rewrite: Groq `qwen/qwen3.8-27b`, then Groq `openai/gpt-oss-20b`, then Gemini. Offline: whisper.cpp `ggml-base.en-q5_1`.
- **Grok and Cerebras do not run.** The vendor is Groq, not Grok (xAI). No Cerebras client exists. Details: [model research](./model-research-2026-11.md).
- **Two dictation paths exist.** The desktop app uses the engine. A browser uses `VoiceDictation.ts`, which has Groq only, no dictionary and no backup vendor.
- **Keys.** Groq has a settings field. Deepgram and Gemini keys have no field yet. They come from `DEEPGRAM_API_KEY` and `GEMINI_API_KEY`, or from a vault entry made by hand.

## Claims fixed in this pass

| Doc                             | Old claim                                                                       | Fix                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/internals/voice-input.md` | "Web and desktop composer dictation use environment-backed Groq transcription." | Wrong. Desktop uses the engine. A browser uses the server and the OS key vault. |
| `docs/internals/voice-input.md` | "In-window capture does not replace the always-on Scribe engine."               | Kept, with the limits of the browser path stated.                               |
| Rewrite defaults                | Rust and web copies of the Prompt preset differed by 306 characters.            | Both copies now match. A dead `RELEVANT_AIOS_FINDINGS` clause is gone.          |
| `backup.rs` comment             | "Providers run one after another ... upgrade to a hedged start."                | Done. The speech chain now hedges.                                              |

## Still open

Task cards hold the larger ideas. They are listed in [benchmarks-2026-11.md](./benchmarks-2026-11.md#task-cards-filed).
