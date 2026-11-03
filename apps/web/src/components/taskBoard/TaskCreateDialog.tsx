import {
  squashAtomCommandFailure,
  isAtomCommandInterrupted,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  TaskBoardTaskPriority,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAtomValue } from "@effect/atom-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { taskBoardCardCreate } from "~/state/taskBoard";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";

import { priorityLabel } from "./taskBoard.logic";
import { failureText } from "./useTaskActions.logic";
import { taskProjectSlug } from "./tasksPage.logic";

const NO_PROJECT = "__no-project__";
const NEW_PROJECT = "__new-project__";
const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["low", "medium", "high", "critical"];
const PRIORITY_ITEMS = Object.fromEntries(
  PRIORITIES.map((priority) => [priority, priorityLabel(priority)]),
);

/** Captures a native task. The form resets every time the dialog opens. */
export function TaskCreateDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  readonly projects: ReadonlyArray<TaskBoardWorkspaceProject>;
  /** The project section selected on the page; preselected in the form. */
  readonly defaultSlug: string | null;
  readonly onCreated: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup>
        <TaskCreateForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function TaskCreateForm(props: {
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  readonly projects: ReadonlyArray<TaskBoardWorkspaceProject>;
  readonly defaultSlug: string | null;
  readonly onCreated: () => void;
}) {
  const { environmentId, member, projects, onCreated, onOpenChange } = props;
  const id = useId();
  const runCreate = useAtomCommand(taskBoardCardCreate, { reportFailure: false });
  const canCreate = useAtomValue(taskBoardCardCreate.permissionAtom(environmentId));
  const projectItems = useMemo(
    () => ({
      [NO_PROJECT]: "Inbox",
      ...Object.fromEntries(
        projects.filter((project) => project.slug !== "general").map((p) => [p.slug, p.name]),
      ),
      [NEW_PROJECT]: "New project…",
    }),
    [projects],
  );
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState("");
  const [milestone, setMilestone] = useState("");
  const [priority, setPriority] = useState<TaskBoardTaskPriority>("medium");
  const [projectSlug, setProjectSlug] = useState(
    props.defaultSlug && props.defaultSlug in projectItems ? props.defaultSlug : NO_PROJECT,
  );
  const [submitting, setSubmitting] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const newSlug = taskProjectSlug(newProject);
  const canSubmit =
    title.trim().length > 0 &&
    environmentId !== null &&
    canCreate &&
    !submitting &&
    (projectSlug !== NEW_PROJECT || (newSlug.length > 0 && newSlug !== "general"));

  const submit = async () => {
    if (!canSubmit || environmentId === null) return;
    setSubmitting(true);
    setError(null);
    const result = await runCreate({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        title: title.trim(),
        ...(details.trim() ? { description: details.trim() } : {}),
        priority,
        due: due || null,
        milestone: milestone || null,
        projectSlug:
          projectSlug === NO_PROJECT ? null : projectSlug === NEW_PROJECT ? newSlug : projectSlug,
        actor: member,
      },
    });
    setSubmitting(false);
    if (result._tag === "Success") {
      onCreated();
      onOpenChange(false);
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      setError(
        failureText(squashAtomCommandFailure(result), "Could not create the task. Try again."),
      );
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (event.currentTarget.reportValidity()) void submit();
    }
  };

  return (
    <form className="contents" onSubmit={onSubmit} onKeyDown={onKeyDown}>
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription>
          Add work for yourself or your AI. Press Ctrl+Enter to create it.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-title`}>
            Title
            <Input
              id={`${id}-title`}
              autoFocus
              placeholder="What needs doing?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-details`}>
            Details
            <Textarea
              id={`${id}-details`}
              placeholder="Context and what done looks like (optional)"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </Label>
          {/* Fields people set most come first; the version is optional and set least. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-priority`}>
              Priority
              <Select
                value={priority}
                items={PRIORITY_ITEMS}
                onValueChange={(value) => {
                  if (PRIORITIES.includes(value as TaskBoardTaskPriority)) {
                    setPriority(value as TaskBoardTaskPriority);
                  }
                }}
              >
                <SelectTrigger id={`${id}-priority`} className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {priorityLabel(value)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Label>
            <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-project`}>
              Project
              <Select
                value={projectSlug}
                items={projectItems}
                onValueChange={(value) => {
                  if (typeof value === "string") setProjectSlug(value);
                }}
              >
                <SelectTrigger id={`${id}-project`} className="min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {Object.entries(projectItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Label>
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-due`}>
              Due date
              <Input
                id={`${id}-due`}
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </Label>
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-milestone`}>
              Version milestone
              <Input
                id={`${id}-milestone`}
                placeholder="Optional, such as 1.0.0"
                value={milestone}
                pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
                title="Use a version such as 0.22.0 or 1.0.0"
                onChange={(event) => setMilestone(event.target.value)}
              />
            </Label>
          </div>
          {projectSlug === NEW_PROJECT ? (
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-new-project`}>
              Project name
              <Input
                id={`${id}-new-project`}
                placeholder="Weekly planning"
                maxLength={80}
                value={newProject}
                onChange={(event) => setNewProject(event.target.value)}
              />
            </Label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? <Spinner /> : null}
          Create task
        </Button>
      </DialogFooter>
    </form>
  );
}
