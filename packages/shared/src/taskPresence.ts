import type { OrchestrationV2ThreadShell, TaskBoardTask } from "@t3tools/contracts";

/** A chat that works on a card now. */
export interface TaskPresenceChat {
  readonly threadId: string;
  readonly title: string;
  readonly agent: string;
  readonly model: string;
  readonly status: "running" | "waiting";
}

type PresenceShell = Pick<
  OrchestrationV2ThreadShell,
  "id" | "title" | "modelSelection" | "activityRunStatus"
>;

/** Every thread a card links: the list, plus the older single-claim field. */
export const linkedThreadIds = (task: Pick<TaskBoardTask, "threadIds" | "claimedAgent">) => [
  ...new Set([
    ...(task.threadIds ?? []),
    ...(task.claimedAgent?.threadId ? [task.claimedAgent.threadId] : []),
  ]),
];

/**
 * The linked chats whose run is running or waiting (ADR-0090). It reads live run state, so a
 * stopped run drops out on the next shell update and a card can never show a stale claim.
 */
export function taskPresence(
  task: Pick<TaskBoardTask, "threadIds" | "claimedAgent">,
  shells: ReadonlyMap<string, PresenceShell>,
): ReadonlyArray<TaskPresenceChat> {
  return linkedThreadIds(task).flatMap((threadId) => {
    const shell = shells.get(threadId);
    const status = shell?.activityRunStatus;
    if (shell === undefined || (status !== "running" && status !== "waiting")) return [];
    return [
      {
        threadId,
        title: shell.title,
        agent: shell.modelSelection.instanceId,
        model: shell.modelSelection.model,
        status,
      },
    ];
  });
}
