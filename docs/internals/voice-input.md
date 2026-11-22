# Voice input

Transcription edits a composer draft. It does not submit an agent turn. Audio is
temporary client input, and only normal message submission sends the resulting
text. Supported iOS devices transcribe locally through the shared controller.
On the desktop app the composer mic button drives the Scribe engine, the same as the global
hotkey. A browser records in the page and sends audio to the server, which uses Groq only.
Engine and trace: [Scribe internals](./scribe/README.md).

The web capture path lives in `apps/web/src/components/voice/`. Its server service
is `apps/server/src/scribe/VoiceDictation.ts`. RPC contracts live in
`packages/contracts/src/voice.ts`. The Voice wizard step follows AI account setup.
It includes key setup, a spoken test, and an explicit skip.

The Voice setup checklist opens Groq in the existing preview browser. Each setup
owns a separate temporary browser thread, including sign-in popups. Closing setup
waits for an in-flight open, then closes that thread's tabs. Strict Mode generations
have separate ownership. The preview component loads only when setup opens Groq.

Streamed copy events can supply a key directly. Native guests use clipboard reads
while setup is open and the parent document has focus. Reads do not overlap; a
permission failure stops further reads and shows manual paste guidance. Closing,
unmounting, permission loss, success, or the ten-minute limit stops capture. An
asynchronous clipboard result cannot save a key after capture closes.

`VoiceKeyStore.ts` uses the OS credential vault, scoped to the host state directory.
It has no plaintext fallback. `ServerSecretStore` stores file bytes and does not
provide encryption. Audio is capped at 8 MiB and ten minutes. Groq Whisper produces
the transcript; a separate cleanup call uses `openai/gpt-oss-20b`. Cleanup failures
keep the raw transcript. Model availability must be checked before a release.

The browser path below has no backup speech vendor, no dictionary and no hotkey. It does not
replace the always-on Scribe engine. The web capture path owns its lifecycle separately from
the shared iOS controller. Review both paths before extending draft ownership or cancellation.

The [shared controller](../../packages/client-runtime/src/voice-input/controller.ts)
owns the operation while the client supplies capture and transcription. Preparation
binds the transcriber and resolved locale for the whole recording. Draft ownership,
text, and revision are captured before recording and checked before insertion, so
a late transcript cannot overwrite a draft that was edited or replaced.

Cancellation invalidates a result immediately, but resources stay owned until the
underlying work settles. Apple's native transcription call cannot be interrupted
once started. Releasing the session or deleting its recording when the abort signal
fires would race that work. The [transcription contract](../../packages/client-runtime/src/voice-input/transcription.ts)
therefore requires implementations to settle only after their work has stopped;
the [Apple binding](../../apps/mobile/src/native/voiceTranscription.ios.ts) checks
cancellation between native calls and discards late results.
