import type { SubagentCatalogEntry } from "@t3tools/contracts";

/** Most agents the Home block lists. A longer team shows this many and the total. */
export const HOME_TEAM_LIST_LIMIT = 40;
const DESCRIPTION_LIMIT = 160;

export type HomeTeamEntry = Pick<
  SubagentCatalogEntry,
  "name" | "description" | "tier" | "enabled" | "legacy" | "error" | "source"
>;

const oneLine = (text: string) => text.replaceAll(/\s+/g, " ").trim();

const startsLabel = (tier: HomeTeamEntry["tier"]) =>
  tier === "free" ? "starts at once" : "asks first";

/**
 * The agents the Home chat may start: on, valid, one per name, and in the AIOS folder itself.
 * Project agents are left out because `leo_delegate_task` looks for a name from the chat's own folder.
 */
export function homeTeam(entries: ReadonlyArray<HomeTeamEntry>): ReadonlyArray<HomeTeamEntry> {
  const byName = new Map<string, HomeTeamEntry>();
  for (const entry of entries) {
    if (entry.source !== "aios" || !entry.enabled || entry.legacy || entry.error !== null) continue;
    if (!byName.has(entry.name)) byName.set(entry.name, entry);
  }
  return [...byName.values()].toSorted((left, right) => left.name.localeCompare(right.name));
}

/** The `<home_agent>` instructions of the Home chat: its role, its team and its rules. */
export function homeAgentBlock(entries: ReadonlyArray<HomeTeamEntry>): string {
  const team = homeTeam(entries);
  const listed = team.slice(0, HOME_TEAM_LIST_LIMIT).map((entry) => {
    const job = oneLine(entry.description ?? "");
    const clipped =
      job.length > DESCRIPTION_LIMIT ? `${job.slice(0, DESCRIPTION_LIMIT - 1)}…` : job;
    return `- ${entry.name} (${startsLabel(entry.tier)})${clipped === "" ? "" : `: ${clipped}`}`;
  });
  const more =
    team.length > listed.length
      ? [`- ${team.length - listed.length} more agents are not listed. Ask the user for a name.`]
      : [];
  const teamLines =
    team.length === 0
      ? [
          "The team has no agents yet. Do the work yourself, and tell the user they can add agents in the Agents tab.",
        ]
      : [`Your team (${team.length} agent${team.length === 1 ? "" : "s"}):`, ...listed, ...more];
  return [
    "<home_agent>",
    "You are the Home chat. The user talks only to you, and you run their agent team.",
    ...teamLines,
    "Rules:",
    "- Do small work yourself. Hand work that fits an agent's job to that agent.",
    "- Start an agent with the `leo_delegate_task` tool. Pass its name in `subagent`.",
    "- Write a full brief: the goal, the files, the limits and the format of the result.",
    '- An agent marked "asks first" shows the user a card. Wait for the answer.',
    "- Read each result. Check it against the goal before you answer the user. Send it back with a better brief when it falls short.",
    "- Tell the user which agents ran and what each one did.",
    "</home_agent>",
  ].join("\n");
}
