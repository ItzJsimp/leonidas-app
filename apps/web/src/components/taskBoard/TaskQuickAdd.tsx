import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useState, type FormEvent } from "react";

import { Input } from "~/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Kbd } from "~/components/ui/kbd";
import { taskBoardCardCreate } from "~/state/taskBoard";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { failureText } from "./useTaskActions.logic";

/** Enter captures a task in the current project; execution remains an explicit action. */
export function TaskQuickAdd(props: {
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  readonly projectSlug: string | null;
  readonly defaultDue: string;
  readonly onCreated: () => void;
}) {
  const runCreate = useAtomCommand(taskBoardCardCreate, { reportFailure: false });
  const canCreate = useAtomValue(taskBoardCardCreate.permissionAtom(props.environmentId));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(props.defaultDue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !props.environmentId || !canCreate || busy) return;
    setBusy(true);
    setError(null);
    setReceipt("");
    const result = await runCreate({
      environmentId: props.environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(props.environmentId)),
        title: title.trim(),
        due: due || null,
        projectSlug: props.projectSlug,
        actor: props.member,
      },
    });
    setBusy(false);
    if (result._tag === "Success") {
      setReceipt(`Added ${title.trim()}`);
      setTitle("");
      props.onCreated();
    } else if (!isAtomCommandInterrupted(result)) {
      setError(failureText(squashAtomCommandFailure(result), "Could not add the task. Try again."));
    }
  };

  return (
    <form
      data-tour="tasks-quick-add"
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-2 border-b border-border px-3 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-40 flex-1">
          <InputGroupInput
            size="sm"
            aria-label="Quick add task"
            aria-keyshortcuts="n"
            data-tasks-quick-add
            placeholder="Add a task, then press Enter"
            maxLength={256}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            // Two fields and no submit button: the browser does not submit on Enter by itself.
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
          />
          {title ? null : (
            <InputGroupAddon align="inline-end" className="max-sm:hidden">
              <Kbd>N</Kbd>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="w-36">
          <Input
            size="sm"
            aria-label="Quick add due date"
            type="date"
            value={due}
            disabled={busy}
            onChange={(event) => setDue(event.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <span role="status" className="sr-only">
        {receipt}
      </span>
    </form>
  );
}
