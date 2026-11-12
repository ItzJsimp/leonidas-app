import { DEFAULT_SUBAGENT_FREE_TIER_MODELS } from "@t3tools/contracts";

import type { SubagentStarter } from "~/onboarding/subagentStarters";

export interface StarterCard {
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
  /** `free` starts at once. `asks first` shows a card with the cost. Null without a model. */
  readonly tier: "free" | "asks first" | null;
  readonly tools: ReadonlyArray<string>;
  /** An agent with this name is already on the team, so Import would write `<name>-2.md`. */
  readonly inTeam: boolean;
}

const frontmatterLine = (contents: string, key: string): string | null => {
  const head = contents.slice(0, 2_000);
  const match = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "mu").exec(head);
  const value = match?.[1]?.replace(/^"(.*)"$/u, "$1").replace(/^'(.*)'$/u, "$1");
  return value === undefined || value === "" ? null : value;
};

/** The one-line job of a starter, read from its `description:` line. */
export const starterDescription = (contents: string): string =>
  frontmatterLine(contents, "description") ?? "";

/** One card per starter file, with a flag for the starters the team already holds. */
export function starterCards(
  starters: ReadonlyArray<SubagentStarter>,
  teamNames: ReadonlySet<string>,
): ReadonlyArray<StarterCard> {
  return starters.map((starter) => ({
    name: starter.name,
    description: starterDescription(starter.contents),
    model: frontmatterLine(starter.contents, "model"),
    tier: starterTier(frontmatterLine(starter.contents, "model")),
    tools: starterTools(starter.contents),
    inTeam: teamNames.has(starter.name),
  }));
}

const FREE_MODELS: ReadonlySet<string> = new Set(DEFAULT_SUBAGENT_FREE_TIER_MODELS);

function starterTier(model: string | null): StarterCard["tier"] {
  if (model === null) return null;
  return FREE_MODELS.has(model) ? "free" : "asks first";
}

/** The names in the `tools: [A, B]` line of a starter. */
export function starterTools(contents: string): ReadonlyArray<string> {
  const text = /^tools:[ \t]*\[(.*)\]/mu.exec(contents.slice(0, 2_000))?.[1] ?? "";
  return text
    .split(",")
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);
}

/** The cards that a typed word matches in the name, the job or a tool. */
export function filterStarterCards(
  cards: ReadonlyArray<StarterCard>,
  query: string,
): ReadonlyArray<StarterCard> {
  const word = query.trim().toLowerCase();
  if (word === "") return cards;
  return cards.filter((card) =>
    `${card.name} ${card.description} ${card.tools.join(" ")}`.toLowerCase().includes(word),
  );
}

export const importLabel = (card: Pick<StarterCard, "inTeam">): string =>
  card.inTeam ? "Add another copy" : "Import";

/** What the toast says after an import. The server picked `entryName`. */
export function importedMessage(starterName: string, entryName: string): string {
  return entryName === starterName
    ? `${starterName} is on your team.`
    : `${starterName} was already on your team, so it was added as ${entryName}.`;
}
