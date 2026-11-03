import type { TaskBoardTask, TaskBoardTaskPriority, TaskBoardTaskStatus } from "@t3tools/contracts";
import {
  BanIcon,
  CalendarClockIcon,
  ChevronsUpIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockAlertIcon,
  UsersIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import {
  formatDue,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  taskFlags,
  type TaskTone,
} from "./taskBoard.logic";

const BADGE_VARIANT = {
  neutral: "outline",
  info: "info",
  warning: "warning",
  danger: "error",
  success: "success",
  muted: "secondary",
} as const satisfies Record<
  TaskTone,
  "outline" | "info" | "warning" | "error" | "success" | "secondary"
>;

export function StatusBadge({ status }: { readonly status: TaskBoardTaskStatus }) {
  return (
    <Badge variant={BADGE_VARIANT[statusTone(status)]}>
      {status === "blocked" ? <BanIcon /> : null}
      {statusLabel(status)}
    </Badge>
  );
}

// Red stays for overdue and the main button, so urgency shows as an arrow, not a color.
export function PriorityBadge({ priority }: { readonly priority: TaskBoardTaskPriority }) {
  return (
    <Badge variant={BADGE_VARIANT[priorityTone(priority)]}>
      {priority === "critical" ? (
        <ChevronsUpIcon />
      ) : priority === "high" ? (
        <ChevronUpIcon />
      ) : null}
      {priorityLabel(priority)}
    </Badge>
  );
}

/** Shows nothing when the task has no due date. */
export function DueChip({
  due,
  now,
}: {
  readonly due: string | null | undefined;
  readonly now: number;
}) {
  const text = formatDue(due, now);
  if (!text) return null;
  const overdue = text.startsWith("Overdue");
  return (
    <Badge variant={overdue ? "error" : "outline"}>
      {overdue ? <CircleAlertIcon /> : <CalendarClockIcon />}
      {text}
    </Badge>
  );
}

/** Marks a task that collaborators can see on the project's shared board. */
export function SharedBadge({
  task,
}: {
  readonly task: Pick<TaskBoardTask, "shared" | "sharedBy">;
}) {
  if (!task.shared) return null;
  return (
    <Badge variant="info">
      <UsersIcon />
      {task.sharedBy ? `Shared by ${task.sharedBy}` : "Shared"}
    </Badge>
  );
}

/** Done-when progress as a thin bar with a count. Renders nothing for cards without a checklist. */
export function ChecklistBar({ checklist }: { readonly checklist: TaskBoardTask["checklist"] }) {
  if (!checklist || checklist.total === 0) return null;
  const percent = Math.round((checklist.done / checklist.total) * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={checklist.total}
        aria-valuenow={checklist.done}
        aria-label="Checklist progress"
        className="h-1 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-success" style={{ width: `${percent}%` }} />
      </div>
      <span className="tabular-nums">
        {checklist.done}/{checklist.total}
      </span>
    </div>
  );
}

/** Stale (no change for 21 days) and No gates (no "Done when" list) flags, each an icon and a word. */
export function TaskFlagChips({
  task,
  now,
}: {
  readonly task: Pick<TaskBoardTask, "status" | "updatedAt" | "checklist">;
  readonly now: number;
}) {
  const flags = taskFlags(task, now);
  return (
    <>
      {flags.stale ? (
        <Badge variant="warning">
          <ClockAlertIcon />
          Stale
        </Badge>
      ) : null}
      {flags.noGates ? (
        <Badge variant="outline">
          <CircleDashedIcon />
          No gates
        </Badge>
      ) : null}
    </>
  );
}
