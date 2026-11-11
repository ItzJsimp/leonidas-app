import type { TaskBoardTask } from "@t3tools/contracts";
import { linkedThreadIds } from "@t3tools/shared/taskPresence";

import { isOpen } from "../taskBoard/taskBoard.logic";

type Linkable = Pick<TaskBoardTask, "status" | "updatedAt" | "threadIds" | "claimedAgent" | "kind">;

/**
 * The card this chat works on. A real card beats the card made from the request itself
 * (`agent_run`), an open card beats a closed one, and the newest wins a tie.
 */
export function pickLinkedCard<T extends Linkable>(
  tasks: ReadonlyArray<T>,
  threadId: string,
): T | null {
  const linked = tasks.filter((task) => linkedThreadIds(task).includes(threadId));
  const real = linked.filter((task) => task.kind !== "agent_run");
  const cards = real.length > 0 ? real : linked;
  const open = cards.filter(isOpen);
  const pool = open.length > 0 ? open : cards;
  return pool.reduce<T | null>(
    (newest, task) => (newest === null || task.updatedAt > newest.updatedAt ? task : newest),
    null,
  );
}

/**
 * The newest note in the card's activity, where an agent leaves its proof. The change summary
 * ("status → Awaiting Review - ") and the reconciler's `[run …]` and `[idle]` markers are dropped.
 */
export function lastNote(task: Pick<TaskBoardTask, "history">): string | null {
  const raw = task.history.findLast((entry) => entry.note)?.note;
  if (raw && /^status\s*→[^\n]*$/.test(raw) && !raw.includes(" - ")) return null;
  const note = raw
    ?.replace(/^[^\n]*?→[^\n]*? - /, "")
    .replace(/\s*\[(?:run [^\]]*|idle)\]/g, "")
    .trim();
  return note ? note : null;
}
