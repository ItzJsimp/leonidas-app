import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "~/lib/utils";

/** An in-content tab: DESIGN.md "Tabs", a primary underline and medium text when selected. */
export function underlineTabClass(selected: boolean, className?: string): string {
  return cn(
    "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    selected
      ? "border-primary font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
    className,
  );
}

const KEY_STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * Tabs inside content (a reply, a lesson). Roving focus: Tab enters the selected tab, arrow
 * keys, Home and End move between tabs. The panel is linked to its tab for screen readers.
 */
export function UnderlineTabs({
  label,
  tabs,
  selected,
  onSelect,
  size = "md",
  inset = false,
  children,
}: {
  label: string;
  tabs: ReadonlyArray<{ readonly label: string; readonly badge?: ReactNode }>;
  selected: number;
  onSelect: (index: number) => void;
  /** "sm" sits inside a chat reply; "md" heads a card. */
  size?: "sm" | "md";
  /** Pad the tab row to line up with card content. */
  inset?: boolean;
  /** The selected tab's panel. */
  children: ReactNode;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const next = step(selected, tabs.length);
    onSelect(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          "flex overflow-x-auto border-b border-border",
          size === "sm" ? "gap-4" : "gap-5",
          inset && "px-4",
        )}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, index) => {
          const isSelected = index === selected;
          return (
            <button
              // Labels may repeat and tabs never reorder, so the index is the stable key.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              ref={(node) => {
                refs.current[index] = node;
              }}
              id={`${id}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${id}-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={underlineTabClass(
                isSelected,
                size === "sm" ? "min-h-8 px-0.5 py-0" : undefined,
              )}
              onClick={() => onSelect(index)}
            >
              {tab.label}
              {tab.badge}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`}>
        {children}
      </div>
    </>
  );
}

/** The small count chip after a tab label. */
export function TabBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-raised px-1.5 text-2xs text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}
