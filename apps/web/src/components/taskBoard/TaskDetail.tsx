import type {
  TaskBoardHistoryEntry,
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
} from "@t3tools/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  RotateCcwIcon,
  SparklesIcon,
  UserCheckIcon,
  UserMinusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { ownerOf, ownerPickerItems, ownerPickerValue } from "./owner.logic";
import { taskPrivateArea } from "./privateArea.logic";
import { lazy, memo, Suspense, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { MiddleTruncate } from "~/components/ui/middle-truncate";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { DictationTextarea } from "~/components/voice/DictationTextarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { ChecklistBar, PriorityBadge, StatusBadge } from "./TaskBadges";
import { Fold } from "./Fold";
import { TaskHistory } from "./TaskHistory";
import { PresenceChips } from "./TaskPresence";
import {
  formatDue,
  priorityLabel,
  relativeTime,
  splitDoneWhen,
  statusLabel,
  type TaskView,
} from "./taskBoard.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";

// Markdown is a large module; load it only when a task with a description is opened.
const ChatMarkdown = lazy(() => import("~/components/ChatMarkdown"));

const DESCRIPTION_COLLAPSE_AFTER = 600;
const NO_PROJECT_VALUE = "__no-project__";

const EDITABLE_STATUSES: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "parked",
];
const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["critical", "high", "medium", "low"];
const ANYONE_VALUE = "__anyone__";
const PUBLIC_VALUE = "__public__";

const HISTORY_VERBS: Record<TaskBoardHistoryEntry["action"], string> = {
  created: "created this",
  claimed: "took this",
  released: "gave this back",
  updated: "updated this",
  blocked: "marked this blocked",
  completed: "completed this",
  reopened: "reopened this",
  imported: "imported this",
  progress: "reported progress",
};

type ActionKey = "send" | "claim" | "review" | "complete" | "reopen";

function sameName(a: string | null | undefined, b: string): boolean {
  return a != null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function issueLabel(url: string): string {
  const match = /\/issues\/(\d+)/.exec(url);
  return match ? `GitHub issue #${match[1]}` : "GitHub issue";
}

function Section(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={props.title}>
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function Property(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs">{props.label}</dt>
      <dd className="min-w-0 text-sm">{props.children}</dd>
    </>
  );
}

function PlainText(props: { readonly text: string }) {
  return <p className="whitespace-pre-wrap text-sm wrap-anywhere text-foreground">{props.text}</p>;
}

function Description(props: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = props.text.length > DESCRIPTION_COLLAPSE_AFTER;
  const collapsed = long && !expanded;
  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={
          collapsed
            ? "max-h-40 w-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
            : "w-full"
        }
      >
        <Suspense fallback={<PlainText text={props.text} />}>
          <ChatMarkdown text={props.text} cwd={undefined} className="text-sm" />
        </Suspense>
      </div>
      {long ? (
        <Button
          variant="ghost-muted"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDownIcon className={expanded ? "rotate-180" : undefined} />
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function Source(props: { readonly task: TaskView }) {
  const { task } = props;
  if (task.sourceFile) {
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs">
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <MiddleTruncate value={task.sourceFile} />
      </span>
    );
  }
  if (task.issueUrl) {
    return (
      <a
        href={task.issueUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-foreground text-sm underline-offset-2 hover:underline"
      >
        {issueLabel(task.issueUrl)}
        <ExternalLinkIcon className="size-3.5 text-muted-foreground" aria-hidden />
      </a>
    );
  }
  return <span>Shared board</span>;
}

function TaskDetailBody(props: {
  readonly task: TaskView;
  readonly context: TaskContext;
  readonly actions: TaskActions;
  readonly onClose: () => void;
}) {
  const { task, context, actions, onClose } = props;
  const [note, setNote] = useState("");
  const [pressed, setPressed] = useState<ActionKey | null>(null);
  const [showRuns, setShowRuns] = useState(false);

  const busy = actions.isBusy(task.id);
  const closed = task.status === "done" || task.status === "parked" || task.status === "retired";
  const mine = sameName(task.claimedBy, context.member);
  const owner = ownerOf(task, context.team);
  const ownerItems = ownerPickerItems(context.team, owner).concat({
    value: ANYONE_VALUE,
    label: "Anyone (available to take)",
  });
  const ownerValue = ownerPickerValue(context.team, owner);
  const privateArea = taskPrivateArea(task);
  const privateItems = [
    { value: PUBLIC_VALUE, label: "No (every Member reads it)" },
    ...context.areas.map((area) => ({ value: area.slug, label: `Private in ${area.name}` })),
    ...(privateArea && !context.areas.some((area) => area.slug === privateArea)
      ? [{ value: privateArea, label: `Private in ${privateArea}` }]
      : []),
  ];
  const canSend = actions.canSendToAgent(task);
  const canShare = actions.canShare(task);
  const linkedSlug = task.section === "general" ? null : task.section;
  const projectName =
    context.projects.find((project) => project.slug === task.section)?.name ?? task.project;
  const dueText = formatDue(task.due, context.now);
  const agent = task.claimedAgent;

  const history = useMemo(
    () => task.history.toSorted((a, b) => b.timestamp - a.timestamp),
    [task.history],
  );
  const body = useMemo(() => splitDoneWhen(task.description), [task.description]);

  const statusItems = useMemo(
    () =>
      (EDITABLE_STATUSES.includes(task.status)
        ? EDITABLE_STATUSES
        : [...EDITABLE_STATUSES, task.status]
      ).map((status) => ({ value: status, label: statusLabel(status) })),
    [task.status],
  );
  const priorityItems = useMemo(
    () => PRIORITIES.map((priority) => ({ value: priority, label: priorityLabel(priority) })),
    [],
  );
  const projectItems = useMemo(() => {
    const items = [
      { value: NO_PROJECT_VALUE, label: "No project" },
      ...context.projects.map((project) => ({ value: project.slug, label: project.name })),
    ];
    if (linkedSlug !== null && !items.some((item) => item.value === linkedSlug)) {
      items.push({ value: linkedSlug, label: task.project });
    }
    return items;
  }, [context.projects, linkedSlug, task.project]);

  const run = (key: ActionKey, action: () => void) => {
    setPressed(key);
    action();
  };
  const spinnerFor = (key: ActionKey) => busy && pressed === key;

  const submitNote = () => {
    const text = note.trim();
    if (text.length === 0 || busy) return;
    actions.addNote(task, text);
    setNote("");
  };
  // A typed note goes with the completion in one write, so closing with a note is one step.
  const complete = () =>
    run("complete", () => {
      actions.setStatus(task, "done", note.trim() || undefined);
      setNote("");
    });
  const onNoteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitNote();
    }
  };

  const sendButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || !canSend}
      onClick={() => run("send", () => actions.sendToAgent(task))}
    >
      {spinnerFor("send") ? <Spinner /> : <SparklesIcon />}
      Draft AI chat
    </Button>
  );

  return (
    <section
      aria-label={`Task ${task.title}`}
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="font-semibold text-base leading-snug wrap-anywhere">{task.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
            <PresenceChips taskId={task.id} />
          </div>
          <Button variant="ghost-muted" size="icon-sm" aria-label="Close task" onClick={onClose}>
            <XIcon />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => run("reopen", () => actions.setStatus(task, "todo"))}
            >
              {spinnerFor("reopen") ? <Spinner /> : <RotateCcwIcon />}
              Reopen
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={complete}>
                {spinnerFor("complete") ? <Spinner /> : <CheckIcon />}
                Complete
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run("claim", () => (mine ? actions.release(task) : actions.claim(task)))
                }
              >
                {spinnerFor("claim") ? <Spinner /> : mine ? <UserMinusIcon /> : <UserCheckIcon />}
                {mine ? "Give back" : "Take"}
              </Button>
              {task.status !== "review" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => run("review", () => actions.setStatus(task, "review"))}
                >
                  {spinnerFor("review") ? <Spinner /> : <EyeIcon />}
                  Mark in review
                </Button>
              ) : null}
            </>
          )}
          {canSend ? (
            sendButton
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
                {sendButton}
              </TooltipTrigger>
              <TooltipPopup>
                Link this task to a project on this computer to send it to the AI.
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <Property label="Status">
            <Select
              value={task.status}
              items={statusItems}
              onValueChange={(value) => {
                if (value && value !== task.status) {
                  actions.setStatus(task, value as TaskBoardTaskStatus);
                }
              }}
            >
              <SelectTrigger size="sm" aria-label="Status" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Property>
          <Property label="Priority">
            <Select
              value={task.priority}
              items={priorityItems}
              onValueChange={(value) => {
                if (value && value !== task.priority) {
                  actions.setPriority(task, value as TaskBoardTaskPriority);
                }
              }}
            >
              <SelectTrigger size="sm" aria-label="Priority" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {priorityItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Property>
          <Property label="Due">
            <div className="flex flex-col gap-1">
              <Input
                key={`${task.id}:${task.due ?? ""}`}
                type="date"
                aria-label="Due date"
                defaultValue={task.due ?? ""}
                disabled={busy || !actions.canEdit}
                onBlur={(event) => {
                  const due = event.target.value || null;
                  if (event.target.validity.valid && due !== (task.due ?? null))
                    actions.setDue(task, due);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              {dueText ? (
                <span
                  className={dueText.startsWith("Overdue") ? "text-destructive-foreground" : ""}
                >
                  {dueText}
                  <span className="text-muted-foreground"> · {task.due}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">No due date</span>
              )}
            </div>
          </Property>
          {task.labels.length > 0 ? (
            <Property label="Labels">
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            </Property>
          ) : null}
        </dl>

        {body.gates || task.checklist?.total ? (
          <Section title="Done when">
            <ChecklistBar checklist={task.checklist} />
            {body.gates ? (
              <Suspense fallback={<PlainText text={body.gates} />}>
                <ChatMarkdown text={body.gates} cwd={undefined} className="text-sm" />
              </Suspense>
            ) : null}
          </Section>
        ) : null}

        <Section title="Note">
          <div className="flex flex-col gap-2">
            <DictationTextarea
              size="sm"
              aria-label="Add a note"
              placeholder="Add a note. Complete saves it too."
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={onNoteKeyDown}
            />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || note.trim().length === 0}
                onClick={submitNote}
              >
                Add note
              </Button>
            </div>
          </div>
        </Section>

        {body.rest.length > 0 ? (
          <Section title="Description">
            <Description key={task.id} text={body.rest} />
          </Section>
        ) : null}

        {task.completionSummary?.trim() ? (
          <Section title="Completion summary">
            <PlainText text={task.completionSummary} />
          </Section>
        ) : null}

        {task.verify?.trim() ? (
          <Section title="Verify with">
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-2 font-mono text-xs wrap-anywhere">
              {task.verify}
            </pre>
          </Section>
        ) : null}

        {task.startFiles && task.startFiles.length > 0 ? (
          <Section title="Start with these files">
            <ul className="flex flex-col gap-1">
              {task.startFiles.map((file) => (
                <li key={file} className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <MiddleTruncate value={file} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {task.blockedBy && task.blockedBy.length > 0 ? (
          <Section title="Blocked by">
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm marker:text-muted-foreground">
              {task.blockedBy.map((item) => (
                <li key={item} className="wrap-anywhere">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Fold title="More details">
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <Property label="Linked project">
              <Select
                value={linkedSlug ?? NO_PROJECT_VALUE}
                items={projectItems}
                onValueChange={(value) => {
                  if (!value) return;
                  const next = value === NO_PROJECT_VALUE ? null : value;
                  if (next !== linkedSlug) actions.linkProject(task, next);
                }}
              >
                <SelectTrigger size="sm" aria-label="Linked project" disabled={busy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {projectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Property>
            <Property label="Owner">
              <Select
                value={ownerValue ?? ANYONE_VALUE}
                items={ownerItems}
                onValueChange={(value) => {
                  if (!value) return;
                  const next = value === ANYONE_VALUE ? null : value;
                  if (next !== ownerValue) actions.setAssignee(task, next);
                }}
              >
                <SelectTrigger size="sm" aria-label="Owner" disabled={busy || !actions.canEdit}>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {ownerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Property>
            {context.areas.length > 0 || privateArea ? (
              <Property label="Private">
                <Select
                  value={privateArea ?? PUBLIC_VALUE}
                  items={privateItems}
                  onValueChange={(value) => {
                    if (!value) return;
                    const next = value === PUBLIC_VALUE ? null : value;
                    if (next !== privateArea) actions.setPrivateArea(task, next);
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Private" disabled={busy || !actions.canEdit}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {privateItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Property>
            ) : null}
            <Property label="Taken by">
              {task.claimedBy ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="wrap-anywhere">
                    {task.claimedBy}
                    {task.claimedAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {relativeTime(task.claimedAt, context.now)}
                      </span>
                    ) : null}
                  </span>
                  {agent ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground text-xs">
                      {agent.providerInstanceId ? <span>{agent.providerInstanceId}</span> : null}
                      {agent.model ? <span className="font-mono">{agent.model}</span> : null}
                      {agent.threadId ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          chat
                          <MiddleTruncate value={agent.threadId} />
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground">Nobody yet</span>
              )}
            </Property>
            <Property label="Milestone">
              <Input
                key={`${task.id}:${task.milestone ?? ""}`}
                aria-label="Version milestone"
                placeholder="0.22.0 (empty to unassign)"
                pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
                title="Use a version such as 0.22.0 or 1.0.0"
                defaultValue={task.milestone ?? ""}
                disabled={busy || !actions.canEdit}
                onBlur={(event) => {
                  const milestone = event.target.value || null;
                  if (event.target.reportValidity() && milestone !== (task.milestone ?? null))
                    actions.setMilestone(task, milestone);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </Property>
            <Property label="Effort">
              {task.effort ? task.effort : <span className="text-muted-foreground">Not set</span>}
            </Property>
            <Property label="Energy">
              {task.energy ? task.energy : <span className="text-muted-foreground">Not set</span>}
            </Property>
            <Property label="Created">
              <time dateTime={new Date(task.createdAt).toISOString()}>
                {relativeTime(task.createdAt, context.now)}
              </time>
            </Property>
            <Property label="Updated">
              <time dateTime={new Date(task.updatedAt).toISOString()}>
                {relativeTime(task.updatedAt, context.now)}
              </time>
            </Property>
            <Property label="Source">
              <Source task={task} />
            </Property>
          </dl>
          <Section title="Share with collaborators">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium text-sm">
                  <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
                  {task.shared ? "Shared" : "Not shared"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {!canShare && !task.shared
                    ? "Link this task to a project with a GitHub repository to share it."
                    : task.shared
                      ? `Shared${task.sharedBy ? ` by ${task.sharedBy}` : ""} · visible to everyone on ${projectName}`
                      : `Publish this task so everyone on ${projectName} can see it.`}
                </span>
                {task.shared && task.sharedSync ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={task.sharedSync === "failed" ? "error" : "warning"}>
                      {task.sharedSync === "failed" ? "Latest edit not shared" : "Share pending"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={busy || !canShare}
                      onClick={() => actions.setShared(task, true)}
                    >
                      {busy ? <Spinner /> : <RotateCcwIcon />}
                      Retry
                    </Button>
                  </div>
                ) : null}
              </div>
              <Switch
                aria-label="Share with collaborators"
                checked={task.shared === true}
                disabled={busy || (!canShare && task.shared !== true)}
                onCheckedChange={(checked) => actions.setShared(task, checked)}
              />
            </div>
          </Section>
        </Fold>
        <Fold title={`Activity (${history.length})`}>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-xs">No activity yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 border-border border-l-2 pl-3">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                    <span className="font-medium">{entry.actor}</span>
                    <span className="text-muted-foreground">{HISTORY_VERBS[entry.action]}</span>
                    {entry.agent?.model ? (
                      <Badge variant="secondary" size="sm">
                        {entry.agent.model}
                      </Badge>
                    ) : null}
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={new Date(entry.timestamp).toISOString()}
                    >
                      {relativeTime(entry.timestamp, context.now)}
                    </time>
                  </div>
                  {entry.note?.trim() ? <PlainText text={entry.note.trim()} /> : null}
                </li>
              ))}
            </ol>
          )}
        </Fold>
        <Fold title="Runs" onToggle={setShowRuns}>
          {showRuns ? <TaskHistory taskId={task.id} /> : null}
        </Fold>
      </div>
    </section>
  );
}

/** The single place to read and drive one task: properties, sharing, description, activity. */
export const TaskDetailPanel = memo(function TaskDetailPanel(props: {
  readonly task: TaskView;
  readonly context: TaskContext;
  readonly actions: TaskActions;
  readonly onClose: () => void;
}) {
  // Keyed so the note draft, spinner and description expansion never leak between tasks.
  return <TaskDetailBody key={props.task.id} {...props} />;
});
