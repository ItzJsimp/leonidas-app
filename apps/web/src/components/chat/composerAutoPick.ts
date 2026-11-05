import type { ServerProviderSkill } from "@t3tools/contracts";

import { rankSkills, readDraft, shortlistSkills } from "./composerSkillSuggest";

export interface PickedSkill {
  readonly name: string;
  /** Why it fits, in a few words. Empty for a keyword pick. */
  readonly reason: string;
}

export interface ModelRequest {
  readonly request: string;
  readonly project: string;
  readonly alreadyAdded: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<{
    readonly name: string;
    readonly description: string;
    readonly scope?: string;
  }>;
  readonly max: number;
}

export type ModelEngine = "openrouter" | "groq" | "local" | "chat";

export interface ModelAnswer {
  readonly picks: ReadonlyArray<PickedSkill>;
  /** False when no model could answer. */
  readonly modelUsed: boolean;
  /** Which engine answered and the model it ran. Set only when `modelUsed` is true. */
  readonly engine?: ModelEngine | undefined;
  readonly model?: string | undefined;
}

export type AskModel = (request: ModelRequest) => Promise<ModelAnswer | null>;

export type AutoPickOutcome =
  | {
      readonly kind: "picked";
      readonly picks: ReadonlyArray<PickedSkill>;
      readonly by: "model" | "keyword";
      readonly engine?: ModelEngine | undefined;
      readonly model?: string | undefined;
    }
  | {
      readonly kind: "none";
      readonly by: "model" | "keyword";
      /** How many skills were looked at, so the user sees the check happened. */
      readonly checked: number;
    }
  | { readonly kind: "full"; readonly cap: number };

const MAX_DESCRIPTION_CHARS = 240;

/**
 * Picks the skills a draft needs. Keywords shortlist the pool, then the model decides.
 * With no model (offline, no project folder, a failure) the keyword pick answers instead.
 * `cap` is the total for the draft, so skills it already names use up room.
 */
export async function autoPickSkills(input: {
  readonly prompt: string;
  readonly projectText: string;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly cap: number;
  readonly askModel?: AskModel | undefined;
}): Promise<AutoPickOutcome> {
  const draft = readDraft(input.prompt, input.skills, input.cap);
  if (draft.room < 1) return { kind: "full", cap: input.cap };

  const shortlist = shortlistSkills(input);
  if (shortlist.length === 0) return { kind: "none", by: "keyword", checked: 0 };

  const answer = await input
    .askModel?.({
      request: draft.request,
      project: input.projectText,
      alreadyAdded: draft.alreadyAdded,
      candidates: shortlist.map((skill) => ({
        name: skill.name,
        description: (skill.description ?? skill.shortDescription ?? "").slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        ...(skill.scope ? { scope: skill.scope.toLowerCase() } : {}),
      })),
      max: draft.room,
    })
    .catch(() => null);
  if (answer?.modelUsed) {
    return answer.picks.length > 0
      ? {
          kind: "picked",
          picks: answer.picks,
          by: "model",
          engine: answer.engine,
          model: answer.model,
        }
      : { kind: "none", by: "model", checked: shortlist.length };
  }

  const picks = rankSkills(input).map((pick) => ({ name: pick.name, reason: "" }));
  return picks.length > 0
    ? { kind: "picked", picks, by: "keyword" }
    : { kind: "none", by: "keyword", checked: shortlist.length };
}

/** The toast line for a pick: `$name (reason)`, or just `$name` when there is no reason. */
export function describePicks(picks: ReadonlyArray<PickedSkill>): string {
  return picks
    .map((pick) => (pick.reason ? `$${pick.name} (${pick.reason})` : `$${pick.name}`))
    .join(", ");
}

/** Who made the pick, in words a user knows. Says so when it used the chat model's plan. */
export function describeEngine(
  engine: ModelEngine | undefined,
  model: string | undefined,
): string | null {
  switch (engine) {
    case "openrouter":
      return model === "openrouter/free" || model?.endsWith(":free")
        ? "OpenRouter free model"
        : "OpenRouter";
    case "groq":
      return "Groq";
    case "local":
      return "your local model";
    case "chat":
      return "your chat model, which uses your plan";
    default:
      return null;
  }
}

/** The text of the "no skills" pop-up: it says the check ran and what the user can do next. */
export function describeNone(outcome: { by: "model" | "keyword"; checked: number }): {
  title: string;
  description: string;
} {
  const next = "Use Skills to add one yourself.";
  if (outcome.checked === 0) {
    return {
      title: "No skills added",
      description: `No skill shares words with this message. ${next}`,
    };
  }
  const looked = `Checked ${outcome.checked} ${outcome.checked === 1 ? "skill" : "skills"}${outcome.by === "keyword" ? " by keyword" : ""}`;
  return {
    title: "No skills added",
    description: `${looked}. None fits this message well. ${next}`,
  };
}
