import type { AiosDirection } from "@t3tools/contracts";

const WEEK_FILE = "ideal-state/horizons.md";

/** The 10-minute weekly re-plan grill. The user sends it; the app never starts the agent. */
export const WEEKLY_REPLAN_PROMPT = `Run my weekly re-plan grill. Take about 10 minutes.

1. Read ideal-state/goals.md and ${WEEK_FILE}. Read my open High and Critical task cards.
2. Ask me at most 5 short questions, one at a time: what moved last week, what is stuck, and what matters most this week. Give 2 or 3 options for each question and mark your pick.
3. Draft the new Week block. Change only the text between the <!-- week:start --> and <!-- week:end --> markers in ${WEEK_FILE}. Begin it with "**Week of YYYY-MM-DD to YYYY-MM-DD**" using today's date.
4. Show me the draft. Write it to the file only after I say yes.
5. Tell me if the Month, 6 Months, 1 Year or Life sections need a change. Do not edit them without my yes.`;

/** The first-time grill for an AIOS with no goals yet. */
export const FIRST_PLAN_PROMPT = `Help me set my direction. Take about 10 minutes.

1. Check whether ideal-state/goals.md and ${WEEK_FILE} exist. Create them if they do not.
2. Ask me at most 5 short questions, one at a time: what I want in the next week, month, 6 months, 1 year, and my life. Give 2 or 3 options for each question and mark your pick.
3. Write ideal-state/goals.md as a table with the columns ID, Goal, Measured by, Target date, Status. Use IDs G0, G1 and so on.
4. Write ${WEEK_FILE} with the sections Week, Month, 6 Months, 1 Year and Life. Put the Week text between <!-- week:start --> and <!-- week:end --> markers. Begin it with "**Week of YYYY-MM-DD to YYYY-MM-DD**" using today's date.
5. Show me each file as a draft. Write it only after I say yes.`;

export const replanPrompt = (direction: Pick<AiosDirection, "goals" | "horizons">): string =>
  direction.goals.length === 0 && direction.horizons.every((horizon) => horizon.items.length === 0)
    ? FIRST_PLAN_PROMPT
    : WEEKLY_REPLAN_PROMPT;

/** One plain sentence for the stale banner; null when the week block is fresh. */
export const staleMessage = (
  direction: Pick<AiosDirection, "weekStale" | "weekAgeDays">,
): string | null => {
  if (!direction.weekStale) return null;
  return direction.weekAgeDays === null
    ? "Your week plan has no date. Re-plan to set this week."
    : `Your week plan is ${direction.weekAgeDays} days old. Re-plan to set this week.`;
};

export interface ReplanDeps {
  /** Opens an empty chat draft in the AIOS project. It starts no agent. Null when none can open. */
  readonly openDraft: () => Promise<{ readonly setPrompt: (prompt: string) => void } | null>;
  readonly writeClipboard: (text: string) => Promise<void>;
}

export interface ReplanResult {
  readonly copied: boolean;
  readonly placed: boolean;
}

/**
 * Puts the prompt on the clipboard and in the chat box. It only touches those two places: it
 * never sends the prompt and never starts a thread run, so the user reads it first.
 */
export async function placeReplanPrompt(deps: ReplanDeps, prompt: string): Promise<ReplanResult> {
  const copied = await deps.writeClipboard(prompt).then(
    () => true,
    () => false,
  );
  const draft = await deps.openDraft().catch(() => null);
  if (draft === null) return { copied, placed: false };
  draft.setPrompt(prompt);
  return { copied, placed: true };
}

/** First line of a horizon's items, shortened for the collapsed row. */
export const horizonPreview = (items: ReadonlyArray<string>, max = 90): string => {
  const first = items[0];
  if (first === undefined) return "Nothing planned yet.";
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
};
