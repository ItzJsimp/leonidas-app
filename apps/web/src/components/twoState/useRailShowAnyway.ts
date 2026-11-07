import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

const STORAGE_KEY = "leonidas:rail-show-anyway";
const ShowAnywaySchema = Schema.Record(Schema.String, Schema.Array(Schema.String));
const NONE: Readonly<Record<string, readonly string[]>> = {};

/** The business tabs a person chose to show in one workspace, and a way to flip one. */
export function useRailShowAnyway(workspaceId: string | null | undefined) {
  const [all, setAll] = useLocalStorage(STORAGE_KEY, NONE, ShowAnywaySchema);
  const key = workspaceId ?? "default";
  const shown = all[key] ?? [];
  const toggle = (tabId: string, on: boolean) =>
    setAll({
      ...all,
      [key]: on
        ? [...shown.filter((id) => id !== tabId), tabId]
        : shown.filter((id) => id !== tabId),
    });
  return { shown, toggle };
}
