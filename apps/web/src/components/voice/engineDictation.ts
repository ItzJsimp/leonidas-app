import type { ScribeEngineState } from "@t3tools/contracts";

/** Where this composer's own take is: none, asked to start, or heard the engine listening. */
export type EngineTake = "idle" | "started" | "listening";

/**
 * Follows one take the composer started in the Scribe engine. The engine emits the transcript
 * before it returns to `ready`, so the text is final when `ready` follows `listening`.
 * `insert` is the text to put in the composer, or null.
 */
export function stepEngineTake(
  take: EngineTake,
  state: ScribeEngineState | null,
  transcript: string,
): { readonly take: EngineTake; readonly insert: string | null } {
  if (take === "started" && state === "listening") return { take: "listening", insert: null };
  if (take === "listening" && state === "ready") {
    return { take: "idle", insert: transcript.trim() ? transcript : null };
  }
  if (take !== "idle" && state === "mic_error") return { take: "idle", insert: null };
  return { take, insert: null };
}
