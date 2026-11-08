import { useSortable } from "@dnd-kit/sortable";
import { type EnvironmentId, AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { type ReactNode, useMemo } from "react";
import { useEnvironmentScope } from "../../state/session";
import {
  animateSidebarLayoutChanges,
  type SidebarListMarker,
  sidebarMarkerId,
} from "../Sidebar.logic";
import { cn } from "~/lib/utils";
import { CSS } from "@dnd-kit/utilities";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";

// Subset of useSortable applied to a thread row's root <li>. Listeners go
// on the whole row (no dedicated handle): the pointer sensor's distance
// constraint keeps plain clicks working, and we skip dnd-kit's aria
// attributes since there is no keyboard sensor and the row body already
// carries its own button semantics.
export type SortableThreadRowBag = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "setNodeRef" | "transform" | "transition" | "isDragging"
>;

export function SortableThreadRow(props: {
  id: string;
  disabled: boolean;
  contextDrag: boolean;
  environmentId: EnvironmentId;
  children: (bag: SortableThreadRowBag) => ReactNode;
}) {
  const canOperateThread = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: { draggable: props.disabled || !canOperateThread },
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  // dnd-kit memoizes each field but not the bag, so the memoized row would
  // rerender on every shell update without this.
  const bag = useMemo(
    () => ({
      listeners,
      setNodeRef,
      transform: props.contextDrag ? null : transform,
      // The lifted row normally follows the pointer without a transition.
      // When it becomes a context ghost, glide its sidebar copy back home.
      transition: props.contextDrag && isDragging ? "transform 150ms ease-out" : transition,
      isDragging: isDragging && !props.contextDrag,
    }),
    [listeners, setNodeRef, transform, transition, isDragging, props.contextDrag],
  );
  return props.children(bag);
}

// Structural list items — the section headers and the
// empty-section placeholders — take part in the sortable list so they shift
// with the rows and the gap can open on either side of them. They can't be
// picked up, and a marker is the sortable `over` when the pointer is on it,
// which resolveSidebarDropTarget turns into the section the gap sits in.
function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  const { setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: { draggable: true },
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        // A newly revealed target must not slide from its hidden position.
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

// Empty targets stay measurable without reserving space at rest. The sorting
// strategy opens their hint space during a drag.
export function SidebarSectionPlaceholder(props: {
  marker: "active-placeholder" | "settled-placeholder";
  label: string;
  showHint: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="relative mx-0.5 -mb-px h-0"
    >
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.isDropTarget && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

// Pointer travel before a press on a row starts a drag, or a press on its
// action button starts a sweep. Shorter presses stay clicks.
export const SIDEBAR_DRAG_DISTANCE = 6;

export type SidebarSweepAction = "settle" | "unsettle" | "unsnooze";

// Zero-height markers reserve no label space at rest. During a drag the
// sorting strategy opens 24px for a 16px label with 4px clearance on each side.
export const SIDEBAR_DRAG_LABEL_HEIGHT = 24;

export function SidebarDragBoundary(props: {
  marker: "pinned-header" | "pinned-divider";
  label: string;
  visible: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative mx-0.5 -mb-px h-0"
    >
      {props.visible ? (
        <div className="sidebar-drag-boundary-label absolute inset-x-2 top-1 flex h-4 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              props.isDropTarget ? "text-primary" : "text-sidebar-foreground/80",
            )}
          >
            {props.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px flex-1",
              props.isDropTarget ? "bg-primary/50" : "bg-sidebar-foreground/25",
            )}
          />
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

// Shelf headers stay visible and keep their measured height while dragging.
export function SidebarSectionHeader(props: {
  marker: "working-header" | "snoozed-header" | "settled-header";
  label: string;
  /** A muted trailing count, shown open or closed. */
  count: number;
  className?: string;
  // While dragging, the settled header reads at full strength and takes the
  // accent while the lifted row is over it.
  dragging?: boolean;
  isDropTarget?: boolean;
  toggle: { expanded: boolean; onToggle: () => void };
}) {
  const shelf =
    props.marker === "working-header"
      ? "working"
      : props.marker === "snoozed-header"
        ? "snoozed"
        : "settled";
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className={cn("mx-0.5 h-8", props.className)}
    >
      <CollapsibleSectionHeader
        onClick={props.toggle.onToggle}
        expanded={props.toggle.expanded}
        tone={props.isDropTarget ? "accent" : props.dragging ? "emphasized" : "muted"}
        accessory={<span className="font-normal tabular-nums">{props.count}</span>}
        data-testid={`sidebar-${shelf}-shelf-toggle`}
      >
        {props.label}
      </CollapsibleSectionHeader>
    </SortableSidebarMarker>
  );
}

// A date or status heading inside the inbox: text and a count, no toggle.
export function SidebarGroupHeading(props: { label: string; count: number }) {
  return (
    <li
      role="presentation"
      className="flex list-none items-center gap-2 px-2.5 pt-3 pb-1 text-2xs font-semibold text-sidebar-muted-foreground first:pt-1"
    >
      <span>{props.label}</span>
      <span className="font-normal tabular-nums text-sidebar-muted-foreground">{props.count}</span>
      <span aria-hidden className="h-px flex-1 bg-sidebar-border/70" />
    </li>
  );
}
