import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "~/components/ui/number-field";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { taskBoardCapSet } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

import { capFormProblem, capLowerNote, DEFAULT_CAP, DEFAULT_WARN } from "./capEditor.logic";
import { failureText } from "./useTaskActions.logic";

export function LimitField(props: {
  readonly label: string;
  readonly value: number | null;
  readonly disabled: boolean;
  readonly hideLabel?: boolean;
  readonly onChange: (value: number | null) => void;
  /** Set where leaving the field saves it. */
  readonly onCommit?: (value: number | null) => void;
}) {
  const { label, onCommit } = props;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {props.hideLabel ? null : (
        <span aria-hidden className="text-xs text-muted-foreground">
          {label}
        </span>
      )}
      <NumberField
        size="sm"
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
        onValueCommitted={onCommit}
      >
        <NumberFieldGroup>
          <NumberFieldDecrement aria-label={`Decrease ${label.toLowerCase()}`} />
          <NumberFieldInput
            aria-label={label}
            // Enter leaves the field, which commits it like a click elsewhere does.
            onKeyDown={
              onCommit ? (event) => event.key === "Enter" && event.currentTarget.blur() : undefined
            }
          />
          <NumberFieldIncrement aria-label={`Increase ${label.toLowerCase()}`} />
        </NumberFieldGroup>
      </NumberField>
    </div>
  );
}

/**
 * Sets one project's open-task limit and warning. The rail popover and the Settings page both
 * render this, so there is one form and one write path (`taskBoard.capSet`).
 */
export function CapEditor(props: {
  readonly environmentId: EnvironmentId | null;
  readonly projectSlug: string;
  /** The saved limit and warning. */
  readonly cap: number;
  readonly warn: number;
  readonly open: number;
  /** "button": the Save button (or Enter) saves. "commit": leaving a field or Enter saves. */
  readonly saveOn: "button" | "commit";
  /** Runs after a save, so the board reads the new numbers. */
  readonly onSaved: () => void;
}) {
  const { environmentId, projectSlug, saveOn, onSaved } = props;
  const run = useAtomCommand(taskBoardCapSet, { reportFailure: false });
  const [cap, setCap] = useState<number | null>(props.cap);
  const [warn, setWarn] = useState<number | null>(props.warn);
  const [seen, setSeen] = useState({ cap: props.cap, warn: props.warn });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new saved value (this editor's own save, or a change from elsewhere) replaces the drafts.
  if (seen.cap !== props.cap || seen.warn !== props.warn) {
    setSeen({ cap: props.cap, warn: props.warn });
    setCap(props.cap);
    setWarn(props.warn);
  }

  const save = async (nextCap: number | null, nextWarn: number | null) => {
    const problem = capFormProblem(nextCap, nextWarn);
    if (problem !== null || nextCap === null || nextWarn === null) {
      setError(problem);
      return;
    }
    setError(null);
    if (environmentId === null || busy) return;
    if (nextCap === props.cap && nextWarn === props.warn) return;
    setBusy(true);
    const result = await run({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        projectSlug,
        cap: nextCap,
        warn: nextWarn,
      },
    });
    setBusy(false);
    if (result._tag !== "Success") {
      if (!isAtomCommandInterrupted(result)) {
        setError(
          failureText(squashAtomCommandFailure(result), "The limit was not saved. Try again."),
        );
      }
      return;
    }
    onSaved();
  };

  const reset = () => {
    setCap(DEFAULT_CAP);
    setWarn(DEFAULT_WARN);
    void save(DEFAULT_CAP, DEFAULT_WARN);
  };
  const commits = saveOn === "commit";
  const note = error ?? capLowerNote(cap, props.open);
  const form = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <LimitField
          label="Limit"
          value={cap}
          disabled={busy}
          onChange={setCap}
          {...(commits ? { onCommit: (value: number | null) => void save(value, warn) } : {})}
        />
        <LimitField
          label="Warn at"
          value={warn}
          disabled={busy}
          onChange={setWarn}
          {...(commits ? { onCommit: (value: number | null) => void save(cap, value) } : {})}
        />
      </div>
      {note !== null ? (
        <p
          role={error === null ? undefined : "alert"}
          className={`text-xs ${error === null ? "text-warning-foreground" : "text-destructive-foreground"}`}
        >
          {note}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="xs"
          variant="ghost-muted"
          disabled={busy || (props.cap === DEFAULT_CAP && props.warn === DEFAULT_WARN)}
          onClick={reset}
        >
          Reset to default
        </Button>
        {commits ? null : (
          <Button
            type="submit"
            size="xs"
            disabled={busy || (cap === props.cap && warn === props.warn)}
          >
            Save
          </Button>
        )}
      </div>
    </>
  );

  return commits ? (
    <div className="flex w-full max-w-xs flex-col gap-2">{form}</div>
  ) : (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save(cap, warn);
      }}
    >
      {form}
    </form>
  );
}
