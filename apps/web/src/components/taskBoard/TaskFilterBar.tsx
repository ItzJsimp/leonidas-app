import type { TaskBoardTaskPriority, TaskBoardTaskStatus } from "@t3tools/contracts";
import { ArrowUpDownIcon, GroupIcon, ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { memo, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Kbd } from "~/components/ui/kbd";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";

import { priorityLabel, statusLabel, type TaskSort } from "./taskBoard.logic";
import { activeFilterCount, type TaskListGroupBy, type TasksPrefs } from "./tasksPage.logic";

const STATUS_CHIPS: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
];
const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["critical", "high", "medium", "low"];
const SORT_LABELS: Record<TaskSort, string> = {
  priority: "Priority",
  updated: "Recently updated",
  due: "Due date",
  title: "Title",
};
const GROUP_LABELS: Record<TaskListGroupBy, string> = {
  owner: "Owner",
  project: "Project",
  status: "Status",
  none: "None",
};

function toggled<T>(list: ReadonlyArray<T> | null, value: T, on: boolean): T[] | null {
  const next = on ? [...(list ?? []), value] : (list ?? []).filter((item) => item !== value);
  return next.length > 0 ? next : null;
}

/**
 * The view bar's tools, in one row: search, one Filter menu (status, priority, sharing, closed
 * work), Sort and Group. Filters live in a menu so the row stays one line at every width.
 */
export const TaskFilterBar = memo(function TaskFilterBar(props: {
  readonly prefs: TasksPrefs;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onPrefsChange: (patch: Partial<TasksPrefs>) => void;
  /** Group-by only applies to the List view. */
  readonly showGroupBy: boolean;
  /** The Board always shows its Done column, so it has no closed-work toggle. */
  readonly showClosedToggle: boolean;
  /** The narrow-window project picker, shown in front of the search box. */
  readonly leading?: ReactNode;
}) {
  const { prefs, query, onPrefsChange } = props;
  const activeCount = activeFilterCount(prefs, query);
  const menuCount =
    (prefs.statuses?.length ?? 0) +
    (prefs.priorities?.length ?? 0) +
    Number(prefs.sharedOnly) +
    Number(props.showClosedToggle && prefs.includeClosed);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
      {props.leading}
      <InputGroup className="min-w-24 flex-1 sm:w-36 sm:flex-none">
        <InputGroupAddon>
          <SearchIcon aria-hidden className="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          size="sm"
          aria-label="Search tasks"
          aria-keyshortcuts="/"
          data-tasks-search
          placeholder="Search"
          value={query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
        {query ? null : (
          <InputGroupAddon align="inline-end" className="max-sm:hidden">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        )}
      </InputGroup>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant={menuCount > 0 ? "secondary" : "ghost"}
              size="compact"
              aria-label={menuCount > 0 ? `Filter, ${menuCount} active` : "Filter"}
            />
          }
        >
          <ListFilterIcon />
          <span className="hidden sm:inline">Filter</span>
          {menuCount > 0 ? <span className="tabular-nums">{menuCount}</span> : null}
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-52">
          <MenuGroup>
            <MenuGroupLabel>Status</MenuGroupLabel>
            {STATUS_CHIPS.map((status) => (
              <MenuCheckboxItem
                key={status}
                checked={prefs.statuses?.includes(status) ?? false}
                onCheckedChange={(on) =>
                  onPrefsChange({ statuses: toggled(prefs.statuses, status, on) })
                }
              >
                {statusLabel(status)}
              </MenuCheckboxItem>
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <MenuGroupLabel>Priority</MenuGroupLabel>
            {PRIORITIES.map((priority) => (
              <MenuCheckboxItem
                key={priority}
                checked={prefs.priorities?.includes(priority) ?? false}
                onCheckedChange={(on) =>
                  onPrefsChange({ priorities: toggled(prefs.priorities, priority, on) })
                }
              >
                {priorityLabel(priority)}
              </MenuCheckboxItem>
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuCheckboxItem
            checked={prefs.sharedOnly}
            onCheckedChange={(sharedOnly) => onPrefsChange({ sharedOnly })}
          >
            Only shared with collaborators
          </MenuCheckboxItem>
          {props.showClosedToggle ? (
            <MenuCheckboxItem
              checked={prefs.includeClosed}
              onCheckedChange={(includeClosed) => onPrefsChange({ includeClosed })}
            >
              Show closed tasks
            </MenuCheckboxItem>
          ) : null}
        </MenuPopup>
      </Menu>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="compact"
              aria-label={`Sort by ${SORT_LABELS[prefs.sort]}`}
            />
          }
        >
          <ArrowUpDownIcon />
          <span className="hidden sm:inline">{SORT_LABELS[prefs.sort]}</span>
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuGroup>
            <MenuGroupLabel>Sort by</MenuGroupLabel>
            <MenuRadioGroup
              value={prefs.sort}
              onValueChange={(value) => {
                if (value in SORT_LABELS) onPrefsChange({ sort: value as TaskSort });
              }}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <MenuRadioItem key={value} value={value}>
                  {label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </Menu>
      {props.showGroupBy ? (
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="compact" aria-label="Group tasks" />}>
            <GroupIcon />
            <span className="hidden sm:inline">
              {prefs.groupBy === "none" ? "Group" : GROUP_LABELS[prefs.groupBy]}
            </span>
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuGroup>
              <MenuGroupLabel>Group by</MenuGroupLabel>
              <MenuRadioGroup
                value={prefs.groupBy}
                onValueChange={(value) => {
                  if (value in GROUP_LABELS) onPrefsChange({ groupBy: value as TaskListGroupBy });
                }}
              >
                {Object.entries(GROUP_LABELS).map(([value, label]) => (
                  <MenuRadioItem key={value} value={value}>
                    {label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      ) : null}
      {activeCount > 0 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear filters"
          onClick={() => {
            props.onQueryChange("");
            onPrefsChange({ statuses: null, priorities: null, sharedOnly: false });
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
});
