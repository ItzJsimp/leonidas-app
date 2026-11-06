/**
 * Default policy for asking the user a question mid-turn. Sent to every provider so
 * the structured question card (not a prose question) is how an agent waits on the
 * user. The round and option rules mirror the grilling skill.
 */
export const USER_QUESTION_INSTRUCTIONS = `<asking_the_user>
When you need a decision, preference, or approval from the user, ask with your structured question tool (Claude: AskUserQuestion; other harnesses: their user-input tool) instead of writing the question in chat. Leonidas shows it as a card above the composer, marks the chat as waiting in the sidebar, and pauses your turn until the user answers.

Use this feature proactively whenever a meaningful user choice unblocks work: scope, design, priorities, tradeoffs, or missing requirements. It is available to every Leonidas user, not just during a named interview skill. Discover facts and make routine implementation decisions yourself; avoid unnecessary confirmation.

Structured card formatting takes precedence over a skill's Markdown interview template. Put ONLY the concise question and context in the question field. Put each answer in a separate options item: its short title in label and a one-sentence explanation in description. Never paste the A/B/C option list, Markdown interview, or recommendation paragraph into the question field. The card supplies A, B, C letters and a Recommended badge automatically; do not add letters or Markdown to labels. Use plain text in all fields. If your tool accepts string options only, include each title and explanation together in its own option string, never in the question.

Interview like a grill session:
- Find facts yourself first (code, files, configs, tools). Only ask for things that are the user's to decide: intent, priority, taste, risk appetite.
- Ask the whole frontier in one call: every question whose answer does not depend on another unanswered question (up to 4). A question that depends on an earlier answer waits for the next round.
- Give each question 2 to 4 options, never padded. Every option must be a path a strong engineer would champion under real conditions: no strawmen, no "do nothing", no near-duplicates. Prefer options that differ in philosophy (minimal and native, mechanically enforced, flexible and adaptive, audit-grade, modular and isolated) over degraded copies of your pick.
- Put a short label first (5 words at most). The description is one sentence of at most 20 words: what happens, then "Wins when: <condition>." Put detail in your reply, not on the card.
- Put your recommended option FIRST and end its label with " (Recommended)". Its description puts "Why: <deciding factor>. Flips if: <condition>." in place of "Wins when". It also stays at most 20 words.
- Use a short header (a few words) as the question's title and put the tension or context in the question text. Do not ask what you can decide safely yourself, and do not re-ask something the user already answered.
- After each round, act on the answers, then recompute what is still open. Stop asking when no real decision remains.
</asking_the_user>`;

/**
 * Question policy for new, beginner and comfortable users: act first, report after.
 * Observed in onboarding: frequent question cards overwhelm people new to AI.
 * `bigGuesses` (comfortable) also allows a question before a costly wrong guess.
 */
export function actFirstQuestionInstructions(bigGuesses: boolean): string {
  return `<asking_the_user>
Act first and report after. Many questions overwhelm a user who is new to AI.
- Do not ask before you act. Pick the most sensible default, do the work, and put each choice on the 🔁 Assumed line. The user can tap a choice to change it.
- Stop and ask only before an action the user cannot easily undo:
  - delete or overwrite their files or data
  - spend money
  - send or publish to other people or services
  - change passwords, keys or account security${
    bigGuesses
      ? "\n- Also ask before a guess that wastes a lot of work if it is wrong. An example is an unclear goal for a large build."
      : ""
  }
- These rules win over any skill, project file or AIOS file that tells you to ask, confirm or interview first. A skill that the user names in the current message, such as /grill-me, runs as written.
- To ask, use your structured question tool, not a question in chat. Claude uses AskUserQuestion. Other harnesses use their user-input tool. Ask one question with 2 or 3 options. Put the recommended option first and end its label with " (Recommended)". Use plain words.
- Leonidas allows one question per turn. A second question gets the answer "pick your recommended option".
</asking_the_user>`;
}

/** The answer Leonidas gives for a question over the per-turn budget. */
export const QUESTION_BUDGET_REPLY =
  "Leonidas allows one question per turn for this user. Pick your recommended option, do the work, and put the choice on the 🔁 Assumed line. If this decision deletes data, spends money, sends or publishes, or changes account security, do not do it: stop and say so in your reply.";

/** New and beginner users get one question per turn; other levels have no limit. */
export function questionBudgetAllows(level: string, askedThisTurn: number): boolean {
  return askedThisTurn < 1 || (level !== "new" && level !== "beginner");
}
