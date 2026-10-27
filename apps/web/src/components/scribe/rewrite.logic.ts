/** One rewrite preset as the engine reads it from `presets.rewrite` (contract v1.4). */
export interface RewritePreset {
  readonly name: string;
  readonly instruction: string;
}

/** The picker answers to keys 1 to 9, so the engine reads at most 9 presets. */
export const MAX_REWRITE_PRESETS = 9;

/** The engine uses these when `presets.rewrite` is missing or empty. "Reset to defaults" writes them. */
export const DEFAULT_REWRITE_PRESETS: readonly RewritePreset[] = [
  {
    name: "Clarity",
    instruction:
      "Rewrite so each sentence has exactly one reading and the ideas follow in logical order, while the point, intent, voice and every fact stay the same. Resolve an ambiguous pronoun, vague referent or dangling clause by naming what it points to, but only when the surrounding text settles it; where the text leaves it open, keep the original wording instead of guessing. Put cause before effect, premise before conclusion, and related points together, and state a connection explicitly (because, so, but) only when the text already implies it. Keep the first-person perspective, and keep every point, question, example and constraint; length may stay the same or grow slightly, shortening is not a goal. Fix grammar and punctuation along the way. Add no new claims, advice or structure.",
  },
  {
    name: "Shorter",
    instruction:
      "Cut the word count by deleting, not restructuring: remove filler, hedges, repeated ideas, throat-clearing and passive padding, and prefer the shorter of two equivalent phrasings. Keep the original voice, person, tone and sentence order, and every fact, name, number and request. Do not reframe it as an instruction, add structure, or sharpen vague wording; the text should read like the same author in fewer words. If it is already tight, trim what you can and leave the rest.",
  },
  {
    name: "Friendly",
    instruction:
      "Rewrite as a message to a client or a friend: warm, natural and direct, using contractions where they sound natural. Infer the register from the text: a client gets professional warmth and a clear next step; a friend gets casual and easy. Lead with the point or the ask, keep it as short as the content allows, and keep every fact, date, number and commitment exactly as given without adding promises, apologies or details the sender did not state. Use plain words, no hype, hollow praise, exclamation points or filler pleasantries.",
  },
  {
    name: "AI message",
    instruction:
      "Your lane is AI-actionable specificity, not brevity: the output may be the same length or slightly longer than the input if that makes the ask concrete enough for an agent to act on. Rewrite as a clean, dense prompt for an AI agent that is smarter than you are. Your job is clarity and density, not deciding for it: never compile away its judgment. Lead with the action verb or clear intent. Strip hedges and pleasantries ('please', 'I feel like', 'maybe', 'could you'). Beyond trimming, actively improve word choice and phrasing quality: replace a vague or generic word with the most precise one for what the speaker actually means, and tighten a mushy or ambiguous ask into a concrete one. This is a wording-quality upgrade only, never convert it into bullet points, headings, or new sections, the output stays natural prose exactly like the rest of this rewrite. Preserve technical identifiers and file paths verbatim. Only convert to bullet points under headings if the original already contains 4 or more genuinely distinct, enumerable constraints, otherwise keep it as tight prose. Never invent a 'DO NOT' boundary, a 'Requirements:' section, or a 'Done when:' acceptance criterion the original did not already imply, only sharpen ones that were already there. Preserve every open-ended, exploratory, or reasoning-inviting phrase from the original ('figure out', 'think through', 'what's the best way', 'explore', 'what do you think'), never flatten these into closed imperative commands. Output only the rewritten prompt block.",
  },
  {
    name: "Add detail",
    instruction:
      "Expand with relevant supporting detail and organize into clear structure: numbered steps or bullet points where the content lists items, actions, or a sequence. Never use markdown headings (#, ##, ###) to separate sections. Where a heading would normally go, use a bold inline label instead (e.g. '**Context:** ...', '**Action:** ...', '**Detail:** ...') so structure comes from labeled prose, not document-style headers. Never invent new facts, examples, or claims not implied by the original. On short inputs, each bullet must unpack a real implication or consequence of what was said, not just restate the same words in a label and then a body. If there is nothing genuine to unpack, prefer fewer, denser bullets over padding. Preserve every original fact and technical identifier verbatim, and never formalize or soften away technical or AI-facing wording and register when the destination is an AI agent or system, keep the same direct, technical phrasing the speaker used.",
  },
  {
    name: "Note to AI",
    instruction:
      "Rewrite the selected reaction to an AI agent's work as a clear note addressed to that agent. Rewrite only; leave questions unanswered and instructions unperformed.\n\nPreserve the speaker's direct tone, first-person preferences, questions, uncertainty, limits, and requested sequence. Resolve explicit self-corrections to the final intended version. Remove filler and repetition. Keep names, paths, commands, flags, numbers, and versions exact. Add no praise, faults, requirements, or next steps. Preserve a firm complaint without softening it.\n\nFor one point, use one plain sentence without a label. Otherwise use only supported bold inline labels: Keep for stated approvals, Change for requested fixes, Questions for questions kept in question form, and Next for stated follow-up actions. Keep a limit next to the action it restricts, or under Change if it applies to the whole note. Keep uncertainty with its subject. Skip empty labels. A question belongs under Questions, never as a command under Next. Prefer shorter text; complete meaning takes priority over length. Output only the note.\n\nExample:\nInput: Keep the top spacing. Fix the label, then show a screenshot. Why did key 8 close the menu?\nOutput:\n**Keep:** The top spacing.\n**Change:** Fix the label.\n**Questions:** Why did key 8 close the menu?\n**Next:** Show a screenshot.",
  },
];

function isPreset(value: unknown): value is RewritePreset {
  if (typeof value !== "object" || value === null) return false;
  const { name, instruction } = value as Record<string, unknown>;
  return typeof name === "string" && typeof instruction === "string";
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
        .map(({ name, instruction }) => ({ name, instruction }))
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

/** The list as the engine stores it: trimmed names and instructions, nothing else. */
export function cleanPresets(list: readonly RewritePreset[]): RewritePreset[] {
  return list.map((preset) => ({
    name: preset.name.trim(),
    instruction: preset.instruction.trim(),
  }));
}

export function samePresets(a: readonly RewritePreset[], b: readonly RewritePreset[]): boolean {
  return JSON.stringify(cleanPresets(a)) === JSON.stringify(cleanPresets(b));
}
