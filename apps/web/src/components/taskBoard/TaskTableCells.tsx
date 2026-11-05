import { daysUntilDue } from "@t3tools/client-runtime/task-board/daily-planning";
import type {
  TaskBoardTaskPriority,
  TaskBoardTaskStatus,
  TaskBoardTeamMember,
  TaskSchemaProperty,
} from "@t3tools/contracts";
import {
  CalendarIcon,
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  FlagIcon,
  FolderIcon,
  ListChecksIcon,
  TypeIcon,
  UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { ownerOf } from "./owner.logic";
import {
  priorityLabel,
  priorityTone,
  relativeTime,
  statusLabel,
  statusTone,
  type TaskTone,
  type TaskView,
} from "./taskBoard.logic";
import { optionTone } from "./taskCells.logic";

/** Header label and icon for each built-in column. Added properties bring their own. */
export const COLUMN_META: Record<string, { readonly label: string; readonly icon: ReactNode }> = {
  title: { label: "Name", icon: <TypeIcon aria-hidden /> },
  status: { label: "Status", icon: <CircleDotIcon aria-hidden /> },
  priority: { label: "Priority", icon: <FlagIcon aria-hidden /> },
  project: { label: "Project", icon: <FolderIcon aria-hidden /> },
  due: { label: "Due", icon: <CalendarIcon aria-hidden /> },
  gates: { label: "Gates", icon: <ListChecksIcon aria-hidden /> },
  owner: { label: "Owner", icon: <UserIcon aria-hidden /> },
  updated: { label: "Updated", icon: <ClockIcon aria-hidden /> },
};

export function StatusPill({ status }: { readonly status: TaskBoardTaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-md px-2 font-medium text-xs leading-none",
        TONE_CLASS[statusTone(status)],
        status === "retired" && "line-through",
      )}
    >
      <span className="truncate">{statusLabel(status)}</span>
    </span>
  );
}

export function PriorityMark({ priority }: { readonly priority: TaskBoardTaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-md px-2 font-medium text-xs leading-none",
        TONE_CLASS[priorityTone(priority)],
      )}
    >
      {priorityLabel(priority)}
    </span>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The due date as quiet text. A passed date is amber text, never a red chip. */
export function DueText({
  due,
  now,
}: {
  readonly due: string | null | undefined;
  readonly now: number;
}) {
  const days = daysUntilDue(due, now);
  if (days === null || !due) return null;
  const [year, month, day] = due.split("-").map(Number);
  const label =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : SHORT_DATE.format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        days < 0
          ? "text-warning-foreground"
          : days === 0
            ? "font-medium text-foreground"
            : "text-muted-foreground",
      )}
    >
      {label}
      {days < 0 ? (
        <span className="sr-only">{`, ${-days} ${-days === 1 ? "day" : "days"} past the date`}</span>
      ) : null}
    </span>
  );
}

export function GatesBar({ checklist }: { readonly checklist: TaskView["checklist"] }) {
  if (!checklist || checklist.total === 0) {
    return <span className="text-xs text-muted-foreground/70">No gates</span>;
  }
  const percent = Math.round((checklist.done / checklist.total) * 100);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={checklist.total}
        aria-valuenow={checklist.done}
        aria-label="Gates done"
        className="h-1 w-12 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
      </span>
      <span className="tabular-nums">
        {checklist.done}/{checklist.total}
      </span>
    </span>
  );
}

export function OwnerName({
  task,
  team,
}: {
  readonly task: TaskView;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
}) {
  const owner = ownerOf(task, team);
  if (!owner) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-semibold text-2xs text-foreground"
      >
        {owner.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{owner}</span>
    </span>
  );
}

export function UpdatedText({ at, now }: { readonly at: number; readonly now: number }) {
  return <span className="text-xs text-muted-foreground">{relativeTime(at, now)}</span>;
}

// Jake (2026-11-04): every chip is a solid color with white text. Never colored text on a tint.
export const TONE_CLASS: Record<TaskTone, string> = {
  neutral: "bg-zinc-500 text-white",
  muted: "bg-zinc-500 text-white",
  info: "bg-blue-600 text-white",
  warning: "bg-amber-600 text-white",
  danger: "bg-red-600 text-white",
  success: "bg-emerald-600 text-white",
};

export function OptionChip({ label, tone }: { readonly label: string; readonly tone: TaskTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full shrink-0 items-center rounded-md px-2 font-medium text-xs leading-none",
        TONE_CLASS[tone],
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

/** A task-schema.json property value, shown the way its type reads best. */
export function PropValue({
  property,
  value,
}: {
  readonly property: TaskSchemaProperty;
  readonly value: string | ReadonlyArray<string> | undefined;
}) {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return null;
  }
  const items = typeof value === "string" ? [value] : value;
  switch (property.type) {
    case "select":
    case "status":
    case "person":
    case "multi_select":
      return (
        <span className="flex min-w-0 gap-1 overflow-hidden">
          {items.map((item) => (
            <OptionChip key={item} label={item} tone={optionTone(property.colors?.[item])} />
          ))}
        </span>
      );
    case "checkbox": {
      const checked = value === "true";
      return (
        <span
          role="img"
          aria-label={checked ? "Yes" : "No"}
          className={cn(
            "grid size-4 place-items-center rounded-sm border",
            checked ? "border-success bg-success text-white" : "border-muted-foreground/45",
          )}
        >
          {checked ? <CheckIcon aria-hidden className="size-3" strokeWidth={3} /> : null}
        </span>
      );
    }
    case "date": {
      const [year, month, day] = items[0]!.split("-").map(Number);
      return (
        <span className="text-xs tabular-nums text-muted-foreground">
          {SHORT_DATE.format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1))}
        </span>
      );
    }
    default:
      return (
        <span
          className={cn(
            "truncate text-xs",
            property.type === "url" && "text-muted-foreground underline underline-offset-2",
            property.type === "number" && "tabular-nums",
          )}
        >
          {items.join(", ")}
        </span>
      );
  }
}
