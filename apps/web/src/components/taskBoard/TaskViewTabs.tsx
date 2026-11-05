import {
  CalendarIcon,
  ChevronDownIcon,
  ColumnsIcon,
  LayoutDashboardIcon,
  ListIcon,
  RouteIcon,
  TableIcon,
} from "lucide-react";
import { memo } from "react";

import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

import type { TasksView } from "./tasksPage.logic";

type Option = { readonly view: TasksView; readonly label: string; readonly icon: typeof ListIcon };

const TABS: ReadonlyArray<Option> = [
  { view: "table", label: "Table", icon: TableIcon },
  { view: "board", label: "Board", icon: ColumnsIcon },
  { view: "calendar", label: "Calendar", icon: CalendarIcon },
  { view: "list", label: "List", icon: ListIcon },
];

// Settled decision 8: Dashboard and Roadmap stay, under More.
const MORE: ReadonlyArray<Option> = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { view: "roadmap", label: "Roadmap", icon: RouteIcon },
];

export const VIEW_ICONS = Object.fromEntries(
  [...TABS, ...MORE].map((option) => [option.view, option.icon]),
) as Record<TasksView, typeof ListIcon>;

/** Every tab sets `aria-selected`, so one static class string styles both states. */
export const TAB_CLASS =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-inset aria-selected:bg-background aria-selected:font-medium aria-selected:text-foreground aria-selected:shadow-xs";

/** The view kind tabs. `selected` is null while a saved view is open. */
export const TaskViewTabs = memo(function TaskViewTabs(props: {
  readonly selected: TasksView | null;
  readonly onSelect: (view: TasksView) => void;
}) {
  const { selected } = props;
  const more = MORE.find((option) => option.view === selected);
  const MoreIcon = more?.icon;
  return (
    <>
      {TABS.map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          type="button"
          role="tab"
          aria-selected={selected === view}
          aria-label={label}
          onClick={() => props.onSelect(view)}
          className={TAB_CLASS}
        >
          <Icon aria-hidden className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              role="tab"
              aria-selected={more !== undefined}
              aria-label={more ? `More views: ${more.label}` : "More views"}
              data-tour="tasks-roadmap-tab"
              className={TAB_CLASS}
            />
          }
        >
          {MoreIcon ? <MoreIcon aria-hidden className="size-4" /> : null}
          <span className={more ? "hidden sm:inline" : undefined}>{more?.label ?? "More"}</span>
          <ChevronDownIcon aria-hidden className="size-3.5 opacity-60" />
        </MenuTrigger>
        <MenuPopup align="start">
          {MORE.map(({ view, label, icon: Icon }) => (
            <MenuItem key={view} onClick={() => props.onSelect(view)}>
              <Icon aria-hidden />
              {label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
});
