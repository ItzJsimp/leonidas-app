import type { TaskBoardTask } from "@t3tools/contracts";
import { linkedThreadIds } from "@t3tools/shared/taskPresence";

import { isOpen } from "../taskBoard/taskBoard.logic";

type Linkable = Pick<TaskBoardTask, "status" | "updatedAt" | "threadIds" | "claimedAgent">;

/** The card this chat works on: the newest open card that links it, else the newest closed one. */
export function pickLinkedCard<T extends Linkable>(
  tasks: ReadonlyArray<T>,
  threadId: string,
): T | null {
  const linked = tasks.filter((task) => linkedThreadIds(task).includes(threadId));
  const open = linked.filter(isOpen);
  const pool = open.length > 0 ? open : linked;
  return pool.reduce<T | null>(
    (newest, task) => (newest === null || task.updatedAt > newest.updatedAt ? task : newest),
    null,
  );
}

/** The newest note in the card's activity, where an agent leaves its proof. */
export function lastNote(task: Pick<TaskBoardTask, "history">): string | null {
  return task.history.findLast((entry) => entry.note)?.note ?? null;
}
