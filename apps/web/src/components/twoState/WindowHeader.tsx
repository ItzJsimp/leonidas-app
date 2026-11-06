import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";

// The design sets tab labels at 13 px, between the xs and sm tokens.
// oxlint-disable-next-line shadcn/no-arbitrary-values
const TAB_TEXT = "text-[13px]";
const TAB_CLASS = `-mb-px shrink-0 rounded-t-sm border-b-2 py-2 ${TAB_TEXT} whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none`;
const NO_TABS: readonly WindowTab[] = [];

export interface WindowTab {
  readonly id: string;
  readonly label: string;
}

/** The index a tab key moves to, or null when the key does nothing. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * The top of every rail window: a title row (title and count left, actions right) and optional
 * underline tabs. `idBase` ties each tab to the panel `${idBase}-panel`.
 */
export function WindowHeader({
  title,
  count,
  actions,
  tabs = NO_TABS,
  active,
  onSelect,
  idBase,
}: {
  readonly title: string;
  readonly count?: number;
  readonly actions?: ReactNode;
  readonly tabs?: readonly WindowTab[];
  readonly active?: string | undefined;
  readonly onSelect?: (id: string) => void;
  readonly idBase?: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = nextTabIndex(event.key, index, tabs.length);
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    tabRefs.current[next]?.focus();
    onSelect?.(tab.id);
  };

  return (
    <>
      <header
        className={cn(
          // A narrow pane wraps the actions under the title instead of cutting the title.
          "flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 max-[727px]:pl-14",
          // The top-right corner buttons sit over the page when no chat claims them.
          "[[data-shell-corner]_&]:pr-[calc(var(--workspace-controls-right)+4.5rem)]!",
          isElectron && "drag-region",
        )}
      >
        <div className="flex shrink-0 items-baseline gap-2">
          <h1 className="text-base font-semibold whitespace-nowrap">{title}</h1>
          {count === undefined ? null : (
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{count}</span>
          )}
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:[&>[data-window-search]]:order-first max-sm:[&>[data-window-search]]:w-full">
            {actions}
          </div>
        ) : null}
      </header>
      {tabs.length > 0 ? (
        <div
          role="tablist"
          aria-label={`${title} sections`}
          className="flex shrink-0 gap-4 overflow-x-auto border-b border-border px-4"
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={idBase ? `${idBase}-tab-${tab.id}` : undefined}
                aria-selected={selected}
                aria-controls={idBase ? `${idBase}-panel` : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect?.(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  TAB_CLASS,
                  selected
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
