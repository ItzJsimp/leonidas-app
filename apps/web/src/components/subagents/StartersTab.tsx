import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { SUBAGENT_STARTERS } from "~/onboarding/subagentStarters";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { subagentCreate, subagentsCatalogQuery, subagentsComposerQuery } from "~/state/subagents";
import { useAtomCommand } from "~/state/use-atom-command";

import { AgentAvatar } from "./Avatar";
import { defaultAvatar } from "./avatar.logic";
import { writeFailureMessage } from "./SubagentEditor";
import { importedMessage, importLabel, starterCards } from "./startersTab.logic";
import { modelDisplayName } from "./spawnApproval.logic";

/**
 * Starters: one card per tested agent file that ships with the app. Import copies one into the
 * AIOS team. An agent with the same name is never overwritten: the server writes `<name>-2.md`.
 */
export function StartersTab() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const catalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsCatalogQuery({ environmentId, input: scope }) : null,
  );
  const composerCatalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsComposerQuery({ environmentId, input: scope }) : null,
  );
  const create = useAtomCommand(subagentCreate, { reportFailure: false });
  const [busyName, setBusyName] = useState<string | null>(null);

  const hasAios = catalog.data?.aiosRoot != null;
  const cards = starterCards(
    SUBAGENT_STARTERS,
    new Set(
      (catalog.data?.entries ?? [])
        .filter((entry) => entry.source === "aios")
        .map((entry) => entry.name),
    ),
  );

  const importStarter = async (name: string) => {
    const starter = SUBAGENT_STARTERS.find((item) => item.name === name);
    if (starter === undefined || environmentId === null) return;
    setBusyName(name);
    const result = await create({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        name,
        contents: starter.contents,
        destination: { kind: "aios" },
        onNameTaken: "number",
      },
    });
    setBusyName(null);
    if (result._tag === "Success") {
      catalog.refresh();
      composerCatalog.refresh();
      toastManager.add({ type: "success", title: importedMessage(name, result.value.name) });
      return;
    }
    if (isAtomCommandInterrupted(result)) return;
    toastManager.add({
      type: "error",
      title: "Could not import the starter",
      description: writeFailureMessage(squashAtomCommandFailure(result), "Try again."),
    });
  };

  return (
    <section aria-label="Starters" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Starters are tested agents. Import one to put a copy on your team, then change it to fit
        your work.
      </p>
      {hasAios || catalog.data === null ? null : (
        <p role="status" className="rounded-md bg-warning/10 px-3 py-2 text-sm">
          Connect your AIOS folder on Home to import a starter.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li
            key={card.name}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <AgentAvatar avatar={defaultAvatar(card.name)} name={card.name} size={36} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{card.name}</h3>
                {card.model === null ? null : (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {modelDisplayName(card.model)}
                  </p>
                )}
              </div>
              {card.inTeam ? (
                <Badge variant="secondary" size="sm">
                  On your team
                </Badge>
              ) : null}
            </div>
            <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{card.description}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasAios || busyName !== null}
              onClick={() => void importStarter(card.name)}
            >
              {busyName === card.name ? <Spinner /> : <DownloadIcon aria-hidden />}
              {importLabel(card)}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
