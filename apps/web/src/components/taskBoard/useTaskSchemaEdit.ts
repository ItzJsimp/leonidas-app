import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  AiosWorkspaceScopeInput,
  EnvironmentId,
  TaskSchemaProperty,
  TaskSchemaPropertyEdit,
} from "@t3tools/contracts";

import { toastManager } from "~/components/ui/toast";
import { taskSchemaPropertySet } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

import { propertyEdit } from "./taskProps.logic";
import { failureText } from "./useTaskActions.logic";
import { useLatest } from "./TaskRowParts";
import type { TaskUndo } from "./useTaskUndo";

/** Adds, changes or removes (`edit` null) one property with an undo step. Resolves success. */
export type SchemaChange = (
  label: string,
  key: string,
  edit: TaskSchemaPropertyEdit | null,
) => Promise<boolean>;

export function useTaskSchemaEdit(input: {
  readonly environmentId: EnvironmentId | null;
  readonly scope: AiosWorkspaceScopeInput;
  readonly schema: ReadonlyArray<TaskSchemaProperty>;
  readonly undo: TaskUndo;
  readonly refresh: () => void;
}): SchemaChange {
  const run = useAtomCommand(taskSchemaPropertySet, { reportFailure: false });
  const latest = useLatest(input);

  const set = async (key: string, edit: TaskSchemaPropertyEdit | null): Promise<boolean> => {
    const { environmentId, scope, refresh } = latest.current;
    if (!environmentId) return false;
    const result = await run({ environmentId, input: { ...scope, key, property: edit } });
    refresh();
    if (result._tag === "Success") return true;
    if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not change the property",
        description: failureText(squashAtomCommandFailure(result), "Please try again."),
      });
    }
    return false;
  };

  return async (label, key, edit) => {
    const { schema, undo } = latest.current;
    const old = schema.find((property) => property.key === key);
    const before = old ? propertyEdit(old) : null;
    if (!(await set(key, edit))) return false;
    undo.record(label, { undo: () => set(key, before), redo: () => set(key, edit) });
    return true;
  };
}
