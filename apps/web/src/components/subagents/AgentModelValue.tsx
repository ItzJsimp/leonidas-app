import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, SubagentCatalogEntry } from "@t3tools/contracts";
import { useState } from "react";

import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { subagentUpdate } from "~/state/subagents";
import { useAtomCommand } from "~/state/use-atom-command";

import { ModelSelect } from "./ModelSelect";
import { writeFailureMessage } from "./SubagentEditor";
import { modelDisplayName } from "./spawnApproval.logic";

/**
 * The value of the Model row on the Team detail. A user who can write the agent file picks a model
 * from the list, and the pick writes `model:` to the file at once. Anyone else sees the name.
 */
export function AgentModelValue(props: {
  readonly entry: Pick<SubagentCatalogEntry, "specPath" | "model">;
  readonly environmentId: EnvironmentId | null;
  readonly canWrite: boolean;
  readonly onChanged: () => void;
  readonly onError: (message: string | null) => void;
}) {
  const update = useAtomCommand(subagentUpdate, { reportFailure: false });
  const [saving, setSaving] = useState(false);
  const { entry, environmentId } = props;

  if (!props.canWrite || environmentId === null) {
    return entry.model === null ? "Not set" : modelDisplayName(entry.model);
  }

  const save = async (model: string) => {
    if (saving) return;
    setSaving(true);
    props.onError(null);
    const result = await update({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        specPath: entry.specPath,
        patch: { model: model === "" ? null : model },
      },
    });
    setSaving(false);
    if (result._tag === "Success") return props.onChanged();
    if (isAtomCommandInterrupted(result)) return;
    props.onError(
      writeFailureMessage(squashAtomCommandFailure(result), "The model did not save. Try again."),
    );
  };

  return (
    <ModelSelect
      value={entry.model ?? ""}
      unsetLabel="Not set (follows the app default)"
      disabled={saving}
      className="w-full max-w-xs"
      aria-label="Model"
      onChange={(model) => void save(model)}
    />
  );
}
