import * as Schema from "effect/Schema";

/**
 * Composer dictation: the window records audio, the server holds the user's
 * Groq key and does speech-to-text plus an optional clean-up pass.
 */

/** Groq keys start with `gsk_`; the rest is base62. */
export const GROQ_KEY_PATTERN = /^gsk_[A-Za-z0-9]{20,120}$/;

/** About 10 minutes of Opus audio. Longer takes are rejected before upload. */
export const VOICE_MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export const VoiceStatus = Schema.Struct({
  keyConfigured: Schema.Boolean,
  /** Last 4 characters of the saved key, so the user can tell keys apart. */
  keyHint: Schema.NullOr(Schema.String),
});
export type VoiceStatus = typeof VoiceStatus.Type;

export const VoiceSetGroqKeyInput = Schema.Struct({
  key: Schema.String.check(Schema.isMaxLength(200)),
});
export type VoiceSetGroqKeyInput = typeof VoiceSetGroqKeyInput.Type;

export const VoiceTranscribeInput = Schema.Struct({
  /** Base64 audio bytes from MediaRecorder. */
  audioBase64: Schema.String.check(
    Schema.isMaxLength(Math.ceil((VOICE_MAX_AUDIO_BYTES * 4) / 3) + 4),
  ),
  mimeType: Schema.String.check(Schema.isMaxLength(100)),
  polish: Schema.Boolean,
});
export type VoiceTranscribeInput = typeof VoiceTranscribeInput.Type;

export const VoiceTranscribeResult = Schema.Struct({
  text: Schema.String,
  rawText: Schema.String,
  /** True when the clean-up pass ran and its text was used. */
  polished: Schema.Boolean,
  transcribeMs: Schema.Number,
  polishMs: Schema.Number,
});
export type VoiceTranscribeResult = typeof VoiceTranscribeResult.Type;

export const VoiceErrorReason = Schema.Literals([
  "no_key",
  "invalid_key",
  "rate_limited",
  "network",
  "audio_too_large",
  "empty_audio",
  "provider_error",
  "storage_error",
]);
export type VoiceErrorReason = typeof VoiceErrorReason.Type;

export class VoiceError extends Schema.TaggedError<VoiceError>()("VoiceError", {
  reason: VoiceErrorReason,
}) {
  override get message(): string {
    return voiceErrorMessage(this.reason);
  }
}

/** Plain words for every failure, shown under the composer. */
function voiceErrorMessage(reason: VoiceErrorReason): string {
  switch (reason) {
    case "no_key":
      return "Voice is off. Add your free Groq key to turn it on.";
    case "invalid_key":
      return "Groq did not accept this key. Copy a new key from console.groq.com/keys.";
    case "rate_limited":
      return "Groq's free limit is reached for now. Wait a minute, then try again.";
    case "network":
      return "Leonidas could not reach Groq. Check your internet, then try again.";
    case "audio_too_large":
      return "That recording is too long. Keep each take under 10 minutes.";
    case "empty_audio":
      return "No speech was heard. Check that the right microphone is on.";
    case "provider_error":
      return "Groq had a problem with this recording. Try again.";
    case "storage_error":
      return "Leonidas could not read or save the Groq key on this computer.";
  }
}
