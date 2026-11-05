// @effect-diagnostics preferSchemaOverJson:off
import { OPENROUTER_DRIVER_KIND } from "@t3tools/contracts";
import {
  buildSkillPickPrompt,
  sanitizeSkillPicks,
  type SkillPick,
  type SkillPickCandidate,
} from "@t3tools/provider-core/server/skillPick";
import { extractJsonObject } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as ServerSettings from "../serverSettings.ts";
import type { TextGeneration } from "../textGeneration/TextGeneration.ts";

/** The whole pick must not keep a click waiting longer than this. */
export const SKILL_PICK_TOTAL_MS = 12_000;
/** One engine gets at most this long, so a slow free model cannot use the whole budget. */
const PER_ENGINE_MS = 7_000;
/** Below this much time left, trying another engine is pointless. */
const MIN_ATTEMPT_MS = 1_500;
/** A rate-limited or unauthorised engine is skipped for this long; a network error for less. */
const COOLDOWN_REFUSED_MS = 5 * 60_000;
const COOLDOWN_FAILED_MS = 30_000;

const ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  // Same host Scribe uses for dictation (`GROQ_BASE_URL` in scribe/voiceDictation.logic.ts).
  groq: "https://api.groq.com/openai/v1/chat/completions",
  local: "http://127.0.0.1:11434/v1/chat/completions",
} as const;

export type SkillPickEngineChoice = "auto" | "openrouter" | "groq" | "local" | "chat" | "keyword";
type DirectEngine = keyof typeof ENDPOINTS;
export type SkillPickEngineUsed = DirectEngine | "chat";

export interface SkillPickRequest {
  readonly cwd: string;
  readonly request: string;
  readonly project: string;
  readonly alreadyAdded: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<SkillPickCandidate>;
  readonly max: number;
  readonly engine: SkillPickEngineChoice;
  readonly openRouterModel: string;
  readonly groqModel: string;
  readonly localModel: string;
}

export interface SkillPickResponse {
  readonly picks: ReadonlyArray<SkillPick>;
  /** False when no model answered, so the caller must fall back to its own pick. */
  readonly modelUsed: boolean;
  readonly engine?: SkillPickEngineUsed;
  readonly model?: string;
}

const UNAVAILABLE: SkillPickResponse = { picks: [], modelUsed: false };

type Step =
  | { readonly engine: DirectEngine; readonly model: string; readonly key: string | null }
  | { readonly engine: "chat" };

type EngineResult =
  | { readonly ok: true; readonly picks: ReadonlyArray<SkillPick> }
  | { readonly ok: false; readonly status: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads `{picks:[{name,reason}]}` out of a chat-completions body. Null means the answer was unusable. */
function readPicks(body: string): ReadonlyArray<SkillPick> | null {
  try {
    const content: unknown = (
      JSON.parse(body) as { choices?: [{ message?: { content?: unknown } }] }
    ).choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed: unknown = JSON.parse(extractJsonObject(content));
    if (!isRecord(parsed) || !Array.isArray(parsed.picks)) return null;
    return parsed.picks.flatMap((item: unknown) =>
      isRecord(item) && typeof item.name === "string"
        ? [{ name: item.name, reason: typeof item.reason === "string" ? item.reason : "" }]
        : [],
    );
  } catch {
    return null;
  }
}

/** The first enabled OpenRouter provider that has a key. The key is the one the user saved for chat. */
function openRouterKey(
  settings: Effect.Success<ServerSettings.ServerSettingsService["Service"]["getSettings"]>,
): string | null {
  for (const instance of Object.values(settings.providerInstances)) {
    if (instance.driver !== OPENROUTER_DRIVER_KIND || instance.enabled === false) continue;
    const key = isRecord(instance.config) ? instance.config.apiKey : undefined;
    if (typeof key === "string" && key.trim()) return key.trim();
  }
  return null;
}

/**
 * Asks a model which of the shortlisted skills fit the request. Free engines come first and
 * the paid chat model only runs when the user picks it, so "auto" never spends a plan.
 * Engines run in order, each with its own time cap; any failure moves on to the next, and
 * the caller falls back to keywords when none answers.
 */
export function make(
  textGeneration: TextGeneration["Service"],
  serverSettings: ServerSettings.ServerSettingsService["Service"],
  deps: {
    /** The Groq key Scribe saved in the OS vault. */
    readonly groqKey: Effect.Effect<Option.Option<string>, unknown>;
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
  },
) {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const blockedUntil = new Map<string, number>();

  const callDirect = (
    step: Extract<Step, { engine: DirectEngine }>,
    prompt: string,
    timeoutMs: number,
  ): Effect.Effect<EngineResult> =>
    Effect.tryPromise({
      try: async (signal): Promise<EngineResult> => {
        const response = await fetcher(ENDPOINTS[step.engine], {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            ...(step.key ? { Authorization: `Bearer ${step.key}` } : {}),
          },
          body: JSON.stringify({
            model: step.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            max_tokens: 1_200,
            response_format: { type: "json_object" },
          }),
        });
        if (!response.ok) return { ok: false, status: response.status };
        const picks = readPicks(await response.text());
        return picks ? { ok: true, picks } : { ok: false, status: null };
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.timeout(timeoutMs),
      // A network error, a timeout or an unreadable answer all mean "try the next engine".
      Effect.catch(() => Effect.succeed<EngineResult>({ ok: false, status: null })),
    );

  return {
    pick: (input: SkillPickRequest): Effect.Effect<SkillPickResponse> =>
      Effect.gen(function* () {
        if (input.candidates.length === 0 || input.max < 1 || input.engine === "keyword") {
          return UNAVAILABLE;
        }
        const settings = yield* serverSettings.getSettings;
        const groq = yield* deps.groqKey.pipe(Effect.orElseSucceed(() => Option.none<string>()));

        const openrouter: Step[] = [];
        const key = openRouterKey(settings);
        if (key && input.openRouterModel) {
          openrouter.push({ engine: "openrouter", model: input.openRouterModel, key });
        }
        const groqSteps: Step[] =
          Option.isSome(groq) && input.groqModel
            ? [{ engine: "groq", model: input.groqModel, key: groq.value }]
            : [];
        const local: Step[] = input.localModel
          ? [{ engine: "local", model: input.localModel, key: null }]
          : [];
        const steps: Step[] =
          input.engine === "auto"
            ? [...openrouter, ...groqSteps, ...local]
            : input.engine === "openrouter"
              ? openrouter
              : input.engine === "groq"
                ? groqSteps
                : input.engine === "local"
                  ? local
                  : [{ engine: "chat" }];

        const prompt = buildSkillPickPrompt(input).prompt;
        const started = now();
        for (const step of steps) {
          const left = SKILL_PICK_TOTAL_MS - (now() - started);
          if (left < MIN_ATTEMPT_MS) break;
          if ((blockedUntil.get(step.engine) ?? 0) > now()) continue;

          if (step.engine === "chat") {
            const generate = textGeneration.pickSkills;
            if (!generate) continue;
            const result = yield* generate({
              ...input,
              modelSelection: settings.textGenerationModelSelection,
            }).pipe(Effect.timeout(Math.min(left, SKILL_PICK_TOTAL_MS)), Effect.option);
            if (Option.isNone(result)) continue;
            return {
              picks: result.value.picks,
              modelUsed: true,
              engine: "chat",
              model: settings.textGenerationModelSelection.model,
            } satisfies SkillPickResponse;
          }

          const result = yield* callDirect(step, prompt, Math.min(left, PER_ENGINE_MS));
          if (result.ok) {
            return {
              picks: sanitizeSkillPicks(result.picks, input),
              modelUsed: true,
              engine: step.engine,
              model: step.model,
            } satisfies SkillPickResponse;
          }
          const refused =
            result.status === 401 ||
            result.status === 402 ||
            result.status === 403 ||
            result.status === 429;
          blockedUntil.set(
            step.engine,
            now() + (refused ? COOLDOWN_REFUSED_MS : COOLDOWN_FAILED_MS),
          );
        }
        return UNAVAILABLE;
      }).pipe(Effect.orElseSucceed(() => UNAVAILABLE)),
  };
}
