import * as Schema from "effect/Schema";

/** What the user told the welcome step they build with Leonidas. */
export const LEONIDAS_GOALS_STORAGE_KEY = "leonidas:onboarding-goals";
export const LeonidasGoalsSchema = Schema.Array(Schema.String);

export interface LeonidasGoal {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export const LEONIDAS_GOALS: readonly LeonidasGoal[] = [
  { id: "web-apps", label: "Apps and tools", hint: "Anything you click through" },
  { id: "websites", label: "Websites", hint: "Pages for you or someone else" },
  { id: "mobile-apps", label: "Phone apps", hint: "iPhone and Android" },
  { id: "automation", label: "Automation", hint: "Let the computer do the boring parts" },
  { id: "data", label: "Data and numbers", hint: "Reports, charts, answers" },
  { id: "agents", label: "AI helpers", hint: "Assistants that do things for you" },
  { id: "games", label: "Games", hint: "From a quick prototype to a full build" },
  { id: "design", label: "Making it look good", hint: "Polish, layout, feel" },
  { id: "fix-code", label: "Fixing what I already have", hint: "Bugs, cleanups, upgrades" },
  { id: "learning", label: "Learning as I go", hint: "Understand while we build" },
];

/** Keeps stored picks that still exist, so a retired goal never breaks the step. */
export function normalizeGoalIds(stored: readonly string[]): readonly string[] {
  const known = new Set(LEONIDAS_GOALS.map((goal) => goal.id));
  return stored.filter((id) => known.has(id));
}

/** How many goals the Welcome step shows before "Show more". */
export const GOALS_COLLAPSED_COUNT = 6;

/** Goals to render: the first few, plus any picked goal so a pick never hides. */
export function selectVisibleGoals(
  selected: readonly string[],
  showAll: boolean,
): readonly LeonidasGoal[] {
  if (showAll) return LEONIDAS_GOALS;
  return LEONIDAS_GOALS.filter(
    (goal, index) => index < GOALS_COLLAPSED_COUNT || selected.includes(goal.id),
  );
}

export function toggleGoal(selected: readonly string[], id: string): readonly string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
}

/** Where the guided setup builds the AIOS; the server expands the leading ~. */
export const AIOS_FOLDER_STORAGE_KEY = "leonidas:aios-folder";
/** One simple default for every user: a folder named Leonidas AIOS in the user folder. */
export const DEFAULT_AIOS_LOCATION = "~";
export const DEFAULT_AIOS_NAME = "Leonidas AIOS";
export const DEFAULT_AIOS_FOLDER = `${DEFAULT_AIOS_LOCATION}/${DEFAULT_AIOS_NAME}`;

export interface AiosPresetEntry {
  readonly path: string;
  readonly purpose: string;
}

/** Starter AIOS shape: identity, memory, tasks, projects and skills. */
export const AIOS_PRESET: readonly AiosPresetEntry[] = [
  {
    path: "CLAUDE.md",
    purpose: "Who you are and how the AI should work with you. Loaded every session.",
  },
  {
    path: "AGENTS.md",
    purpose: "The same rules for tools that read AGENTS.md instead (Codex and others).",
  },
  {
    path: "memory/",
    purpose: "Facts the AI keeps between sessions: your preferences and corrections.",
  },
  { path: "tasks/", purpose: "One card per task, so the AI can pick what to work on next." },
  { path: "projects/", purpose: "One folder per project, each with its own notes and rules." },
  {
    path: ".claude/skills/",
    purpose: "Reusable how-to instructions the AI loads when a task matches.",
  },
];

function goalLabels(goalIds: readonly string[]): readonly string[] {
  return normalizeGoalIds(goalIds).flatMap((id) => {
    const goal = LEONIDAS_GOALS.find((entry) => entry.id === id);
    return goal ? [goal.label] : [];
  });
}

/** The prompt a user pastes into the AI they already use to build their AIOS. */
export function buildAiosSetupPrompt(
  goalIds: readonly string[],
  options: { readonly inCurrentFolder?: boolean } = {},
): string {
  const goals = goalLabels(goalIds);
  const tree = AIOS_PRESET.map((entry) => `- ${entry.path}: ${entry.purpose}`).join("\n");
  return [
    "Help me set up an AIOS (an AI operating system): a folder of plain files that tells my AI who I am, remembers what matters, and tracks my work, so every session starts with context.",
    goals.length > 0
      ? `I mainly use AI to work on: ${goals.join(", ")}.`
      : "I have not picked a main use yet, so keep the setup general.",
    options.inCurrentFolder
      ? "Create this structure in the current folder, which is already my AIOS folder. The folder may already hold other files. Leave them alone. If one of the files below already exists, read it, keep what is in it, and ask me before you change it:"
      : "Create this structure in a new folder (ask me where first):",
    tree,
    "Ask me a few short questions (my name, what I build, how I like answers written), then fill in CLAUDE.md and AGENTS.md from my answers. Keep each file short and plain.",
    options.inCurrentFolder
      ? "When done, list what you created in one line each. Then suggest 3 to 5 extra skills that fit how I work and write each to .claude/skills/<name>/SKILL.md and .agents/skills/<name>/SKILL.md."
      : "When done, list what you created and tell me how to open that folder in Leonidas.",
  ].join("\n\n");
}

/**
 * The folder picker chooses where the AIOS goes. A plain folder like Documents gets a
 * `Leonidas AIOS` folder inside it; a folder already named like an AIOS is used as is.
 */
export function aiosFolderFromPick(picked: string): string {
  const trimmed = picked.replace(/[\/]+$/, "");
  const name = trimmed.split(/[\/]/).pop() ?? "";
  if (/aios/i.test(name)) return trimmed;
  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${DEFAULT_AIOS_NAME}`;
}
