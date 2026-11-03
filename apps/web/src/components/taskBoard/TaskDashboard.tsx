import type { TaskBoardTaskPriority } from "@t3tools/contracts";
import {
  ChartColumnIcon,
  FolderIcon,
  HistoryIcon,
  ListChecksIcon,
  PlusIcon,
  SendIcon,
  TagsIcon,
  ZapIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  formatDue,
  isOpen,
  priorityLabel,
  pickQuickBatches,
  suggestTriage,
  relativeTime,
  sortTasks,
  type TaskDashboard,
  type TaskView,
} from "./taskBoard.logic";
import { FocusSection } from "./FocusSection";
import type { FocusList } from "./tasksPage.logic";
import type { TaskActions, TaskContext } from "./taskBoard.types";

const DAY_MS = 86_400_000;
const GENERAL_SECTION = "general";
const MAX_SECTIONS = 8;
const MAX_ATTENTION = 8;

const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["critical", "high", "medium", "low"];

const PRIORITY_BAR_CLASS: Record<TaskBoardTaskPriority, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-info",
  low: "bg-muted-foreground/40",
};

export type TaskDashboardViewProps = {
  readonly dashboard: TaskDashboard;
  readonly tasks: ReadonlyArray<TaskView>;
  readonly context: TaskContext;
  readonly actions: TaskActions;
  readonly onSelect: (task: TaskView) => void;
  readonly onOpenSection: (slug: string) => void;
  readonly onCreate: () => void;
  /** A Focus count tile opens its list in the Table. */
  readonly onOpenList: (list: FocusList) => void;
};

type SectionNames = ReadonlyMap<string, string>;

function sectionName(names: SectionNames, slug: string): string {
  return names.get(slug) ?? slug;
}

function Panel(props: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly meta?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card ${props.className ?? ""}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span aria-hidden className="text-muted-foreground [&_svg]:size-4">
          {props.icon}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{props.title}</h2>
        {props.meta ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{props.meta}</span>
        ) : null}
      </header>
      {props.children}
    </section>
  );
}

function PanelEmpty({ children }: { readonly children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function MoreHint({ count, noun }: { readonly count: number; readonly noun: string }) {
  if (count <= 0) return null;
  return (
    <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      +{count} more {noun}
    </p>
  );
}

function Kpi(props: {
  readonly label: string;
  readonly value: number;
  readonly dot: string;
  readonly danger?: boolean;
  readonly className?: string;
}) {
  const alarming = props.danger === true && props.value > 0;
  return (
    <div
      className={`min-w-0 rounded-xl border border-border bg-card px-4 py-3 ${props.className ?? ""}`}
    >
      <p
        className={`text-3xl font-semibold leading-none tracking-tight tabular-nums ${alarming ? "text-destructive" : "text-foreground"}`}
      >
        {props.value}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${props.dot}`} />
        <span className="truncate">{props.label}</span>
      </p>
    </div>
  );
}

const KpiStrip = memo(function KpiStrip({ dashboard }: { readonly dashboard: TaskDashboard }) {
  const secondary: Array<{ text: string; danger?: boolean }> = [];
  if (dashboard.overdue > 0) secondary.push({ text: `${dashboard.overdue} overdue`, danger: true });
  secondary.push({ text: `${dashboard.dueSoon} due within a week` });
  secondary.push({ text: `${dashboard.mine} mine` });
  secondary.push({ text: `${dashboard.unassigned} unassigned` });
  if (dashboard.sharedOpen > 0) secondary.push({ text: `${dashboard.sharedOpen} shared` });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-5">
        <Kpi label="Open" value={dashboard.open} dot="bg-muted-foreground/60" />
        <Kpi label="In progress" value={dashboard.inProgress} dot="bg-info" />
        <Kpi label="In review" value={dashboard.review} dot="bg-warning" />
        <Kpi label="Blocked" value={dashboard.blocked} dot="bg-destructive" danger />
        <Kpi
          label="Done this week"
          value={dashboard.doneThisWeek}
          dot="bg-success"
          className="col-span-2 @xl:col-span-1"
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground tabular-nums">
        {secondary.map((item) => (
          <span key={item.text} className={item.danger ? "font-medium text-destructive" : ""}>
            {item.text}
          </span>
        ))}
      </p>
    </div>
  );
});

const QuickBatchPanel = memo(function QuickBatchPanel(props: {
  readonly tasks: ReadonlyArray<TaskView>;
  readonly names: SectionNames;
  readonly actions: TaskActions;
  readonly className?: string;
}) {
  const batches = useMemo(() => pickQuickBatches(props.tasks), [props.tasks]);
  if (batches.length === 0) return null;
  return (
    <Panel
      title="Quick wins"
      icon={<ZapIcon />}
      meta="Small tasks, one chat"
      {...(props.className ? { className: props.className } : {})}
    >
      <ul className="divide-y divide-border">
        {batches.slice(0, 4).map((batch) => {
          const busy = batch.tasks.some((task) => props.actions.isBusy(task.id));
          const canSend = props.actions.canSendToAgent(batch.tasks[0]!);
          return (
            <li
              key={`${batch.section}:${batch.tasks[0]!.id}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {batch.tasks.length} tasks · {sectionName(props.names, batch.section)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {batch.tasks.map((task) => task.title).join(" · ")}
                </span>
              </span>
              {canSend ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => props.actions.sendBatchToAgent(batch.tasks)}
                >
                  <SendIcon />
                  Send all to one chat
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
});

const OrganizePanel = memo(function OrganizePanel(props: {
  readonly tasks: ReadonlyArray<TaskView>;
  readonly actions: TaskActions;
  readonly className?: string;
}) {
  const changes = useMemo(
    () =>
      props.tasks.flatMap((task) => {
        const suggestion = isOpen(task) ? suggestTriage(task) : null;
        return suggestion ? [{ task, suggestion }] : [];
      }),
    [props.tasks],
  );
  if (changes.length === 0 || !props.actions.canEdit) return null;
  const busy = changes.some(({ task }) => props.actions.isBusy(task.id));
  return (
    <Panel
      title="Organize"
      icon={<TagsIcon />}
      meta={`${changes.length} to sort`}
      {...(props.className ? { className: props.className } : {})}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {changes.length} open {changes.length === 1 ? "task has" : "tasks have"} no effort or
          topic labels. Leonidas can fill them in from the title, description and checklist of each
          task.
        </p>
        <Button size="sm" disabled={busy} onClick={() => props.actions.organize(changes)}>
          <TagsIcon />
          Organize
        </Button>
      </div>
    </Panel>
  );
});

function formatDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const ThroughputPanel = memo(function ThroughputPanel(props: {
  readonly days: TaskDashboard["completionsPerDay"];
  readonly className?: string;
}) {
  const total = props.days.reduce((sum, entry) => sum + entry.count, 0);
  const peak = props.days.reduce((max, entry) => Math.max(max, entry.count), 0);
  const first = props.days[0];
  const lastIndex = props.days.length - 1;
  return (
    <Panel
      title="Throughput"
      icon={<ChartColumnIcon />}
      meta="Last 14 days"
      {...(props.className ? { className: props.className } : {})}
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
            {total}
          </span>
          <span className="text-xs text-muted-foreground">
            {total === 1 ? "task completed" : "tasks completed"}
          </span>
        </p>
        <div
          role="img"
          aria-label={`${total} tasks completed over the last ${props.days.length} days`}
          className="flex h-24 items-end gap-1"
        >
          {props.days.map((entry, index) => {
            const height =
              entry.count === 0 ? "2px" : `${Math.max(8, (entry.count / peak) * 100)}%`;
            const label = `${formatDayLabel(entry.day)}: ${entry.count} completed`;
            return (
              <Tooltip key={entry.day}>
                <TooltipTrigger render={<div className="flex h-full min-w-0 flex-1 items-end" />}>
                  <div
                    className={`w-full rounded-sm ${
                      entry.count === 0
                        ? "bg-muted"
                        : index === lastIndex
                          ? "bg-success"
                          : "bg-success/60"
                    }`}
                    style={{ height }}
                  />
                </TooltipTrigger>
                <TooltipPopup>{label}</TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{first ? formatDayLabel(first.day) : ""}</span>
          <span>Today</span>
        </div>
      </div>
    </Panel>
  );
});

const PriorityMixPanel = memo(function PriorityMixPanel(props: {
  readonly byPriority: TaskDashboard["byPriority"];
  readonly className?: string;
}) {
  const total = PRIORITIES.reduce((sum, priority) => sum + props.byPriority[priority], 0);
  return (
    <Panel
      title="Priority mix"
      icon={<TriangleAlertIcon />}
      meta={`${total} open`}
      {...(props.className ? { className: props.className } : {})}
    >
      {total === 0 ? (
        <PanelEmpty>No open tasks. Add a task to start.</PanelEmpty>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div
            role="img"
            aria-label={PRIORITIES.map(
              (priority) => `${props.byPriority[priority]} ${priorityLabel(priority)}`,
            ).join(", ")}
            className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted"
          >
            {PRIORITIES.filter((priority) => props.byPriority[priority] > 0).map((priority) => (
              <div
                key={priority}
                className={PRIORITY_BAR_CLASS[priority]}
                style={{ width: `${(props.byPriority[priority] / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {PRIORITIES.map((priority) => (
              <li key={priority} className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${PRIORITY_BAR_CLASS[priority]}`}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {priorityLabel(priority)}
                </span>
                <span className="font-medium tabular-nums">{props.byPriority[priority]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
});

function SegmentedBar(props: {
  readonly done: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly otherOpen: number;
}) {
  const total = props.done + props.inProgress + props.blocked + props.otherOpen;
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  const segments = [
    { key: "done", value: props.done, className: "bg-success" },
    { key: "progress", value: props.inProgress, className: "bg-info" },
    { key: "blocked", value: props.blocked, className: "bg-destructive" },
    { key: "open", value: props.otherOpen, className: "bg-muted-foreground/30" },
  ];
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <div
            key={segment.key}
            className={segment.className}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

const LEGEND = [
  { label: "Done", dot: "bg-success" },
  { label: "In progress", dot: "bg-info" },
  { label: "Blocked", dot: "bg-destructive" },
  { label: "Other open", dot: "bg-muted-foreground/30" },
] as const;

const ProjectsPanel = memo(function ProjectsPanel(props: {
  readonly sections: TaskDashboard["bySection"];
  readonly names: SectionNames;
  readonly onOpenSection: (slug: string) => void;
  readonly className?: string;
}) {
  const rows = useMemo(
    () =>
      props.sections
        .filter((section) => section.open > 0 || section.done > 0)
        .toSorted((a, b) => b.open - a.open || b.done - a.done),
    [props.sections],
  );
  const visible = rows.slice(0, MAX_SECTIONS);
  return (
    <Panel
      title="Projects"
      icon={<FolderIcon />}
      meta={rows.length > 0 ? `${rows.length} with tasks` : undefined}
      {...(props.className ? { className: props.className } : {})}
    >
      {rows.length === 0 ? (
        <PanelEmpty>No project has tasks yet. Add a task to a project.</PanelEmpty>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map((section) => (
              <li key={section.slug}>
                <button
                  type="button"
                  onClick={() => props.onOpenSection(section.slug)}
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {sectionName(props.names, section.slug)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {section.open} open · {section.done} done
                      {section.blocked > 0 ? (
                        <span className="text-destructive"> · {section.blocked} blocked</span>
                      ) : null}
                    </span>
                  </span>
                  <SegmentedBar
                    done={section.done}
                    inProgress={section.inProgress}
                    blocked={section.blocked}
                    otherOpen={Math.max(0, section.open - section.inProgress - section.blocked)}
                  />
                </button>
              </li>
            ))}
          </ul>
          <MoreHint count={rows.length - visible.length} noun="projects" />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-1.5 rounded-full ${item.dot}`} />
                {item.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
});

type AttentionReason = { readonly kind: "overdue" | "blocked" | "stale"; readonly label: string };
type AttentionItem = { readonly task: TaskView; readonly reasons: AttentionReason[] };

/** Overdue, blocked and long-untouched open tasks merged into one list, most urgent reason first. */
function buildAttention(
  tasks: ReadonlyArray<TaskView>,
  stale: ReadonlyArray<TaskView>,
  now: number,
): AttentionItem[] {
  const items = new Map<string, AttentionItem>();
  const add = (task: TaskView, reason: AttentionReason) => {
    const existing = items.get(task.id);
    if (existing) existing.reasons.push(reason);
    else items.set(task.id, { task, reasons: [reason] });
  };

  const open = tasks.filter(isOpen);
  for (const task of sortTasks(open, "due")) {
    const due = formatDue(task.due, now);
    if (due?.startsWith("Overdue")) add(task, { kind: "overdue", label: due });
  }
  for (const task of open) {
    if (task.status === "blocked") add(task, { kind: "blocked", label: "Blocked" });
  }
  for (const task of stale) {
    const days = Math.max(1, Math.floor((now - task.updatedAt) / DAY_MS));
    add(task, { kind: "stale", label: `No change for ${days} days` });
  }
  return [...items.values()];
}

const REASON_VARIANT = { overdue: "error", blocked: "error", stale: "warning" } as const;

const AttentionPanel = memo(function AttentionPanel(props: {
  readonly tasks: ReadonlyArray<TaskView>;
  readonly stale: ReadonlyArray<TaskView>;
  readonly names: SectionNames;
  readonly now: number;
  readonly onSelect: (task: TaskView) => void;
  readonly className?: string;
}) {
  const items = useMemo(
    () => buildAttention(props.tasks, props.stale, props.now),
    [props.tasks, props.stale, props.now],
  );
  const visible = items.slice(0, MAX_ATTENTION);
  return (
    <Panel
      title="Needs attention"
      icon={<TriangleAlertIcon />}
      meta={items.length > 0 ? items.length : undefined}
      {...(props.className ? { className: props.className } : {})}
    >
      {items.length === 0 ? (
        <PanelEmpty>Nothing is late, blocked or old.</PanelEmpty>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map(({ task, reasons }) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(task)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    {task.section !== GENERAL_SECTION ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {sectionName(props.names, task.section)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {reasons.map((reason) => (
                      <Badge key={reason.kind} variant={REASON_VARIANT[reason.kind]}>
                        {reason.label}
                      </Badge>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <MoreHint count={items.length - visible.length} noun="tasks" />
        </>
      )}
    </Panel>
  );
});

const ActivityPanel = memo(function ActivityPanel(props: {
  readonly activity: TaskDashboard["recentActivity"];
  readonly now: number;
  readonly onSelect: (task: TaskView) => void;
  readonly className?: string;
}) {
  return (
    <Panel
      title="Recent activity"
      icon={<HistoryIcon />}
      {...(props.className ? { className: props.className } : {})}
    >
      {props.activity.length === 0 ? (
        <PanelEmpty>Changes to your tasks show here.</PanelEmpty>
      ) : (
        <ul className="relative m-4 ml-5 flex flex-col border-l border-border">
          {props.activity.map((entry) => (
            <li
              key={`${entry.task.id}:${entry.at}:${entry.text}`}
              className="relative pb-4 pl-4 last:pb-0"
            >
              <span
                aria-hidden
                className="absolute top-1.5 -left-1 size-2 rounded-full border border-border bg-card"
              />
              <button
                type="button"
                onClick={() => props.onSelect(entry.task)}
                className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="block text-sm">
                  <span className="font-medium">{entry.actor}</span>{" "}
                  <span className="text-muted-foreground">{entry.text}</span>
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{entry.task.title}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 tabular-nums">{relativeTime(entry.at, props.now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
});

function buildSectionNames(
  tasks: ReadonlyArray<TaskView>,
  projects: TaskContext["projects"],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const project of projects) names.set(project.slug, project.name);
  for (const task of tasks) {
    if (!names.has(task.section) && task.project) names.set(task.section, task.project);
  }
  names.set(GENERAL_SECTION, "No project");
  return names;
}

export function TaskDashboardView(props: TaskDashboardViewProps) {
  const { dashboard, tasks, context, actions, onSelect, onOpenSection, onCreate } = props;
  const names = useMemo(
    () => buildSectionNames(tasks, context.projects),
    [tasks, context.projects],
  );

  if (tasks.length === 0) {
    return (
      <Empty size="compact">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecksIcon />
          </EmptyMedia>
          <EmptyTitle>No tasks yet</EmptyTitle>
          <EmptyDescription>
            Tasks come from the files in your AIOS task folder. Add a file there, or create a task
            here. It shows on this page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreate}>
            <PlusIcon />
            New task
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <FocusSection
        tasks={tasks}
        names={names}
        now={context.now}
        actions={actions}
        onSelect={onSelect}
        onCreate={onCreate}
        onOpenList={props.onOpenList}
      />
      <KpiStrip dashboard={dashboard} />
      <div className="grid min-w-0 grid-cols-1 gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
        <OrganizePanel tasks={tasks} actions={actions} className="@xl:col-span-2" />
        <QuickBatchPanel tasks={tasks} names={names} actions={actions} className="@xl:col-span-2" />
        <ThroughputPanel days={dashboard.completionsPerDay} />
        <PriorityMixPanel byPriority={dashboard.byPriority} />
        <ProjectsPanel
          sections={dashboard.bySection}
          names={names}
          onOpenSection={onOpenSection}
          className="@xl:col-span-2"
        />
        <AttentionPanel
          tasks={tasks}
          stale={dashboard.staleOpen}
          names={names}
          now={context.now}
          onSelect={onSelect}
        />
        <ActivityPanel
          activity={dashboard.recentActivity}
          now={context.now}
          onSelect={onSelect}
          className="@5xl:col-span-2"
        />
      </div>
    </div>
  );
}
