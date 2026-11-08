/** One rewrite preset as the engine reads it from `presets.rewrite` (contract v1.4). */
export interface RewritePreset {
  readonly name: string;
  readonly instruction: string;
  /** One line under the name in the rewrite menu. Without it the engine shows a built-in line or the first sentence. */
  readonly description?: string;
}

/** The menu row has room for about this many characters. */
export const MAX_DESCRIPTION = 60;

/** The picker answers to keys 1 to 9, so the engine reads at most 9 presets. */
export const MAX_REWRITE_PRESETS = 9;

/** The engine uses these when `presets.rewrite` is missing or empty. "Reset to defaults" writes them. */
export const DEFAULT_REWRITE_PRESETS: readonly RewritePreset[] = [
  {
    name: "Clarity",
    description: "Fix grammar and order. Same facts, same length.",
    instruction:
      "Rewrite so each sentence has exactly one reading and the ideas follow in logical order, while the point, intent, voice and every fact stay the same. Resolve an ambiguous pronoun, vague referent or dangling clause by naming what it points to, but only when the surrounding text settles it; where the text leaves it open, keep the original wording instead of guessing. Put cause before effect, premise before conclusion, and related points together, and state a connection explicitly (because, so, but) only when the text already implies it. Keep the first-person perspective, and keep every point, question, example and constraint; length may stay the same or grow slightly, shortening is not a goal. Fix grammar and punctuation along the way. Add no new claims, advice or structure.",
  },
  {
    name: "Shorter",
    description: "Cut filler. Keep your voice and every fact.",
    instruction:
      "Cut the word count by deleting, not restructuring: remove filler, hedges, repeated ideas, throat-clearing and passive padding, and prefer the shorter of two equivalent phrasings. Keep the original voice, person, tone and sentence order, and every fact, name, number and request. Do not reframe it as an instruction, add structure, or sharpen vague wording; the text should read like the same author in fewer words. If it is already tight, trim what you can and leave the rest.",
  },
  {
    name: "Friendly",
    description: "A warm message to a client or a friend.",
    instruction:
      "Rewrite as a message to a client or a friend: warm, natural and direct, using contractions where they sound natural. Infer the register from the text: a client gets professional warmth and a clear next step; a friend gets casual and easy. Lead with the point or the ask, keep it as short as the content allows, and keep every fact, date, number and commitment exactly as given without adding promises, apologies or details the sender did not state. Use plain words, no hype, hollow praise, exclamation points or filler pleasantries.",
  },
  {
    name: "Prompt",
    description: "Turn a spoken idea into a clear prompt for an AI.",
    instruction:
      "Your lane is AI-actionable specificity, not brevity: the output may be the same length or slightly longer than the input if that makes the ask concrete enough for an agent to act on. Rewrite as a clean, dense prompt for an AI agent that is smarter than you are. Your job is clarity and density, not deciding for it: never compile away its judgment. Lead with the action verb or clear intent. Strip hedges and pleasantries ('please', 'I feel like', 'maybe', 'could you'). Beyond trimming, actively improve word choice and phrasing quality: replace a vague or generic word with the most precise one for what the speaker actually means, and tighten a mushy or ambiguous ask into a concrete one. This is a wording-quality upgrade only, never convert it into bullet points, headings, or new sections, the output stays natural prose exactly like the rest of this rewrite. Preserve technical identifiers and file paths verbatim. Only convert to bullet points under headings if the original already contains 4 or more genuinely distinct, enumerable constraints, otherwise keep it as tight prose. Never invent a 'DO NOT' boundary, a 'Requirements:' section, or a 'Done when:' acceptance criterion the original did not already imply, only sharpen ones that were already there. Preserve every open-ended, exploratory, or reasoning-inviting phrase from the original ('figure out', 'think through', 'what's the best way', 'explore', 'what do you think'), never flatten these into closed imperative commands. Output only the rewritten prompt block.",
  },
];

/** A hand-written before and after for each built-in preset, so a new user sees its job. */
export const PRESET_SAMPLES: Readonly<
  Record<string, { readonly before: string; readonly after: string }>
> = {
  Clarity: {
    before:
      "Yes. Can we continue and run the top 10 research? But I kinda feel like seven subagents is kind of a lot. So can we try to just split this out between four agents instead?",
    after:
      "Yes, let's continue and run the top 10 research. Seven subagents feels like a lot, though. Can we split it between four agents instead?",
  },
  Shorter: {
    before:
      "Okay. Can you check and verify which prompts I have already ran and make sure everything is good? Because I have already ran a few of these prompts. I just wanna make sure that all their task cards have been completed and done.",
    after: "Can you check which prompts I already ran, and confirm that their task cards are done?",
  },
  Friendly: {
    before:
      "What is cool is that you can set it up without even having to open it. However, if you want to, you can see the designs it makes live. It is super cool, so I definitely recommend trying it.",
    after:
      "The cool part: you can set it up without opening it. If you want, you can watch the designs it makes live. Definitely worth a try.",
  },
  Prompt: {
    before:
      "Can we run both option A and option B in a new session? So I'd like you to write a handoff prompt and then spin up a new session using the bigger model on high effort, please.",
    after:
      "Run options A and B in a new session. Write a handoff prompt first, then start the new session on the bigger model at high effort.",
  },
};

function isPreset(value: unknown): value is RewritePreset {
  if (typeof value !== "object" || value === null) return false;
  const { name, instruction, description } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof instruction === "string" &&
    (description === undefined || typeof description === "string")
  );
}

/**
 * The presets the picker shows: the saved list, or the built-in ones when the list is
 * missing, empty or unreadable. `builtIn` tells the page which of the two it shows.
 */
export function readRewritePresets(presets: Readonly<Record<string, unknown>>): {
  readonly list: readonly RewritePreset[];
  readonly builtIn: boolean;
} {
  const raw = presets.rewrite;
  const list = Array.isArray(raw)
    ? raw
        .filter(isPreset)
        .slice(0, MAX_REWRITE_PRESETS)
        .map(({ name, instruction, description }) =>
          description ? { name, instruction, description } : { name, instruction },
        )
    : [];
  return list.length > 0
    ? { list, builtIn: false }
    : { list: DEFAULT_REWRITE_PRESETS, builtIn: true };
}

export interface PresetErrors {
  readonly name?: string;
  readonly instruction?: string;
}

/** One entry per preset. An empty object means the preset is valid. */
export function validatePresets(list: readonly RewritePreset[]): PresetErrors[] {
  const counts = new Map<string, number>();
  for (const preset of list) {
    const key = preset.name.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list.map((preset) => {
    const key = preset.name.trim().toLowerCase();
    const errors: { name?: string; instruction?: string } = {};
    if (!key) errors.name = "Give the preset a name.";
    else if ((counts.get(key) ?? 0) > 1) errors.name = "Another preset has this name.";
    if (!preset.instruction.trim()) errors.instruction = "Write what the rewrite must do.";
    return errors;
  });
}

export function hasPresetErrors(errors: readonly PresetErrors[]): boolean {
  return errors.some((entry) => entry.name !== undefined || entry.instruction !== undefined);
}

/** Moves one item up (-1) or down (+1). An item at the edge stays where it is. */
export function movePreset<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const next = [...list];
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return next;
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

/** The list as the engine stores it: trimmed fields, and no empty description. */
export function cleanPresets(list: readonly RewritePreset[]): RewritePreset[] {
  return list.map((preset) => {
    const description = preset.description?.trim().slice(0, MAX_DESCRIPTION);
    return {
      name: preset.name.trim(),
      instruction: preset.instruction.trim(),
      ...(description ? { description } : {}),
    };
  });
}

export function samePresets(a: readonly RewritePreset[], b: readonly RewritePreset[]): boolean {
  return JSON.stringify(cleanPresets(a)) === JSON.stringify(cleanPresets(b));
}
