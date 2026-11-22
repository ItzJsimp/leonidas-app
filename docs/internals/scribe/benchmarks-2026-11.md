# Scribe benchmarks, November 2026

Measured on 2026-11-22 on Jake's PC. Method and tools: `scribe-replay` (`services/scribe-engine/src/bin/scribe-replay.rs`), a paired HTTP test, and a copy of `history.jsonl` (read only). Keys came from the existing environment variables, so no new account was used. No paid account was added. The live dictionary and `~/.t3/userdata` were not touched.

## Method

- **Real takes:** 830 takes from `history.jsonl` that `deepgram/nova-3` served. Real p50 and p95 come from them. Mean take is 105 words, median 57.
- **Test clips:** 24 clips made with Windows speech synthesis from 24 written sentences. They have no personal text. Twelve are clean and twelve have noise at 10 dB. A word list of 8 terms was set. Another 16 name-heavy clips and 4 long clips (65 to 100 s) were used for the word-list and long-take checks.
- **WER:** word error rate after number and compound normalisation ("twelve percent" equals "12%", "time out" equals "timeout"). Synthetic voices are cleaner than a real microphone, so use WER to compare vendors, not as a promise.
- **Cost:** 200 dictations a day, 30 days, 0.70 minutes each (4,200 minutes a month).

## Baseline

| Vendor and model                            | p50 ms                                     | p95 ms | WER   | Names (8 terms) | Cost per month at 200 a day        |
| ------------------------------------------- | ------------------------------------------ | ------ | ----- | --------------- | ---------------------------------- |
| Deepgram `nova-3` (real takes, n=830)       | 547                                        | 1,249  | n/m   | n/m             | About $18 (covered by $200 credit) |
| Deepgram `nova-3` (test clips, n=24)        | 375                                        | 751    | 2.0%  | 8 of 8          | About $18                          |
| Groq `whisper-large-v3-turbo` (n=24)        | 419                                        | 582    | 1.1%  | 6 of 8          | About $2.80                        |
| Gemini `gemini-3.5-flash-lite` (n=24)       | 1,157 to 1,578 (3 direct calls, one 6,221) | n/m    | n/m   | n/m             | About $4 (unpaid tier is free)     |
| Gemini `gemini-3.1-flash-lite` (n=23 of 24) | 1,917                                      | 11,714 | 0.71% | 8 of 8          | Not read                           |
| Gemini `gemini-3.5-transcribe` (n=9 of 24)  | 1,519                                      | 1,680  | n/m   | n/m             | About $21. Free tier gave HTTP 429 |

| Long takes (65 to 100 s WAV, n=12 each) | p50 ms | p90 ms |
| --------------------------------------- | ------ | ------ |
| Deepgram `nova-3`                       | 912    | 1,279  |
| Groq `whisper-large-v3-turbo`           | 2,525  | 2,672  |

The Groq long times include uploading an uncompressed WAV. The engine uploads FLAC, which is about half the size.

| Clean-up model (24 clips, same transcripts) | p50 ms | p90 ms | WER after clean-up | Real p50 / p95 ms   |
| ------------------------------------------- | ------ | ------ | ------------------ | ------------------- |
| Groq `qwen/qwen3.8-27b` (current first)     | 141    | 259    | 2.01%              | 396 / 1,103 (n=544) |
| Groq `openai/gpt-oss-20b` (current backup)  | 352    | 443    | 2.23%              | 626 / 1,880 (n=152) |
| Groq `openai/gpt-oss-120b`                  | 290    | 439    | 2.23%              | n/m                 |

Raw Deepgram text has WER 2.01% and clean-up keeps it there with the first model. In real history, clean-up changes the words in 33% of takes that have no filler word or repeat, so clean-up cannot be skipped for a speed gain.

Word list on Groq (16 name-heavy clips, 21 names): no list 13 of 21. Comma list 19, "Glossary:" prefix 19, sentence form 19. The format does not matter. Having a list does.

## Decisions

No vendor or model swap met the rule (better on two of speed, accuracy, cost, at no more cost). Reasons:

- **Groq first:** about 6 times cheaper and WER 1.1% against 2.0%. It is slower on long takes (2.5 s against 0.9 s) and missed 2 of 8 names. Not a clear win.
- **Gemini models:** slower (1.5 to 2 s typical, 11.7 s p95) and `gemini-3.5-flash-lite` returned HTTP 503 on 22 of 24 calls for 3 minutes, then worked again. It is a last resort. Do not change it.
- **Clean-up models:** the current first model is the fastest and the most accurate of the three.
- **Not measured, no key:** Cerebras, Together, Cloudflare, Mistral, AssemblyAI, ElevenLabs. See [model research](./model-research-2026-11.md). Each needs a task card or Jake's approval to add a key.

## What changed

| Lever                                | Before                                  | After                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hedged speech chain (`backup.rs`)    | Next vendor waits for the first to fail | Starts after 800 ms plus 1 s per 50 s of audio. Simulated on 830 real takes: max 27,175 to 3,799 ms, takes over 5 s from 4 to 0, p99 2,222 to 2,052 ms, p95 1,254 to 1,242 ms. It fires on 2.7% of takes.                    |
| Warm Deepgram connection (`main.rs`) | Only Groq warmed                        | Paired test, 20 takes: p50 411 to 382 ms, p90 631 to 431 ms, median saving 162 ms. A test proves one connection serves warm-up and transcription. A 12-clip engine replay was too noisy to show it (462 against 504 ms p50). |
| Em dash guard (`polish.rs`)          | Prompt rule only                        | Code removes U+2014 from every reply. 0 of 131 test outputs needed it.                                                                                                                                                       |
| Rewrite presets                      | 4 presets, two copies had drifted       | 6 presets, one text in both copies. See below.                                                                                                                                                                               |

Both speed changes lower tail and first-take latency. Neither changes accuracy or cost materially, so they do not meet the two-of-three rule for a model swap. They are engine changes, listed here for Jake to confirm.

## Rewrite presets

Method: 20 inputs written in the style of Jake's dictation (7 transcripts, 7 rough prompts, 6 emails) and run through `qwen/qwen3.8-27b` at temperature 0 with the same system prompt the engine sends. A different model (`openai/gpt-oss-120b`) scored each output for invented facts, lost points, meaning (1 to 5). The judge's "preamble" flag was unreliable, so a regex counted preambles, refusals and em dashes instead.

| Check (all 20 inputs, regex)     | Clarity | Shorter | Friendly old | Friendly new | Prompt old | Prompt new |
| -------------------------------- | ------- | ------- | ------------ | ------------ | ---------- | ---------- |
| Em dash in output                | 0       | 0       | 0            | 0            | 0          | 0          |
| Preamble or refusal              | 0       | 0       | 0            | 0            | 0          | 0          |
| New numbers or identifiers added | 0       | 0       | 2            | 2            | 4          | 1          |
| Exploratory phrases lost (of 15) | 6       | 9       | 6            | 3            | 12         | 6          |

Judge scores (mean per output, lower is better for invented and lost, higher for meaning). Friendly is paired on 20 inputs. Prompt is paired on 13 inputs, because the judge failed to answer on 7. Slack and Email have no old version.

| Preset               | Invented | Lost | Meaning | Note                                                                                                                               |
| -------------------- | -------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Friendly old (n=20)  | 0.40     | 0.95 | 4.80    |                                                                                                                                    |
| Friendly new (n=20)  | 0.15     | 1.20 | 4.70    | Fewer invented facts. Meaning flat. Slightly more points lost.                                                                     |
| Prompt old (n=13)    | 0.54     | 1.69 | 4.69    |                                                                                                                                    |
| Prompt new (n=13)    | 0.62     | 1.23 | 3.92    | Fewer points lost. Meaning lower, driven by two email inputs the Prompt preset is not made for. Judge noise is large at this size. |
| Slack (n=10)         | 0.00     | 0.80 | 4.90    | Shipped.                                                                                                                           |
| Email (n=8)          | 0.25     | 1.12 | 4.75    | Shipped.                                                                                                                           |
| Commit message (n=7) | 0.43     | 3.14 | 3.00    | Not shipped. Weak on these inputs, which were not changes.                                                                         |
| Bug report (n=6)     | 0.33     | 2.00 | 3.83    | Not shipped.                                                                                                                       |

The Prompt change does not win on the judge's meaning score. It wins on the two checks the brief names: exploratory phrases kept (lost 12 of 15 before, 6 of 15 after) and no invented work. Jake should read the sample outputs and confirm. To roll it back, restore the old Prompt text from git history.

What the text showed:

- **Friendly (old):** added a greeting that was not in the text, turned a note about a client into a message to the client, and dropped an apology and a hedge.
- **Prompt (old):** added work the speaker never asked for ("propose a fix", "determine the underlying mechanism") and swapped "think through" and "what do you think" for formal words.
- **Prompt (new):** keeps the speaker's exploratory words, keeps a guess a guess ("may be the DPI handling"), adds no deliverable. Em dash is forbidden in the text and enforced in code.
- **Clarity and Shorter:** no weakness found, so they are unchanged.
- **New presets shipped:** Slack and Email. They scored best (meaning 4.9 and 4.75).
- **Tried and not shipped:** Commit message (meaning 3.0) and Bug report (3.83). The test inputs were dictation, not changes or bugs, so a better test set may change this. A task card holds both. Commit message added a `fix:` prefix once, so its instruction was tightened and re-run: 0 of 7.
- **Not tried:** Meeting notes, Translate, Formal, Bullet summary, Task card.
- **Dead text removed:** the Rust Prompt default had a `RELEVANT_AIOS_FINDINGS` clause. No code sends that block. It also made the two copies differ by 306 characters.

## Audit beyond the brief

| Area                    | Finding                                                                                                                                                   | Action                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Vendor failure          | Chain is sequential and a stall waited up to Deepgram's timeout (15 s plus half the audio). Local model covers offline errors. Audio is kept 7 days.      | Fixed with the hedge.                     |
| Timeouts                | Groq speech 30 s plus audio length. Deepgram 15 s plus half the audio. Clean-up 4 s. Rewrite 20 s. Reasonable.                                            | None.                                     |
| Key storage             | Engine and `VoiceKeyStore.ts` use the OS vault, no plaintext fallback. The old plaintext `groq-api-key` secret stays after the vault copy is made.        | Card: review with the API keys page.      |
| Key entry               | Deepgram and Gemini keys have no field. Only the environment or a hand-made vault entry works.                                                            | Card filed.                               |
| Privacy                 | `engine.log` holds no transcript text (checked). Private takes are never kept for retry. Gemini on a free key lets Google train on audio and transcripts. | Doc says so. Card filed.                  |
| Dictionary quality      | Deepgram gets 50 terms and Groq 800 characters, in file order. Jake's dictionary file is about 42 KB.                                                     | Card filed.                               |
| Punctuation and fillers | Deepgram `smart_format` punctuates. Clean-up removes fillers. Real data: clean-up changes words on 33% of filler-free takes.                              | None.                                     |
| Hotkey and HUD speed    | `engine.log` shows hotkey to capture 12.8 ms and hotkey to pill 10.6 ms. Both are inside the 50 ms budget.                                                | None.                                     |
| Silence detection       | None. Only `minRecordMs` gates a take.                                                                                                                    | Card filed.                               |
| Long takes              | No chunking. Whole take uploads after release. Deepgram p50 grows from 367 ms (under 10 words) to 1,003 ms (over 200 words).                              | Card filed (streaming).                   |
| Rewrite output checks   | Rewrite has no answer or refusal check. 0 of 131 test outputs needed one.                                                                                 | None.                                     |
| Tests                   | Engine: 256 pass. Web and server Scribe: 21 files, 219 tests pass. No test for `ScribeSettingsTab.tsx` or `ScribeRewriteTab.tsx` rendering.               | Preset drift now has tests on both sides. |
| Replay tool             | `scribe-bench` does not test vendors. Only `scribe-replay` does, and it prints p50 and p90 only.                                                          | Used. Note kept in architecture doc.      |

## Task cards filed

- Add Deepgram and Gemini key fields to Scribe settings
- Trim silence and skip empty takes before Scribe uploads audio
- Stream speech for long Scribe takes to hide upload and wait time
- Benchmark a better offline speech model for Scribe on Windows CPU and GPU
- Test Cerebras for Scribe clean-up and rewrite (needs Jake approval to add a card)
- Warn or block Gemini fallback on a free Gemini key
- Keep one source for Scribe rewrite presets
- Rank dictionary words sent to speech vendors by use, not file order
- Retest Commit message and Bug report rewrite presets on real change and bug text
- Remove the old plaintext Groq key copy after the vault migration in VoiceKeyStore

## Toolchain traps found

- `pnpm` fails in this Git Bash with a missing corepack file. Run `<main checkout>/node_modules/.bin/vp i --frozen-lockfile` in the worktree. It took 1 min 44 s with a warm store.
- Cargo needs the Visual Studio shell. Git's `link.exe` hides the MSVC one. Call `vcvars64.bat` from a `.cmd` file, as [agent-gotchas](../../../project/agent-gotchas.md) says.
- Python urllib is blocked by Groq's edge unless you send a `User-Agent`.
- Groq `qwen/qwen3.8-27b` allows 8,000 tokens a minute and 1,000 requests a day on this account. Test runs share that limit with live dictation.
