import { RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";

import { columnLabel, type LayoutChange } from "./TaskTableHeader";
import {
  DEFAULT_LAYOUT,
  setColumnHidden,
  setDensity,
  setFreezeName,
  type Density,
  type TasksLayout,
} from "./taskLayout.logic";

const DENSITY_LABELS: ReadonlyArray<readonly [Density, string]> = [
  ["compact", "Compact"],
  ["default", "Default"],
  ["comfortable", "Comfortable"],
];

/** The table's Properties menu: show or hide columns, row height, freeze Name, reset. */
export function TaskPropertiesMenu(props: {
  readonly layout: TasksLayout;
  readonly onLayoutChange: LayoutChange;
}) {
  const { layout, onLayoutChange } = props;
  const { table } = layout;
  const hiddenCount = table.columns.filter((column) => column.hidden).length;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="compact"
            aria-label={hiddenCount > 0 ? `Properties, ${hiddenCount} hidden` : "Properties"}
          />
        }
      >
        <SlidersHorizontalIcon />
        <span className="hidden sm:inline">Properties</span>
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel>Shown columns</MenuGroupLabel>
          {table.columns.map((column) => (
            <MenuCheckboxItem
              key={column.key}
              checked={!column.hidden}
              disabled={column.key === "title"}
              onCheckedChange={(shown) =>
                onLayoutChange(
                  `${shown ? "Shown" : "Hidden"} column: ${columnLabel(column.key)}`,
                  (current) => setColumnHidden(current, column.key, !shown),
                )
              }
            >
              {columnLabel(column.key)}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Row height</MenuGroupLabel>
          <MenuRadioGroup
            value={table.density}
            onValueChange={(value) =>
              onLayoutChange("Row height changed", (current) =>
                setDensity(current, value as Density),
              )
            }
          >
            {DENSITY_LABELS.map(([density, label]) => (
              <MenuRadioItem key={density} value={density}>
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuCheckboxItem
          checked={table.freezeName}
          onCheckedChange={(on) =>
            onLayoutChange(on ? "Froze Name column" : "Unfroze Name column", (current) =>
              setFreezeName(current, on),
            )
          }
        >
          Freeze Name column
        </MenuCheckboxItem>
        <MenuItem
          onClick={() =>
            onLayoutChange("Reset table layout", (current) => ({
              ...current,
              table: DEFAULT_LAYOUT.table,
            }))
          }
        >
          <RotateCcwIcon aria-hidden />
          Reset table layout
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
