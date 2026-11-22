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
    description: "Warm and direct. Same person, same facts.",
    instruction:
      "Rewrite in a warm, natural, direct tone, as the same person talking to someone they like working with. Keep the audience, point of view and purpose of the text: a note about a client stays a note about the client, and is never turned into a message to the client. Keep any greeting, thanks, apology or sign-off that is already there, and add no greeting, sign-off, name or sentence that is not. Lead with the point or the ask and keep it as short as the content allows. Use contractions where they sound natural and plain words, with no hype, hollow praise or exclamation points. Keep every fact, date, number, commitment, question and request exactly as given: a question stays a question, an observation stays an observation, and nothing becomes a promise, apology, advice or detail the sender did not state. Use no long dash character.",
  },
  {
    name: "Prompt",
    description: "Turn a spoken idea into a clear prompt for an AI.",
    instruction:
      "Rewrite as a clean, dense prompt for an AI agent that is smarter than you. Make the ask concrete, but never decide for the agent. Lead with the action verb or the clear intent. Drop pleasantries and filler (please, maybe, kinda, could you, I feel like) and swap a vague word for the most precise word for what the speaker means. Keep the speaker's scope exactly: if they ask to look into something, the output asks to look into it and does not add a fix; if they say tell me, it stays a request to report back. Add no deliverable, step, check, goal, boundary, requirements list or done-when criterion the speaker did not name. Keep a hypothesis a hypothesis: might be the DPI code becomes may be the DPI code, never is. Keep every open-ended or reasoning-inviting phrase (figure out, think through, explore, what do you think, what is the best way, what would change your mind) as an open question, in the speaker's own words, and never close it into a command or swap it for a formal synonym. Keep technical identifiers, file paths, branch names, versions, numbers and flags verbatim. Write natural prose of about the same length, or slightly longer if that makes the ask actionable. Use a list only when the text already holds four or more separate constraints. Use no long dash character. Output only the rewritten prompt.",
  },
  {
    name: "Slack",
    description: "A short Slack message. Point first.",
    instruction:
      "Rewrite as a short Slack message from the same person. Lead with the point or the ask in the first line. Keep it casual and direct, in one to three short sentences or lines, with no greeting, sign-off or headings. Keep every fact, name, number, date, time and request, and keep any question as a question. Add no emoji, hype, apology or detail the text does not state. Use no long dash character. Output only the message.",
  },
  {
    name: "Email",
    description: "A clear, polite email. Point first.",
    instruction:
      "Rewrite as a clear, polite email body from the same person. Open with a greeting only if the text names a recipient. Put the main point or ask in the first sentence, group related points into short paragraphs, and end with the next step or request when the text has one. Keep a professional, plain tone. Keep every fact, name, number, date, commitment, question and request exactly as given, and add no promise, apology, subject line, sign-off or detail the text does not state. Use no long dash character. Output only the email body.",
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
  Slack: {
    before:
      "Hey so I was thinking that maybe we should push the release to Friday because the installer bug is still not fixed and I really don't want to ship it broken, so let me know what you think about that.",
    after:
      "Can we push the release to Friday? The installer bug isn't fixed yet and I don't want to ship it broken. Thoughts?",
  },
  Email: {
    before:
      "Okay so um hi Sam, thanks for sending the contract over, I read through it and it's mostly fine, but, like, the net 45 part is really long compared to what we usually do, so could we maybe do net 30 instead? Let me know and I can get it signed this week, thanks.",
    after:
      "Hi Sam, thanks for sending the contract. It looks mostly fine, but net 45 is longer than we usually do. Could we do net 30 instead? Let me know and I can sign this week.",
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
