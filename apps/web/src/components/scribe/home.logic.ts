import type { ScribeEngineState, ScribeHistoryItem, ScribeSettings } from "@t3tools/contracts";

import { rewriteBindings } from "./settings.logic";

export interface ShortcutRow {
  readonly label: string;
  readonly bindings: readonly string[];
}

/** The shortcuts Home shows as key caps, in the order a new user needs them. */
export function homeShortcuts(hotkeys: ScribeSettings["sections"]["hotkeys"]): ShortcutRow[] {
  return [
    { label: "Hold to talk", bindings: hotkeys.hold },
    { label: "Start and stop", bindings: hotkeys.toggle },
    { label: "Rewrite selected text", bindings: rewriteBindings(hotkeys) },
  ];
}

/** The line under the dictate button. `hint` is true for guide text, false for real words. */
export function liveLine(
  state: ScribeEngineState | null,
  partial: string,
  lastTranscript: string,
): { readonly text: string; readonly hint: boolean } {
  if (state === "listening") {
    return partial ? { text: partial, hint: false } : { text: "Listening…", hint: true };
  }
  if (state === "processing") return { text: "Writing your text…", hint: true };
  return lastTranscript
    ? { text: lastTranscript, hint: false }
    : { text: "Press Start or a shortcut, then speak.", hint: true };
}

export interface DictateButtonModel {
  readonly label: string;
  readonly action: "start" | "stop" | "none";
  readonly disabled: boolean;
}

export function dictateButton(
  connected: boolean | null,
  state: ScribeEngineState | null,
): DictateButtonModel {
  if (connected !== true) return { label: "Start", action: "none", disabled: true };
  if (state === "listening") return { label: "Stop", action: "stop", disabled: false };
  if (state === "processing") return { label: "Processing", action: "none", disabled: true };
  return { label: "Start", action: "start", disabled: false };
}

/** A failed history read retries once when the engine comes back, not only on Try again. */
export function shouldRetryHistory(
  previous: boolean | null,
  connected: boolean | null,
  failed: boolean,
): boolean {
  return failed && connected === true && previous !== true;
}

const COMMAND_MESSAGES: Readonly<Record<string, string>> = {
  offline: "Scribe engine is not running. Start it from the tray, or install it.",
  timeout: "Scribe did not answer in time. Try again.",
  invalid_state: "Scribe is busy. Wait for it to finish, then try again.",
  invalid_response: "Scribe sent an answer the app cannot read. Try again.",
  not_found: "Scribe could not find that item.",
  store_error: "Scribe could not save your dictation. Try again.",
  http_error: "Scribe could not complete the request. Try again.",
};

const COMMAND_FALLBACK = "Scribe could not do that. Try again.";

/** The heading of the last engine error, and whether a saved take can be retried. */
export function engineErrorView(error: { readonly code: string; readonly message: string }): {
  readonly title: string;
  readonly retry: boolean;
} {
  const failedTake = error.code === "stt_error";
  return {
    title: failedTake ? "Dictation failed" : "Microphone problem",
    retry: failedTake && error.message.includes("Retry it in Scribe"),
  };
}

export function commandErrorReason(failure: unknown): string | null {
  const reason =
    typeof failure === "object" && failure !== null && "reason" in failure
      ? (failure as { reason: unknown }).reason
      : null;
  return typeof reason === "string" ? reason : null;
}

export function commandErrorMessage(failure: unknown): string {
  const reason = commandErrorReason(failure);
  return (reason === null ? undefined : COMMAND_MESSAGES[reason]) ?? COMMAND_FALLBACK;
}

export function relativeTimeLabel(at: string, now: number): string {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return "";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function rowMeta(item: ScribeHistoryItem, now: number): string {
  const parts = [relativeTimeLabel(item.at, now)];
  if (item.app.trim()) parts.push(item.app.trim());
  parts.push(`${item.words} ${item.words === 1 ? "word" : "words"}`);
  return parts.filter(Boolean).join(" · ");
}
