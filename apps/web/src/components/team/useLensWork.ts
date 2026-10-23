import type { TaskBoardTask, TaskBoardTeamMember, WorkspaceOrg } from "@t3tools/contracts";
import { useMemo } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useVisibleInterval } from "~/hooks/useVisibleInterval";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardWorkspaceQuery, workspaceOrgQuery } from "~/state/taskBoard";
import { lensLabel, lensTasks } from "./teamLens.logic";
import { useTeamLens } from "./TeamLensContext";

const NO_TASKS: ReadonlyArray<TaskBoardTask> = [];
const NO_TEAM: ReadonlyArray<TaskBoardTeamMember> = [];
const POLL_MS = 5_000;

export interface LensWork {
  readonly org: WorkspaceOrg | null;
  readonly tasks: ReadonlyArray<TaskBoardTask>;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  /** The lens name and its open tasks; null while no lens is set. */
  readonly lens: { readonly label: string; readonly tasks: TaskBoardTask[] } | null;
}

/**
 * The org, the board tasks and the team of the active business workspace, with the open tasks of
 * the current lens. `poll` keeps the board fresh; one consumer is enough (the Team view).
 */
export function useLensWork(options: { readonly poll?: boolean } = {}): LensWork {
  const { lens } = useTeamLens();
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const ready = environmentId !== null && scopeReady;
  const orgQuery = useEnvironmentQuery(
    ready ? workspaceOrgQuery({ environmentId, input: scope }) : null,
  );
  const board = useEnvironmentQuery(
    ready ? taskBoardWorkspaceQuery({ environmentId, input: scope }) : null,
  );
  const org = orgQuery.data?.org ?? null;
  useVisibleInterval(board.refresh, POLL_MS, Boolean(options.poll && org));
  const tasks = board.data?.tasks ?? NO_TASKS;
  const team = board.data?.team ?? NO_TEAM;
  return useMemo(
    () => ({
      org,
      tasks,
      team,
      lens:
        org && lens
          ? { label: lensLabel(org, lens), tasks: lensTasks(org, lens, tasks, team) }
          : null,
    }),
    [org, tasks, team, lens],
  );
}
