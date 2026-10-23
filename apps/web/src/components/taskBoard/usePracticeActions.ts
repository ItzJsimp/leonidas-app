import type { TaskBoardTask } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { toastManager } from "~/components/ui/toast";

import {
  applyPracticePatch,
  practiceSeed,
  type PracticeDryRun,
  type PracticePatch,
} from "./practice.logic";
import { buildBatchPrompt, buildTaskPrompt, type TaskView } from "./taskBoard.logic";
import type { TaskActions } from "./taskBoard.types";

const ACTOR = "You";

export type PracticeState = {
  readonly tasks: ReadonlyArray<TaskBoardTask>;
  readonly actions: TaskActions;
  /** What the last "Send to agent" would have done; null when nothing is showing. */
  readonly dryRun: PracticeDryRun | null;
  readonly closeDryRun: () => void;
  /** Plays the part of the agent finishing the run, as the real server does. */
  readonly finishDryRun: () => void;
  readonly reset: () => void;
};

/**
 * Every Tasks action, run against sample tasks held in memory. Nothing here calls the server,
 * GitHub or an agent: sending only records what would have been started.
 */
export function usePracticeActions(): PracticeState {
  const [tasks, setTasks] = useState<ReadonlyArray<TaskBoardTask>>(() => practiceSeed(Date.now()));
  const [dryRun, setDryRun] = useState<PracticeDryRun | null>(null);

  const patch = useCallback((ids: ReadonlyArray<string>, change: PracticePatch) => {
    const now = Date.now();
    setTasks((current) =>
      current.map((task) =>
        ids.includes(task.id) ? applyPracticePatch(task, change, ACTOR, now) : task,
      ),
    );
  }, []);

  const send = useCallback(
    (sent: ReadonlyArray<TaskView>) => {
      const ctx = { aiosRoot: null, member: ACTOR };
      const prompt =
        sent.length === 1 ? buildTaskPrompt(sent[0]!, ctx) : buildBatchPrompt(sent, ctx);
      patch(
        sent.map((task) => task.id),
        {
          status: "in_progress",
          claimedBy: ACTOR,
          note: "Practice: sent to the AI (dry run, nothing started)",
        },
      );
      setDryRun({ tasks: sent, prompt });
    },
    [patch],
  );

  const finishDryRun = useCallback(() => {
    const ids = dryRun?.tasks.map((task) => task.id) ?? [];
    patch(ids, {
      status: "review",
      note: "The reply ended. Moved to review because the AI did not mark it done.",
    });
    setDryRun(null);
    toastManager.add({
      type: "success",
      title: "Practice: the AI finished",
      description: "Its tasks moved to Review by themselves. You did not need to update them.",
    });
  }, [dryRun, patch]);

  const actions = useMemo<TaskActions>(
    () => ({
      canEdit: true,
      setStatus: (task, status) => patch([task.id], { status }),
      setPriority: (task, priority) => patch([task.id], { priority }),
      setDue: (task, due) =>
        patch([task.id], { due, note: due ? `Due ${due}` : "Due date removed" }),
      setMilestone: (task, milestone) => patch([task.id], { milestone }),
      claim: (task) => patch([task.id], { claimedBy: ACTOR, status: "in_progress", note: "Taken" }),
      release: (task) => patch([task.id], { claimedBy: null, note: "Given back" }),
      setAssignee: (task, assignee) =>
        patch([task.id], {
          assignee,
          note: assignee ? `Assigned to ${assignee}` : "Made available to anyone",
        }),
      // The practice project is not a business workspace, so it has no private tasks.
      setPrivateArea: () => {},
      linkProject: () =>
        toastManager.add({
          type: "info",
          title: "Practice project",
          description: "You cannot move tasks between projects in the practice project.",
        }),
      setShared: () =>
        toastManager.add({
          type: "info",
          title: "Practice: nothing was shared",
          description: "In a real project this would share the task on its GitHub board.",
        }),
      sendToAgent: (task) => send([task]),
      sendBatchToAgent: (batch) => {
        if (batch.length > 0) send(batch);
      },
      organize: (changes) => {
        const now = Date.now();
        const byId = new Map(changes.map(({ task, suggestion }) => [task.id, suggestion]));
        setTasks((current) =>
          current.map((task) => {
            const suggestion = byId.get(task.id);
            return suggestion
              ? applyPracticePatch(
                  task,
                  {
                    ...(suggestion.effort ? { effort: suggestion.effort } : {}),
                    ...(suggestion.labels ? { labels: suggestion.labels } : {}),
                    note: "Organized automatically",
                  },
                  ACTOR,
                  now,
                )
              : task;
          }),
        );
        toastManager.add({
          type: "success",
          title: `Practice: organized ${changes.length} ${changes.length === 1 ? "task" : "tasks"}`,
        });
      },
      addNote: (task, note) => patch([task.id], { note }),
      isBusy: () => false,
      canShare: () => false,
      canSendToAgent: () => true,
    }),
    [patch, send],
  );

  return {
    tasks,
    actions,
    dryRun,
    closeDryRun: () => setDryRun(null),
    finishDryRun,
    reset: () => {
      setTasks(practiceSeed(Date.now()));
      setDryRun(null);
    },
  };
}
