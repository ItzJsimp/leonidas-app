import type { SidebarThreadSortOrder } from "@t3tools/contracts";
import type { RefObject } from "react";

import { Popover, PopoverPopup } from "../ui/popover";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { DEFAULT_SIDEBAR_VIEW, type SidebarView } from "./sidebarView.logic";
import { useSidebarViewStore } from "./sidebarViewStore";

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs text-muted-foreground">{props.label}</span>
      <ToggleGroup
        aria-label={props.label}
        className="w-full *:flex-1"
        value={[props.value]}
        onValueChange={(next) => {
          const value = props.options.find(([option]) => option === next[0])?.[0];
          if (value) props.onChange(value);
        }}
      >
        {props.options.map(([value, text]) => (
          <Toggle key={value} value={value}>
            {text}
          </Toggle>
        ))}
      </ToggleGroup>
      {/* Says what the current choice does, so no option needs a guess. */}
      <span className="text-2xs text-muted-foreground/80">
        {props.options.find(([option]) => option === props.value)?.[2]}
      </span>
    </div>
  );
}

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
  classic: "Manual",
};

/** The current grouping, as the More menu shows it next to View options. */
export const viewOptionsLabel = (groupBy: SidebarView["groupBy"]) => GROUP_LABELS[groupBy];

/** View options: four small choices that change the chat list in place. The More menu opens it. */
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
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverPopup
        anchor={props.anchor}
        align="end"
        padding="none"
        className="w-60"
        aria-label="View options"
      >
        <div className="flex flex-col gap-2.5 p-3">
          <Segmented
            label="Group by"
            value={view.groupBy}
            options={[
              ["date", "Date", "Today, Yesterday, This week"],
              ["status", "Status", "Needs you, Running, Ready, Recent"],
              ["project", "Project", "One group for each project with chats"],
              ["classic", "Manual", "One list in the order you drag"],
            ]}
            onChange={(groupBy) => setView({ groupBy })}
          />
          <Segmented
            label="Sort by"
            value={props.sortOrder}
            options={[
              ["updated_at", "Last activity", "The newest message or result first"],
              ["created_at", "Created", "The newest chat first"],
            ]}
            onChange={props.onSortOrderChange}
          />
          <Segmented
            label="Density"
            value={view.density}
            options={[
              ["comfortable", "Comfortable", "Two lines for each chat"],
              ["compact", "Compact", "One line for each chat"],
            ]}
            onChange={(density) => setView({ density })}
          />
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-muted-foreground">Show</span>
            {SHOW_ROWS.map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-2 py-0.5 text-xs"
              >
                {label}
                <Switch
                  size="sm"
                  checked={view[key]}
                  onCheckedChange={(checked) => setView({ [key]: checked })}
                />
              </label>
            ))}
          </div>
          {isDefault ? null : (
            <button
              type="button"
              onClick={() => {
                resetView();
                props.onSortOrderChange("updated_at");
              }}
              className="cursor-pointer self-start text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset to default
            </button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
