---
type: evaluation
id: eval-clicky-screen-aware-ai-assistant
title: "Technical & Pricing Evaluation: Clicky Screen-Aware AI Assistant vs. Local Stack"
status: complete
created: 2026-11-10
evaluated_date: 2026-11-10
target_product: "Clicky / HeyClicky (Humansongs, Inc.) & Clicky Windows (Community)"
evaluator: "Leonidas AIOS (Antigravity Harness)"
decision: "SKIP commercial HeyClicky subscription; HARVEST screen-overlay pointer patterns into local tools"
---

# Technical & Pricing Evaluation: Clicky Screen-Aware AI Assistant

## Executive Summary

This dossier presents a primary-source technical architecture, privacy, pricing, and capability evaluation of the **Clicky** screen-aware AI assistant ecosystem. The evaluation analyzes both the commercial closed-source product (**HeyClicky**, operated by Humansongs, Inc.) and the open-source Windows community implementation (**clicky-windows / clicky.foo**). It directly benchmarks their capabilities against the user's existing local operational stack: **Hermes desktop**, **Leonidas Voice (Scribe)**, and the **Antigravity harness**.

All data in this report is grounded in primary vendor documentation, privacy policies, terms of service, and public architectural declarations retrieved on November 10, 2026.

---

## 1. Product Ecosystem & Architecture Overview

The Clicky name encompasses two distinct development tracks originating from an initial open-source prototype by Farza Majeed:

1. **Commercial HeyClicky (`heyclicky.com` / Humansongs, Inc., YC S26):**
   - **Form Factor:** Transparent, cursor-anchored desktop overlay companion for macOS (Sonoma 14.2+) and Windows 10/11, paired with a companion Chromium extension.
   - **Interaction Loop:** Global push-to-talk activation (`Control + Option` or configurable hotkey). When triggered, it captures an active screen snapshot, streams audio dictation, runs visual grounding, and speaks instructions while rendering animated target pointers and annotations over target UI elements.
   - **Agent Execution ("HeyClicky Agent"):** Multi-step autonomous agent that drives desktop navigation, reads files with explicit user folder consent, operates web pages via the Chrome extension (navigating, typing, clicking buttons), and integrates external SaaS tools through Composio.
   - **Underlying Cloud Services:** Multi-modal reasoning via OpenAI (GPT-Realtime 2), Anthropic (Claude 3.5/3.7), and Google Gemini; speech transcription and dictation via Cerebras, Groq, and Deepgram; voice synthesis via ElevenLabs; application backend on Supabase, Cloudflare, and Vercel.

2. **Open-Source & Windows Community Port (`clicky.foo` / `Bitshank-2338/clicky-windows`):**
   - **Form Factor:** Native Windows desktop application sitting 35px adjacent to the cursor.
   - **Interaction Loop:** Push-to-talk (`Ctrl + Win`) or local wake-word trigger ("Clicky").
   - **Local Inference:** Supports fully offline execution via Ollama (vision and language models) and local Vosk transcription, alongside BYOK (Bring Your Own Key) connections to OpenAI, Anthropic, Gemini, and GitHub Copilot.
   - **Extended Features:** Windows UI Accessibility tree parsing, local OCR fallback, whiteboard drawing (arrows, circles, bounding rings), spaced-repetition study journal, MP4 lesson recording with audio narration, and extensible Python skill modules located in `~/.clicky/skills/`.

---

## 2. Platform Pricing & Commercial Terms

### Commercial HeyClicky (Humansongs, Inc.)

| Tier                 | Price (USD)                          | Talk & Dictation Allowance                            | Agent Execution Allowance               | Supported Platforms               |
| :------------------- | :----------------------------------- | :---------------------------------------------------- | :-------------------------------------- | :-------------------------------- |
| **Free Tier**        | $0.00 / month                        | 25 talk messages / month; basic dictation             | 25 agent messages / month               | macOS Sonoma 14.2+, Windows 10/11 |
| **Pro Tier**         | $20.00 / mo ($16/mo billed annually) | Unlimited push-to-talk voice interactions & dictation | ~150 background agent requests / month  | macOS Sonoma 14.2+, Windows 10/11 |
| **Max Tier**         | $100.00 / month                      | Unlimited push-to-talk voice interactions & dictation | 1,000 background agent requests / month | macOS Sonoma 14.2+, Windows 10/11 |
| **Student Discount** | 50% off first month of Pro           | Standard Pro features                                 | Standard Pro features                   | Verified academic email / ID      |

- **Subscription Terms:** Month-to-month auto-renewing billing via Stripe; cancellations take effect at the end of the billing period; fees are strictly nonrefundable; unused agent allowances do not roll over.
- **Enterprise Licensing:** No dedicated enterprise contract, custom SLA, or volume licensing currently advertised.

### Open-Source / Local Ports (`clicky.foo` & GitHub `farzaa/clicky`)

- **Software Cost:** $0.00 (MIT License).
- **Runtime Compute Cost:** $0.00 marginal cost when executing local Ollama models; standard per-token API rates if using personal BYOK endpoints.

---

## 3. Security, Privacy & Data Handling Analysis

Based on the official HeyClicky Privacy Policy and Trust statements (last updated November 10, 2026):

| Dimension                          | HeyClicky Cloud (Commercial)                                                                   | Community / Local Port (`clicky.foo`)                              | Local AIOS Stack Benchmark                                                |
| :--------------------------------- | :--------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Screen Capture Policy**          | Capture occurs **only** on push-to-talk activation; no continuous background recording.        | Snapshot on hotkey activation or local wake word.                  | On-demand explicit tool capture (`leo_preview_snapshot`, device tools).   |
| **Raw Image Storage**              | Raw screenshots are processed ephemerally and discarded immediately after AI analysis.         | Images held in local RAM/temp cache; no remote upload.             | Ephemeral scratch storage; local disk only.                               |
| **Data Retention**                 | Stores prompt history, conversation text, and structured user memory summaries.                | Optional local SQLite journal; zero remote storage.                | Local Git/Markdown repositories and local vector memory.                  |
| **Third-Party Model Transmission** | Transmits images and audio to OpenAI, Anthropic, Google, Cerebras, Groq, and Deepgram.         | None in offline mode; direct to user-configured APIs in BYOK mode. | Controlled per-tool routing (local Ollama, OpenRouter, private API keys). |
| **Model Training Exemption**       | Explicit contractual commitment: HeyClicky and API vendors do not train models on user inputs. | Fully private when running local models.                           | Zero external training on local or private enterprise API tiers.          |
| **System Permissions Required**    | Screen Recording, Microphone, Accessibility (mouse/keyboard input), Chrome Native Messaging.   | Windows UI Automation, Audio input, Accessibility hooks.           | Workspace-scoped CLI, MCP tools, and sandboxed browser drivers.           |
| **Regulatory & Certifications**    | Self-attested GDPR compliance. **No SOC 2, ISO 27001, or HIPAA certifications.**               | N/A (open-source desktop software).                                | Self-hosted, fully air-gapped capable; data remains on host machine.      |

> **Privacy Risk Assessment:** While HeyClicky enforces sound ephemeral screenshot handling, using the commercial cloud application transmits screen pixels (which may contain unmasked proprietary code, secrets, customer PII, or internal credentials) to external inference providers. For high-security engineering environments, this presents compliance friction due to the absence of formal SOC 2 Type II attestation.

---

## 4. Direct Comparative Benchmark: Clicky vs. Existing Local Stack

| Functional Vector                  | Commercial HeyClicky                                | Community Clicky Windows                           | Existing Stack: Hermes Desktop                       | Existing Stack: Leonidas Voice (Scribe)               | Existing Stack: Antigravity Harness                         |
| :--------------------------------- | :-------------------------------------------------- | :------------------------------------------------- | :--------------------------------------------------- | :---------------------------------------------------- | :---------------------------------------------------------- |
| **Primary Interaction Paradigm**   | Floating cursor avatar + voice push-to-talk         | Floating cursor avatar + voice / hotkey            | Conversational terminal & desktop agent              | Low-latency voice loop / transcription pill           | Agentic orchestration with multi-tool execution             |
| **Visual Element Grounding**       | Animated screen overlay drawing & cursor targeting  | OS Accessibility tree + offline OCR + vision model | DOM / window selectors via MCP browser bridge        | N/A (voice & transcript focus)                        | Visual preview inspection (`leo_preview_*`) & canvas        |
| **Coding & Repository Operations** | Basic agent code generation; lacks AST/linter gates | "Code Mode" auto-switch; basic syntax hints        | Deep filesystem mutation, terminal CLI, git commands | Dictation into editor; prompt prediction              | Full vertical-slice implementation, test runners, git trees |
| **Tool Extensibility**             | Composio integrations & Chrome extension            | Python plugins in `~/.clicky/skills/*.py`          | Model Context Protocol (MCP) Tier 5 tools            | Custom audio pipelines (Fish Audio, Groq, Kokoro)     | MCP servers (`leonidas`, etc.), subagents, custom skills    |
| **Voice Latency & Pipeline**       | Multi-hop cloud STT/TTS (ElevenLabs / Deepgram)     | Local Vosk / system TTS (or cloud BYOK)            | Integrated voice/audio tools via host                | Ultra-low latency: Groq/Cerebras Whisper + Fish Audio | Native agent turn processing                                |
| **Execution Cost Profile**         | $20 to $100 / month recurring SaaS                  | $0.00 marginal cost (local compute / BYOK)         | $0.00 marginal cost (local/free tier models)         | Sub-penny OpenRouter bake-off + local Kokoro guard    | Inherited model subscription / zero marginal cost           |
| **Enterprise / Air-Gap Readiness** | Uncertified cloud dependency; requires internet     | High (runs offline with Ollama)                    | High (self-hosted local workspace)                   | High (local engine & offline fallback)                | High (local process running in bounded workspace)           |

---

## 5. Architectural Gap Analysis

### Where Clicky Excels Over the Current Local Stack

1. **Zero-Cognitive-Load Visual Guidance:** Clicky's core innovation is eliminating window-switching when learning unfamiliar graphical software (e.g., Blender, DaVinci Resolve, Figma). It overlays bounding circles and arrows directly on the operating system screen rather than returning textual descriptions or terminal markdown.
2. **Cursor-Follower Ergonomics:** Placing the assistant 35px beside the user's cursor creates high engagement for rapid exploratory queries.
3. **Integrated Workflow Video Export:** Clicky Windows' capability to automatically export a narrated MP4 screen recording with synced markdown transcripts is valuable for generating user documentation and training artifacts.

### Where the Existing Local Stack Significantly Outperforms Clicky

1. **Deterministic Software Engineering & Verification:** Clicky's "Agent Mode" cannot rival the rigorous validation gates of the Antigravity and Hermes stack (test-driven development, AST syntax checks, mutation testing, atomic git commits, and multi-agent coordination).
2. **Audio Performance & Cost Control:** Leonidas Voice (Scribe + Groq/Cerebras STT + Fish Audio/Kokoro fallback) achieves superior speech-to-text latency and granular cost governance compared to HeyClicky's multi-hop cloud pipeline.
3. **Data Sovereignty & Enterprise Safety:** Antigravity operates strictly within explicit workspace boundaries without exfiltrating raw desktop video frames or active application state to third-party SaaS vendors.

---

## 6. Adopt-or-Skip Decision Matrix

```
+---------------------------------------------------------------------------------------------------+
|                                   ADOPT-OR-SKIP DECISION MATRIX                                   |
+------------------------------+--------------------+-----------------------------------------------+
| Target Entity                | Decision           | Core Rationale                                |
+------------------------------+--------------------+-----------------------------------------------+
| HeyClicky Pro/Max ($20-$100) | ❌ SKIP             | High recurring SaaS fee; redundant against     |
| Commercial Cloud App         |                    | Antigravity/Hermes agents; exfiltrates screen |
|                              |                    | context without SOC 2 compliance.            |
+------------------------------+--------------------+-----------------------------------------------+
| Clicky Windows Binary        | ⚠️ SKIP INSTALL    | Third-party unsigned installer package        |
| (Setup-Clicky.exe 200MB)     |                    | (v1.6.0-preview); violates constraint against |
|                              |                    | untrusted installer downloads.                |
+------------------------------+--------------------+-----------------------------------------------+
| Screen-Overlay Pointer &     | ✅ ADOPT PATTERN   | Extract and implement the UI overlay pattern  |
| Accessibility Architecture   |    (HARVEST)       | (Windows UI Automation + overlay highlights)  |
|                              |                    | as an internal Leonidas skill/tool.           |
+------------------------------+--------------------+-----------------------------------------------+
```

### Recommendation Details

1. **Reject Commercial Subscription:** Do not subscribe to HeyClicky Pro ($20/mo) or Max ($100/mo). The capabilities provided (general chat, cloud dictation, basic web agents) duplicate features already operational in Leonidas Voice, Hermes desktop, and Antigravity at negligible marginal cost.
2. **Avoid Third-Party Binary Execution:** In compliance with policy constraints and safe workstation hygiene, do not install the unsigned 200MB `Setup-Clicky.exe` binary.
3. **Harvest Pattern into Leonidas AIOS:** If on-screen UI pointing is desired for desktop user onboarding, implement a lightweight local Python/PowerShell overlay utility that consumes OS accessibility coordinates via an MCP tool, avoiding external dependencies and preserving data privacy.

---

## 7. Dated Primary-Source Ledger

| Source Entity            | Document / Resource URL                           | Retrieval Date | Key Evidence Extracted                                                                                                                                   |
| :----------------------- | :------------------------------------------------ | :------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Humansongs, Inc.         | `https://www.heyclicky.com`                       | 2026-11-10     | Core feature set, multi-platform availability, pricing tiers ($0, $20, $100/mo), student discount, client download paths.                                |
| Humansongs, Inc.         | `https://www.heyclicky.com/trust`                 | 2026-11-10     | Data handling disclosures, ephemeral screenshot retention, zero model training clause, lack of SOC 2 / ISO 27001.                                        |
| Humansongs, Inc.         | `https://www.heyclicky.com/privacy-policy`        | 2026-11-10     | Third-party sub-processors (OpenAI, Anthropic, Google, Cerebras, Groq, Deepgram, Composio, Supabase, Cloudflare, PostHog), Chrome extension permissions. |
| Humansongs, Inc.         | `https://www.heyclicky.com/terms`                 | 2026-11-10     | OS permission model (Accessibility, Screen Recording, Mic), auto-renewal terms, Delaware jurisdiction, non-refundable fees.                              |
| Y Combinator             | `https://www.ycombinator.com/companies/heyclicky` | 2026-11-10     | Company founding history (Farza Majeed, YC S26 batch), mission statement, team structure.                                                                |
| Clicky Windows Community | `https://clicky.foo`                              | 2026-11-10     | Offline Windows port architecture, Ollama local model integration, `Ctrl+Win` hotkey, spaced repetition, MP4 lesson recording.                           |
| Bitshank GitHub Repo     | `https://github.com/Bitshank-2338/clicky-windows` | 2026-11-10     | Technical open-source implementation details, unsigned v1.6.0 release binaries, Python skill plugin structure (`~/.clicky/skills/`).                     |
| Farzaa GitHub Prototype  | `https://github.com/farzaa/clicky`                | 2026-11-10     | Foundational MIT-licensed macOS prototype, Cloudflare Worker proxy design, Xcode build instructions.                                                     |

---

_Report compiled autonomously via Antigravity Deep Research under ASD-STE100 technical constraints._
