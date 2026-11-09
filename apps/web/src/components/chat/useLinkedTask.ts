import type { TaskBoardCardUpdateInput } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { toastManager } from "~/components/ui/toast";
import { useVisibleInterval } from "~/hooks/useVisibleInterval";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardCardUpdate, taskBoardWorkspaceQuery } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

import { pickLinkedCard } from "./linkedTask.logic";

// The Tasks page polls every 5 s; a chat only needs its own card, so it polls at half that rate.
const LINKED_REFRESH_MS = 10_000;

type CardPatch = Pick<TaskBoardCardUpdateInput, "status" | "note">;

/**
 * The task card this chat works on, from the same cached board read the Tasks page uses.
 * `poll` is true for one caller per chat, so two parts of one screen never double the reads.
 */
export function useLinkedTask(threadId: string, poll: boolean) {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const workspace = useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardWorkspaceQuery({ environmentId, input: scope }) : null,
  );
  const { refresh } = workspace;
  useVisibleInterval(refresh, LINKED_REFRESH_MS, poll && environmentId !== null);
  const tasks = workspace.data?.tasks;
  const task = useMemo(() => pickLinkedCard(tasks ?? [], threadId), [tasks, threadId]);
  const member = workspace.data?.member ?? null;

  const runCardUpdate = useAtomCommand(taskBoardCardUpdate, { reportFailure: false });
  const update = useCallback(
    async (patch: CardPatch, failureTitle: string) => {
      if (!environmentId || !task || !member) return;
      const result = await runCardUpdate({
        environmentId,
        input: {
          ...workspaceScopeInput(activeWorkspaceId(environmentId)),
          taskId: task.id,
          actor: member,
          expectedUpdatedAt: task.updatedAt,
          ...patch,
        },
      });
      if (result._tag !== "Success") {
        toastManager.add({ type: "error", title: failureTitle, description: "Please try again." });
      }
      refresh();
    },
    [environmentId, member, refresh, runCardUpdate, task],
  );

  return { task, update };
}
