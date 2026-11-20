import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useId, type ComponentType, type ReactNode, type SVGProps } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";

import { useDetachedTab } from "./detachedTab";
import { WindowHeader, type WindowTab } from "./WindowHeader";

export { nextTabIndex, type WindowTab } from "./WindowHeader";

const NO_TABS: readonly WindowTab[] = [];

/** The tab to show: the `tab` search value when it names a tab, else the first tab. */
export function resolveWindowTab(tabs: readonly WindowTab[], value: unknown): string | undefined {
  return tabs.find((tab) => tab.id === value)?.id ?? tabs[0]?.id;
}

/**
 * The frame every rail window shares: a title row (title left, actions right), underline tabs
 * kept in the `tab` search value, and a scrolling body. A function child gets the shown tab id.
 */
export function RailWindow({
  title,
  actions,
  tabs = NO_TABS,
  flushTab,
  children,
}: {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly tabs?: readonly WindowTab[];
  /** A tab that fills the whole panel and scrolls on its own, with no padding. */
  readonly flushTab?: string;
  readonly children: ReactNode | ((tab: string | undefined) => ReactNode);
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { readonly tab?: unknown };
  const detached = useDetachedTab();
  const active = resolveWindowTab(tabs, detached ? detached.tab : search.tab);
  const base = useId();

  const select = (id: string) =>
    detached
      ? detached.setTab(id === tabs[0]?.id ? null : id)
      : void navigate({
          to: ".",
          search: ((previous: Record<string, unknown>) => ({
            ...previous,
            tab: id === tabs[0]?.id ? undefined : id,
          })) as never,
          replace: true,
        });
  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground"
    >
      <WindowHeader
        title={title}
        actions={actions}
        tabs={tabs}
        active={active}
        onSelect={select}
        idBase={base}
      />
      <div
        role={tabs.length > 0 ? "tabpanel" : undefined}
        id={`${base}-panel`}
        aria-labelledby={active ? `${base}-tab-${active}` : undefined}
        className={
          active !== undefined && active === flushTab
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto p-4"
        }
      >
        {typeof children === "function" ? children(active) : children}
      </div>
    </section>
  );
}

export function WindowLoading({ label = "Loading" }: { readonly label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Spinner size="sm" aria-label={label} />
      <span>{label}</span>
    </div>
  );
}

/** A dashed box that says what will show here and why it is empty now. */
export function WindowEmpty({
  icon: Icon,
  title,
  line,
  action,
}: {
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
  readonly title: string;
  readonly line: string;
  readonly action?: { readonly label: string; readonly to: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {Icon ? <Icon aria-hidden className="size-6 text-muted-foreground" /> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{line}</p>
      {action ? (
        <Link
          to={action.to as "/"}
          className="mt-1 rounded-sm text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function WindowError({
  message = "This did not load.",
  onRetry,
}: {
  readonly message?: string;
  readonly onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-border px-6 py-12 text-center"
    >
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
