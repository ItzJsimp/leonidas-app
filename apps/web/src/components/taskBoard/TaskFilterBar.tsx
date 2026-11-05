import type { TaskBoardTaskPriority, TaskBoardTaskStatus } from "@t3tools/contracts";
import { ArrowUpDownIcon, GroupIcon, ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { memo } from "react";

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

import { priorityLabel, statusLabel, type TaskFlag, type TaskSort } from "./taskBoard.logic";
import { activeFilterCount, type TaskListGroupBy, type TasksPrefs } from "./tasksPage.logic";

const STATUS_CHIPS: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
];
const PRIORITIES: ReadonlyArray<TaskBoardTaskPriority> = ["critical", "high", "medium", "low"];
const FLAGS: ReadonlyArray<readonly [TaskFlag, string]> = [
  ["stale", "Stale, 21 days or more"],
  ["noGates", "No gates"],
];
const SORT_LABELS: Record<TaskSort, string> = {
  priority: "Priority",
  updated: "Recently updated",
  due: "Due date",
  title: "Title",
};
const GROUP_LABELS: Record<TaskListGroupBy, string> = {
  state: "State",
  owner: "Owner",
  project: "Project",
  status: "Status",
  priority: "Priority",
  due: "Due week",
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
}) {
  const { prefs, query, onPrefsChange } = props;
  const activeCount = activeFilterCount(prefs, query);
  const menuCount =
    (prefs.statuses?.length ?? 0) +
    (prefs.priorities?.length ?? 0) +
    Number(prefs.sharedOnly) +
    Number(prefs.flag !== null) +
    Number(props.showClosedToggle && prefs.includeClosed);
  return (
    <div className="flex flex-1 items-center justify-end gap-1">
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
        {query ? (
          <InputGroupAddon align="inline-end">
            <Button
              variant="ghost"
              size="icon-tiny"
              aria-label="Clear search"
              onClick={() => props.onQueryChange("")}
            >
              <XIcon />
            </Button>
          </InputGroupAddon>
        ) : (
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
          <MenuGroup>
            <MenuGroupLabel>Flags</MenuGroupLabel>
            {FLAGS.map(([flag, label]) => (
              <MenuCheckboxItem
                key={flag}
                checked={prefs.flag === flag}
                onCheckedChange={(on) => onPrefsChange({ flag: on ? flag : null })}
              >
                {label}
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
      {/* State groups always use the do-next order, so a Sort menu there would do nothing. */}
      {props.showGroupBy && prefs.groupBy === "state" ? null : (
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
      )}
      {props.showGroupBy ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="compact"
                aria-label={
                  prefs.groupBy === "none"
                    ? "Group tasks"
                    : `Group by ${GROUP_LABELS[prefs.groupBy]}`
                }
              />
            }
          >
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
      {/* Search clears from its own box, so this one shows only when a menu filter is on. */}
      {activeCount > 0 && menuCount > 0 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear filters"
          onClick={() => {
            props.onQueryChange("");
            onPrefsChange({ statuses: null, priorities: null, sharedOnly: false, flag: null });
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
});
