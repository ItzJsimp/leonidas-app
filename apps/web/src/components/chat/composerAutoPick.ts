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

export interface ModelAnswer {
  readonly picks: ReadonlyArray<PickedSkill>;
  /** False when the model could not answer. */
  readonly modelUsed: boolean;
}

export type AskModel = (request: ModelRequest) => Promise<ModelAnswer | null>;

export type AutoPickOutcome =
  | {
      readonly kind: "picked";
      readonly picks: ReadonlyArray<PickedSkill>;
      readonly by: "model" | "keyword";
    }
  | { readonly kind: "none"; readonly by: "model" | "keyword" }
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
  if (shortlist.length === 0) return { kind: "none", by: "keyword" };

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
      ? { kind: "picked", picks: answer.picks, by: "model" }
      : { kind: "none", by: "model" };
  }

  const picks = rankSkills(input).map((pick) => ({ name: pick.name, reason: "" }));
  return picks.length > 0
    ? { kind: "picked", picks, by: "keyword" }
    : { kind: "none", by: "keyword" };
}

/** The toast line for a pick: `$name (reason)`, or just `$name` when there is no reason. */
export function describePicks(picks: ReadonlyArray<PickedSkill>): string {
  return picks
    .map((pick) => (pick.reason ? `$${pick.name} (${pick.reason})` : `$${pick.name}`))
    .join(", ");
}
