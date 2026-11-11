import type { SubagentCatalogEntry } from "@t3tools/contracts";

export type StudioGroupKey = "lead" | "on" | "catalog" | "projects" | "fix";

export interface StudioGroup {
  readonly key: StudioGroupKey;
  readonly title: string;
  readonly entries: ReadonlyArray<SubagentCatalogEntry>;
}

/** Stable id: one name can exist in the AIOS and in a project. */
export const entryId = (entry: Pick<SubagentCatalogEntry, "specPath">) => entry.specPath;

const needsFix = (entry: SubagentCatalogEntry) => entry.legacy || entry.error !== null;

/** The orchestrator: a team agent that may start the others. */
export const isLead = (entry: SubagentCatalogEntry) => entry.canSpawn === true && !needsFix(entry);

/**
 * The Team list: the lead first, then AIOS agents that are on, the AIOS catalog (off),
 * project agents, then specs that do not resolve. The search matches
 * name, description and project.
 */
export function groupStudioEntries(
  entries: ReadonlyArray<SubagentCatalogEntry>,
  query: string,
): ReadonlyArray<StudioGroup> {
  const needle = query.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? entries
      : entries.filter((entry) =>
          [entry.name, entry.description ?? "", entry.projectName ?? ""].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        );
  const aios = visible.filter(
    (entry) => entry.source === "aios" && !needsFix(entry) && !isLead(entry),
  );
  return [
    { key: "lead", title: "Lead", entries: visible.filter(isLead) },
    { key: "on", title: "On", entries: aios.filter((entry) => entry.enabled) },
    { key: "catalog", title: "Catalog", entries: aios.filter((entry) => !entry.enabled) },
    {
      key: "projects",
      title: "Projects",
      entries: visible.filter(
        (entry) => entry.source === "project" && !needsFix(entry) && !isLead(entry),
      ),
    },
    { key: "fix", title: "Needs fixing", entries: visible.filter(needsFix) },
  ];
}

/** On and ready: turned on and resolves, so a spawn would start. */
export const countReady = (entries: ReadonlyArray<SubagentCatalogEntry>) =>
  entries.filter((entry) => entry.enabled && !needsFix(entry)).length;

/** "10.8k" for the KPI strip; whole numbers under 1,000. */
export function formatTokensShort(tokens: number): string {
  return tokens < 1_000 ? String(tokens) : `${(tokens / 1_000).toFixed(1)}k`;
}

/**
 * A note for models whose engine does not start a persona lean. Claude is the
 * lean path; Codex loads AGENTS.md too; other engines ignore the persona and
 * the server refuses the spawn. Null when there is nothing to warn about.
 */
export function personaEngineHint(model: string | null): string | null {
  if (model === null) return null;
  if (model.startsWith("claude-")) return null;
  if (model.startsWith("gpt-")) {
    return "Runs on Codex. Codex also loads AGENTS.md, so it starts larger than the estimate.";
  }
  if (model.startsWith("gemini-")) {
    return "Antigravity ignores a subagent's persona, so a start on this model is refused. Pick a Claude or Codex model.";
  }
  return null;
}
