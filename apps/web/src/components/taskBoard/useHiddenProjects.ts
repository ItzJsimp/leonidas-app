import { useCallback, useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { aiosWorkspaceHiddenProjectsSet } from "~/state/aiosWorkspaces";
import { useAtomCommand } from "~/state/use-atom-command";

import { nextHidden } from "./tasksPage.logic";

const NONE: ReadonlyArray<string> = [];

/**
 * The projects the rail folds into "More", saved in the AIOS workspace.json so every device sees
 * the same rail. A change shows at once and holds until the saved list comes back from the server.
 * `setHidden` is null when the open folder has no valid workspace.json to save into.
 */
export function useHiddenProjects(): {
  readonly hidden: ReadonlyArray<string>;
  readonly setHidden: ((slug: string, hide: boolean) => void) | null;
} {
  const { environmentId, active, scope, refresh } = useActiveAiosWorkspace();
  const run = useAtomCommand(aiosWorkspaceHiddenProjectsSet);
  const saved = active?.hiddenProjects ?? NONE;
  // A pending list applies only while the server still sends the list it was based on.
  const [pending, setPending] = useState<{
    readonly base: ReadonlyArray<string>;
    readonly next: ReadonlyArray<string>;
  } | null>(null);
  const hidden = pending !== null && pending.base === saved ? pending.next : saved;

  const setHidden = useCallback(
    (slug: string, hide: boolean) => {
      if (!environmentId) return;
      const next = nextHidden(hidden, slug, hide);
      setPending({ base: saved, next });
      void run({ environmentId, input: { ...scope, hiddenProjects: next } }).then((result) => {
        if (result._tag === "Success") refresh();
        else setPending(null);
      });
    },
    [environmentId, hidden, refresh, run, saved, scope],
  );

  return { hidden, setHidden: environmentId && active?.status === "ready" ? setHidden : null };
}
