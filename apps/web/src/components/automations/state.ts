import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { type AutomationRow, fromEntry, fromScheduledTask, GROUPS } from "./automations.logic";

const automationsListQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:automations:list",
  tag: WS_METHODS.automationsList,
  staleTimeMs: 15_000,
  idleTtlMs: 5 * 60_000,
  refreshIntervalMs: 30_000,
});

export const automationsSetEnabled = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:automations:set-enabled",
  tag: WS_METHODS.automationsSetEnabled,
});

export const automationsSetSchedule = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:automations:set-schedule",
  tag: WS_METHODS.automationsSetSchedule,
});

export const automationsRunNow = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:automations:run-now",
  tag: WS_METHODS.automationsRunNow,
});

export interface AutomationsData {
  readonly environmentId: ReturnType<typeof usePrimaryEnvironmentId>;
  readonly rows: ReadonlyArray<AutomationRow>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly registerBuiltAt: string | null;
  readonly refresh: () => void;
}

/** App automations, agent schedules and the AIOS register, in tab order. */
export function useAutomations(): AutomationsData {
  const environmentId = usePrimaryEnvironmentId();
  const list = useEnvironmentQuery(
    environmentId ? automationsListQuery({ environmentId, input: {} }) : null,
  );
  const tasks = useEnvironmentQuery(
    environmentId ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );
  const rows = useMemo(() => {
    const all = [
      ...(list.data?.entries ?? []).map(fromEntry),
      ...(environmentId
        ? (tasks.data?.tasks ?? []).map((task) => fromScheduledTask(task, environmentId))
        : []),
    ];
    const order = new Map(GROUPS.map((group, index) => [group.id, index]));
    return all.toSorted((a, b) => order.get(a.group)! - order.get(b.group)!);
  }, [environmentId, list.data, tasks.data]);
  return {
    environmentId,
    rows,
    loading: list.data === null && list.error === null,
    error: list.error,
    registerBuiltAt: list.data?.registerBuiltAt ?? null,
    refresh: list.refresh,
  };
}
