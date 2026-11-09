import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { failureText } from "~/components/taskBoard/useTaskActions.logic";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { voiceLimitSet } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

export function VoiceLimitEditor({
  environmentId,
  seconds,
  onSaved,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly seconds: number;
  readonly onSaved: () => void;
}) {
  const run = useAtomCommand(voiceLimitSet, { reportFailure: false });
  const canEdit = useAtomValue(voiceLimitSet.permissionAtom(environmentId));
  const [value, setValue] = useState(String(seconds));
  const [seen, setSeen] = useState(seconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (seen !== seconds) {
    setSeen(seconds);
    setValue(String(seconds));
  }
  const save = async (text: string) => {
    const next = Number(text);
    if (!text.trim() || !Number.isFinite(next) || next < 0 || next > 86400) {
      setError("Enter a number from 0 to 86400 seconds.");
      return;
    }
    setError(null);
    if (environmentId === null || !canEdit || busy || next === seconds) return;
    setBusy(true);
    const result = await run({ environmentId, input: { seconds: next } });
    setBusy(false);
    if (result._tag !== "Success") {
      if (!isAtomCommandInterrupted(result))
        setError(
          failureText(
            squashAtomCommandFailure(result),
            "The voice throttle was not saved. Try again.",
          ),
        );
      return;
    }
    onSaved();
  };
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Input
        type="number"
        step="any"
        min={0}
        max={86400}
        aria-label="Voice throttle"
        value={value}
        disabled={busy || !canEdit}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={() => void save(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
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
        disabled={busy || !canEdit || seconds === 600}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setValue("600");
          void save("600");
        }}
      >
        Reset to default
      </Button>
    </div>
  );
}
