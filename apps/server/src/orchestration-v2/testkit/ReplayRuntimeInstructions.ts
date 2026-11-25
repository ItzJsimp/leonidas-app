import type { ProviderDriverKind, ProviderReplayTranscript } from "@t3tools/contracts";

import { buildRuntimeInstructions } from "@t3tools/provider-core/server/runtimeInstructions";

export function materializeReplayTranscriptRuntimeInstructions(
  transcript: ProviderReplayTranscript,
  runtime: { readonly driver: ProviderDriverKind; readonly model: string },
): ProviderReplayTranscript {
  if (runtime.driver === "muse")
    return materializeMuseRuntimeInstructions(transcript, runtime.model);
  const harness =
    runtime.driver === "cursor"
      ? "Cursor"
      : runtime.driver === "grok"
        ? "Grok"
        : runtime.driver === "acpRegistry"
          ? "acpRegistry"
          : undefined;
  if (harness === undefined) return transcript;
  const instructions = buildRuntimeInstructions({ harness, model: runtime.model });

  return {
    ...transcript,
    entries: transcript.entries.map((entry) => {
      if (entry.type !== "expect_outbound") return entry;
      const frame = entry.frame;
      if (typeof frame !== "object" || frame === null) return entry;
      if (
        runtime.driver === "cursor" &&
        "type" in frame &&
        frame.type === "run.start" &&
        "message" in frame &&
        typeof frame.message === "string"
      ) {
        return frame.message.endsWith(instructions)
          ? entry
          : { ...entry, frame: { ...frame, message: `${frame.message}\n\n${instructions}` } };
      }
      if (
        "method" in frame &&
        frame.method === "session/prompt" &&
        "params" in frame &&
        typeof frame.params === "object" &&
        frame.params !== null &&
        "prompt" in frame.params &&
        Array.isArray(frame.params.prompt)
      ) {
        const prompt: ReadonlyArray<unknown> = frame.params.prompt;
        const lastPart = prompt.at(-1);
        if (
          typeof lastPart === "object" &&
          lastPart !== null &&
          "type" in lastPart &&
          lastPart.type === "text" &&
          "text" in lastPart &&
          lastPart.text === instructions
        ) {
          return entry;
        }
        return {
          ...entry,
          frame: {
            ...frame,
            params: { ...frame.params, prompt: [...prompt, { type: "text", text: instructions }] },
          },
        };
      }
      return entry;
    }),
  };
}

// Muse sends the runtime instructions as the first input part of each turn/start. Rebuilding
// them here keeps recorded fixtures from failing on every edit to the instruction text.
function materializeMuseRuntimeInstructions(
  transcript: ProviderReplayTranscript,
  model: string,
): ProviderReplayTranscript {
  return {
    ...transcript,
    entries: transcript.entries.map((entry) => {
      if (entry.type !== "expect_outbound") return entry;
      const frame = entry.frame as {
        readonly method?: unknown;
        readonly params?: { readonly input?: unknown; readonly reasoningEffort?: unknown };
      } | null;
      if (frame?.method !== "turn/start" || !Array.isArray(frame.params?.input)) return entry;
      const [first, ...rest]: ReadonlyArray<unknown> = frame.params.input;
      if (
        typeof first !== "object" ||
        first === null ||
        !("text" in first) ||
        typeof first.text !== "string" ||
        !first.text.startsWith("<runtime_info>")
      ) {
        return entry;
      }
      const reasoningEffort = frame.params.reasoningEffort;
      const text = buildRuntimeInstructions({
        harness: "Muse Code",
        model,
        ...(typeof reasoningEffort === "string" ? { reasoningEffort } : {}),
      });
      return {
        ...entry,
        frame: { ...frame, params: { ...frame.params, input: [{ ...first, text }, ...rest] } },
      };
    }),
  };
}
