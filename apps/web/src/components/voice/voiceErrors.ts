const NO_MICROPHONE = "No microphone found. Plug one in, or type your message instead.";
const BLOCKED_MICROPHONE =
  "Leonidas cannot use the microphone. Allow it in your system privacy settings, or type instead.";
const BUSY_MICROPHONE = "Another app is using the microphone. Close it and try again.";
const FALLBACK = "Voice failed. Check microphone access and try again.";

/** Plain words for a failed recording. The browser's own wording ("Requested device not found") means nothing to a new user. */
export function describeVoiceFailure(failure: unknown): string {
  const name =
    typeof failure === "object" && failure !== null ? (failure as { name?: unknown }).name : null;
  switch (name) {
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return NO_MICROPHONE;
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return BLOCKED_MICROPHONE;
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return BUSY_MICROPHONE;
  }
  return failure instanceof Error && failure.message ? failure.message : FALLBACK;
}
