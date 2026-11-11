import type { SubagentStarter } from "~/onboarding/subagentStarters";

export interface StarterCard {
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
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
    inTeam: teamNames.has(starter.name),
  }));
}

export const importLabel = (card: Pick<StarterCard, "inTeam">): string =>
  card.inTeam ? "Add another copy" : "Import";

/** What the toast says after an import. The server picked `entryName`. */
export function importedMessage(starterName: string, entryName: string): string {
  return entryName === starterName
    ? `${starterName} is on your team.`
    : `${starterName} was already on your team, so it was added as ${entryName}.`;
}
