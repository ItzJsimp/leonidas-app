import type { SubagentDraftInput } from "@t3tools/contracts";

import { slugifySubagentName } from "./subagentEdit.logic";

/** The creator's two steps. The model is a step 1 field, not an Advanced one (Decision 5). */
export const CREATE_STEPS = [
  { id: "basics", label: "Name, avatar and model", fields: ["name", "avatar", "model"] },
  { id: "chat", label: "Describe the job", fields: ["request"] },
] as const;

/** What the Advanced panel holds. The model is not here: it sets the cost and the spawn tier. */
export const ADVANCED_FIELDS = ["effort", "tools", "skills", "canSpawn", "maxTurns"] as const;

/** The free-tier model that writes the draft, whatever model the new agent gets. */
export const DEFAULT_CREATOR_MODEL = "claude-haiku-5-5";
/** The model a new agent starts with. It is free tier, so the agent starts with no card. */
export const DEFAULT_AGENT_MODEL = "claude-haiku-5-5";

export interface BasicsInput {
  readonly nameText: string;
  readonly model: string;
  /** Names of the agents that exist, so a second agent never takes a name. */
  readonly takenNames: ReadonlySet<string>;
}

/** Why step 1 cannot go on, or null. The avatar always has a value, so it never blocks. */
export function basicsProblem(input: BasicsInput): string | null {
  const name = slugifySubagentName(input.nameText);
  if (name === null) return "Give the agent a name: lowercase words joined by dashes.";
  if (input.takenNames.has(name)) return `An agent named ${name} exists. Pick another name.`;
  if (input.model.trim() === "") return "Pick a model.";
  return null;
}

/** One creator turn. The creator model is always the free default, so a draft starts at once. */
export function draftInput(input: {
  readonly name: string;
  readonly avatar: string;
  readonly model: string;
  readonly request: string;
  readonly currentDraft: string | null;
  readonly confirmed: boolean;
}): SubagentDraftInput {
  return {
    name: input.name,
    avatar: input.avatar,
    model: input.model.trim(),
    creatorModel: DEFAULT_CREATOR_MODEL,
    request: input.request.trim(),
    ...(input.currentDraft === null ? {} : { currentDraft: input.currentDraft }),
    ...(input.confirmed ? { confirmed: true } : {}),
  };
}

export interface DraftPreview {
  readonly description: string;
  readonly tools: ReadonlyArray<string>;
  readonly instructions: string;
}

function unquote(text: string): string {
  if (!text.startsWith('"')) return text;
  try {
    return String(JSON.parse(text));
  } catch {
    return text.replace(/^"|"$/gu, "");
  }
}

/** What the chat shows of a draft: its job line, its tools and its instructions. */
export function previewDraft(contents: string): DraftPreview {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(contents);
  const head = match?.[1] ?? "";
  const toolsText = /^tools:[ \t]*\[(.*)\]/mu.exec(head)?.[1] ?? "";
  return {
    description: unquote(/^description:[ \t]*(.*)$/mu.exec(head)?.[1]?.trim() ?? ""),
    tools: toolsText
      .split(",")
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0),
    instructions: (match?.[2] ?? "").trim(),
  };
}
