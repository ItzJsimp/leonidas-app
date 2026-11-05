import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { aiosWorkspaceTasksLayoutSet } from "~/state/aiosWorkspaces";
import { useAtomCommand } from "~/state/use-atom-command";

import { commitView, parseLayout, showView, type TasksLayout } from "./taskLayout.logic";

// Quick changes (several column moves) save once, after this pause.
const SAVE_DELAY_MS = 400;

export type TasksLayoutState = {
  readonly layout: TasksLayout;
  /** Applies a change at once and saves it to workspace.json after a short pause. */
  readonly update: (change: (layout: TasksLayout) => TasksLayout) => void;
  /** False when the open folder has no valid workspace.json: changes last for this visit only. */
  readonly canSave: boolean;
};

/**
 * The Tasks layout saved in the AIOS workspace.json (same storage as the rail's hidden
 * projects), so every device sees the same columns and row order. A change shows at once and
 * holds until the server sends the saved layout back. A failed save reverts it (the command shows
 * the error).
 */
export function useTasksLayout(): TasksLayoutState {
  const { environmentId, active, scope, refresh } = useActiveAiosWorkspace();
  const run = useAtomCommand(aiosWorkspaceTasksLayoutSet);
  const saved = useMemo(() => parseLayout(active?.tasksLayout), [active?.tasksLayout]);
  const savedJson = useMemo(() => JSON.stringify(saved), [saved]);
  const [local, setLocal] = useState<TasksLayout | null>(null);
  const canSave = environmentId !== null && active?.status === "ready";

  const latest = useRef({ saved, local, canSave, environmentId, scope, run, refresh });
  latest.current = { saved, local, canSave, environmentId, scope, run, refresh };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentJson = useRef<string | null>(null);

  // The server copy wins again once it matches what this page sent last.
  useEffect(() => {
    if (local && sentJson.current === savedJson && JSON.stringify(local) === savedJson) {
      setLocal(null);
    }
  }, [local, savedJson]);

  const flush = useCallback(() => {
    timer.current = null;
    const {
      local: next,
      canSave: ok,
      environmentId: id,
      scope: target,
      run: save,
    } = latest.current;
    if (!next || !ok || !id) return;
    sentJson.current = JSON.stringify(next);
    void save({ environmentId: id, input: { ...target, tasksLayout: next } }).then((result) => {
      if (result._tag === "Success") latest.current.refresh();
      else if (sentJson.current === JSON.stringify(next)) setLocal(null);
    });
  }, []);

  const update = useCallback(
    (change: (layout: TasksLayout) => TasksLayout) => {
      // `change` sees the shown layout: an open saved view's columns, not the default view's.
      const raw = latest.current.local ?? latest.current.saved;
      const shown = showView(raw);
      const changed = change(shown);
      if (changed === shown) return;
      const next = commitView(raw, shown, changed);
      latest.current.local = next;
      setLocal(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the tab saves a change that is still waiting.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const layout = useMemo(() => showView(local ?? saved), [local, saved]);
  return { layout, update, canSave };
}
