import type { FreeChat } from "./frontierDigest.ts";

/** Same hosts as Auto-pick skills (`workspace/SkillPick.ts`). */
export const FREE_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  local: "http://127.0.0.1:11434/v1/chat/completions",
} as const;

export type FreeEngine = keyof typeof FREE_ENDPOINTS;

export interface FreeStep {
  readonly engine: FreeEngine;
  readonly model: string;
  readonly key: string | null;
}

/**
 * The paid-usage guard. OpenRouter runs only its free router or a `:free` model; Groq runs on
 * the free key Scribe saved; local runs on this machine. Nothing else is ever called.
 */
export function isFreeStep(step: FreeStep): boolean {
  if (step.engine === "openrouter")
    return step.model === "openrouter/free" || step.model.endsWith(":free");
  return step.engine === "groq" || step.engine === "local";
}

const ENGINE_TIMEOUT_MS = 120_000;

/** Tries each free step in order and returns the first answer. Records every call it makes. */
export function makeFreeChat(
  steps: ReadonlyArray<FreeStep>,
  options: { readonly fetch?: typeof fetch; readonly calls?: FreeStep[] } = {},
): FreeChat {
  const fetcher = options.fetch ?? fetch;
  return async (prompt) => {
    for (const step of steps) {
      if (!isFreeStep(step)) continue;
      options.calls?.push(step);
      try {
        const response = await fetcher(FREE_ENDPOINTS[step.engine], {
          method: "POST",
          signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            ...(step.key ? { Authorization: `Bearer ${step.key}` } : {}),
          },
          body: JSON.stringify({
            model: step.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            max_tokens: 6_000,
          }),
        });
        if (!response.ok) continue;
        const body = (await response.json()) as {
          choices?: ReadonlyArray<{ message?: { content?: unknown } }>;
        };
        const text = body.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim())
          return { text, engine: step.engine, model: step.model };
      } catch {
        // A timeout or network error moves on to the next free engine.
      }
    }
    return null;
  };
}
