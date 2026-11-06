import type {
  ScribeEngineProcess,
  ScribeEngineState,
  ScribeHistoryItem,
  ScribeLiveEvent,
} from "@t3tools/contracts";

/** Everything the Scribe page shows live, folded from the `scribe.subscribeEvents` stream. */
export interface ScribeLiveSnapshot {
  /** Null until the server reports the first link change. */
  readonly connected: boolean | null;
  readonly state: ScribeEngineState | null;
  readonly partial: string;
  /** Text of the last finished dictation; cleared when the next one starts. */
  readonly lastTranscript: string;
  /** Dictations saved since the page opened, newest first. */
  readonly saved: readonly ScribeHistoryItem[];
  readonly lastError: {
    readonly code: string;
    readonly message: string;
    readonly at: string;
  } | null;
  readonly process: ScribeEngineProcess | null;
}

export const SCRIBE_LIVE_LIMIT = 20;

export const INITIAL_SCRIBE_LIVE: ScribeLiveSnapshot = {
  connected: null,
  state: null,
  partial: "",
  lastTranscript: "",
  saved: [],
  lastError: null,
  process: null,
};

export function reduceScribeLive(
  snapshot: ScribeLiveSnapshot,
  event: ScribeLiveEvent,
): ScribeLiveSnapshot {
  switch (event.type) {
    case "connection":
      return event.connected
        ? { ...snapshot, connected: true }
        : { ...snapshot, connected: false, state: null, partial: "" };
    case "state":
      return {
        ...snapshot,
        state: event.state,
        partial: event.state === "listening" ? snapshot.partial : "",
        lastTranscript: event.state === "listening" ? "" : snapshot.lastTranscript,
        // A failed take returns the engine to ready. Keep its error, with the retry offer,
        // until the next take starts.
        lastError:
          event.state === "mic_error" ||
          (event.state === "ready" && snapshot.lastError?.code === "stt_error")
            ? snapshot.lastError
            : null,
      };
    case "partial":
      return { ...snapshot, partial: event.text };
    case "error":
      return { ...snapshot, lastError: { code: event.code, message: event.message, at: event.at } };
    case "history":
      return {
        ...snapshot,
        saved: [event.item, ...snapshot.saved.filter((item) => item.id !== event.item.id)].slice(
          0,
          SCRIBE_LIVE_LIMIT,
        ),
      };
    case "process":
      return { ...snapshot, process: event.process };
    case "transcript":
      return { ...snapshot, lastTranscript: event.text };
  }
}

/** Live saves first, then the loaded page, with no id twice. */
export function mergeRecent(
  saved: readonly ScribeHistoryItem[],
  loaded: readonly ScribeHistoryItem[],
  limit = SCRIBE_LIVE_LIMIT,
): ScribeHistoryItem[] {
  const seen = new Set<string>();
  const out: ScribeHistoryItem[] = [];
  for (const item of [...saved, ...loaded]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length === limit) break;
  }
  return out;
}

export type EngineTone = "success" | "info" | "warning" | "error" | "muted";

/** The one-line engine strip on every Scribe tab. */
export function engineStrip(
  snapshot: ScribeLiveSnapshot,
  builder = false,
): {
  readonly label: string;
  readonly tone: EngineTone;
} {
  if (snapshot.connected === null) return { label: "Connecting to Scribe", tone: "muted" };
  if (!snapshot.connected)
    return { label: builder ? "Engine stopped" : "Scribe is not running", tone: "error" };
  switch (snapshot.state) {
    case "listening":
      return { label: "Listening", tone: "info" };
    case "processing":
      return { label: "Processing", tone: "info" };
    case "mic_error":
      return { label: "Microphone problem", tone: "warning" };
    case "ready":
    case null:
      return { label: "Ready", tone: "success" };
  }
}
