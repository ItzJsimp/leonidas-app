import { DEFAULT_SUBAGENT_FREE_TIER_MODELS, type ServerProviderModel } from "@t3tools/contracts";

/** Effort levels from here up cost the most. A small task rarely needs them. */
const HEAVY_EFFORTS: ReadonlySet<string> = new Set(["high", "xhigh", "max", "ultra", "ultracode"]);
/** Lowest first. The suggestion is the first of these that sits below the current level. */
const DOWNSHIFT_EFFORTS = ["low", "medium"] as const;

const MAX_PROMPT_CHARS = 300;
const MAX_PROMPT_WORDS = 40;
/** A switch to another model re-reads the chat, so a long chat keeps its model. */
const MAX_CONTEXT_TOKENS_FOR_MODEL_SWITCH = 20_000;

// shortcut: word lists decide what is small, with no model call (it would cost money).
// Upgrade to a learned check when the misses show up in the notice dismiss counts.
const SMALL_TASK =
  /\b(typo|spelling|rename|comment|docstring|whitespace|indent(?:ation)?|formatting|lint|unused|import|bump|version|colou?r|label|wording|copy|text|readme|changelog|casing|capitali[sz]e|punctuation|semicolon|trailing)\b/i;
const LARGE_TASK =
  /\b(refactor|architecture|design|migrat\w*|investigate|debug|why|root cause|plan|implement|build|create|rewrite|audit|review|security|performance|across|entire|whole|every|all files|tests?|feature|bug|failing|error|crash|broken)\b/i;

/** True for a short prompt that names a small edit and nothing large. */
export function isSmallTask(prompt: string, attachmentCount: number): boolean {
  const text = prompt.trim();
  if (attachmentCount > 0 || text.length < 12 || text.length > MAX_PROMPT_CHARS) return false;
  if (text.includes("```") || text.split(/\s+/).length > MAX_PROMPT_WORDS) return false;
  return SMALL_TASK.test(text) && !LARGE_TASK.test(text);
}

export type Downshift =
  | { readonly kind: "effort"; readonly optionId: string; readonly label: string }
  | { readonly kind: "model"; readonly slug: string; readonly name: string };

export interface DownshiftInput {
  readonly prompt: string;
  readonly attachmentCount: number;
  /** Tokens already in the chat. Null when unknown. */
  readonly contextTokens: number | null;
  readonly currentEffortId: string | null;
  /** Effort levels of the current model, lowest first. */
  readonly effortOptions: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly cheapModels: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
}

/**
 * A cheaper setting for a small task, or null. A lower effort on the same model comes first,
 * because it keeps the chat's cache. A cheaper model comes second, and only while the chat
 * is short, because the switch drops the cache.
 */
export function suggestDownshift(input: DownshiftInput): Downshift | null {
  if (!isSmallTask(input.prompt, input.attachmentCount)) return null;
  if (input.currentEffortId !== null && HEAVY_EFFORTS.has(input.currentEffortId)) {
    const currentIndex = input.effortOptions.findIndex(
      (option) => option.id === input.currentEffortId,
    );
    for (const id of DOWNSHIFT_EFFORTS) {
      const index = input.effortOptions.findIndex((option) => option.id === id);
      if (index !== -1 && index < currentIndex) {
        return { kind: "effort", optionId: id, label: input.effortOptions[index]!.label };
      }
    }
  }
  const cheap = input.cheapModels[0];
  if (cheap && (input.contextTokens ?? 0) <= MAX_CONTEXT_TOKENS_FOR_MODEL_SWITCH) {
    return { kind: "model", slug: cheap.slug, name: cheap.name };
  }
  return null;
}

/** The provider's cheap-tier models, none when the current model is one already. */
export function cheapModelsFor(
  models: ReadonlyArray<ServerProviderModel>,
  currentModel: string,
): ReadonlyArray<{ readonly slug: string; readonly name: string }> {
  const cheap = (model: ServerProviderModel) =>
    [model.slug, ...(model.aliases ?? [])].some((id) =>
      DEFAULT_SUBAGENT_FREE_TIER_MODELS.includes(id),
    );
  const current = models.find(
    (model) => model.slug === currentModel || model.aliases?.includes(currentModel),
  );
  if (current && cheap(current)) return [];
  return models.filter(cheap).map(({ slug, name }) => ({ slug, name }));
}
