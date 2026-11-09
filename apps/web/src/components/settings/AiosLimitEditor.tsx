import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { AiosLimit, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { LimitField } from "~/components/taskBoard/CapEditor";
import { failureText } from "~/components/taskBoard/useTaskActions.logic";
import { Button } from "~/components/ui/button";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { aiosLimitSet } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

export function AiosLimitEditor({
  environmentId,
  limit,
  onSaved,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly limit: AiosLimit;
  readonly onSaved: () => void;
}) {
  const run = useAtomCommand(aiosLimitSet, { reportFailure: false });
  const canEdit = useAtomValue(aiosLimitSet.permissionAtom(environmentId));
  const [value, setValue] = useState<number | null>(limit.value);
  const [seen, setSeen] = useState(limit.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (seen !== limit.value) {
    setSeen(limit.value);
    setValue(limit.value);
  }

  const save = async (next: number | null) => {
    if (next === null || !Number.isSafeInteger(next) || next < limit.min || next > limit.max) {
      setError(`Enter a whole number from ${limit.min} to ${limit.max}.`);
      return;
    }
    setError(null);
    if (environmentId === null || !canEdit || busy || next === limit.value) return;
    setBusy(true);
    const result = await run({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        id: limit.id,
        value: next,
      },
    });
    setBusy(false);
    if (result._tag !== "Success") {
      if (!isAtomCommandInterrupted(result))
        setError(
          failureText(squashAtomCommandFailure(result), "The limit was not saved. Try again."),
        );
      return;
    }
    onSaved();
  };
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <LimitField
        label={limit.label}
        hideLabel
        value={value}
        disabled={busy || !canEdit}
        onChange={setValue}
        onCommit={(next) => void save(next)}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="xs"
        variant="ghost-muted"
        disabled={busy || !canEdit || limit.value === limit.default}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setValue(limit.default);
          void save(limit.default);
        }}
      >
        Reset to default
      </Button>
    </div>
  );
}
