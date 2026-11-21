import type { SidebarThreadSortOrder } from "@t3tools/contracts";
import {
  CalendarIcon,
  ClockIcon,
  FolderIcon,
  ListIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import type { RefObject } from "react";

import { cn } from "~/lib/utils";
import { Popover, PopoverPopup } from "../ui/popover";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { DEFAULT_SIDEBAR_VIEW, type SidebarGroupBy, type SidebarView } from "./sidebarView.logic";
import { useSidebarViewStore } from "./sidebarViewStore";

const GROUP_OPTIONS: ReadonlyArray<{
  readonly value: SidebarGroupBy;
  readonly label: string;
  readonly hint: string;
  readonly Icon: LucideIcon;
}> = [
  { value: "date", label: "Date", hint: "Today, Yesterday, This week", Icon: CalendarIcon },
  {
    value: "status",
    label: "Status",
    hint: "Needs you, Running, Ready, Recent",
    Icon: ClockIcon,
  },
  { value: "project", label: "Project", hint: "One group per project", Icon: FolderIcon },
  { value: "account", label: "Account", hint: "One group per account", Icon: UserIcon },
  { value: "classic", label: "Manual", hint: "Manual drag order", Icon: ListIcon },
];

const SHOW_ROWS: ReadonlyArray<readonly [keyof SidebarView & `show${string}`, string]> = [
  ["showRail", "Project rail"],
  ["showProject", "Project name"],
  ["showReason", "Status line"],
  ["showTime", "Time"],
];

const GROUP_LABELS: Readonly<Record<SidebarView["groupBy"], string>> = {
  date: "By date",
  status: "By status",
  project: "By project",
  account: "By account",
  classic: "Manual",
};

/** The current grouping, as the More menu shows it next to Display options. */
export const viewOptionsLabel = (groupBy: SidebarView["groupBy"]) => GROUP_LABELS[groupBy];

/** Display options popover: Group by tiles, Sort by & Row density segmented controls, and Show on rows switches. */
export function SidebarViewMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The search field: the panel opens under it. */
  anchor: RefObject<HTMLDivElement | null>;
  sortOrder: SidebarThreadSortOrder;
  onSortOrderChange: (order: SidebarThreadSortOrder) => void;
}) {
  const view = useSidebarViewStore((store) => store.view);
  const setView = useSidebarViewStore((store) => store.setView);
  const resetView = useSidebarViewStore((store) => store.resetView);
  const isDefault =
    JSON.stringify(view) === JSON.stringify(DEFAULT_SIDEBAR_VIEW) &&
    props.sortOrder === "updated_at";
  const activeGroupHint = GROUP_OPTIONS.find((option) => option.value === view.groupBy)?.hint ?? "";

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverPopup
        anchor={props.anchor}
        align="end"
        padding="none"
        className="w-80 max-w-[calc(100vw-2rem)]"
        aria-label="Display options"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-xs font-semibold text-foreground">Display</span>
          <button
            type="button"
            disabled={isDefault}
            onClick={() => {
              resetView();
              props.onSortOrderChange("updated_at");
            }}
            className="cursor-pointer rounded-sm px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none"
          >
            Reset
          </button>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-medium text-muted-foreground">Group by</span>
              <span className="truncate text-2xs text-muted-foreground/85">{activeGroupHint}</span>
            </div>
            <div role="group" aria-label="Group by" className="grid grid-cols-5 gap-1">
              {GROUP_OPTIONS.map(({ value, label, Icon }) => {
                const active = view.groupBy === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setView({ groupBy: value })}
                    className={cn(
                      "flex h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-0.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                      active
                        ? "border-state bg-sidebar-row-active font-medium text-foreground [&_svg]:text-state-text"
                        : "border-border bg-background text-muted-foreground hover:border-input hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Sort by</span>
              <ToggleGroup
                aria-label="Sort by"
                variant="segmented"
                size="segmented"
                value={[props.sortOrder]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "updated_at" || value === "created_at") {
                    props.onSortOrderChange(value);
                  }
                }}
              >
                <Toggle value="updated_at">Last activity</Toggle>
                <Toggle value="created_at">Created</Toggle>
              </ToggleGroup>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Row density</span>
              <ToggleGroup
                aria-label="Row density"
                variant="segmented"
                size="segmented"
                value={[view.density]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "comfortable" || value === "compact") {
                    setView({ density: value });
                  }
                }}
              >
                <Toggle value="comfortable">Comfortable</Toggle>
                <Toggle value="compact">Compact</Toggle>
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-2.5">
            <span className="text-2xs font-medium text-muted-foreground">Show on rows</span>
            {SHOW_ROWS.map(([key, label]) => (
              <label
                key={key}
                className="flex h-7 cursor-pointer items-center justify-between gap-2 rounded-sm px-0.5 text-xs text-foreground"
              >
                <span className="truncate">{label}</span>
                <Switch
                  size="sm"
                  checked={view[key]}
                  onCheckedChange={(checked) => setView({ [key]: checked })}
                />
              </label>
            ))}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
