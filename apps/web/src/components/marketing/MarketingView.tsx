import type { MarketingListResult } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { MailIcon, MegaphoneIcon } from "lucide-react";
import { AsyncResult } from "effect/reactivity";
import { useMemo, useState } from "react";

import { WindowEmpty } from "~/components/twoState/RailWindow";
import { WindowHeader } from "~/components/twoState/WindowHeader";
import { SidebarInset } from "~/components/ui/sidebar";

import { useAtomCommand } from "../../state/use-atom-command";
import { BatchApproval, type DecideFn } from "./BatchApproval";
import { ContentList } from "./ContentList";
import { contentRows } from "./marketing.logic";
import { MetricsPanel } from "./MetricsPanel";
import { marketingDecide, useMarketing } from "./state";

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const TABS = [
  { id: "approval", label: "Needs approval" },
  { id: "content", label: "Posts" },
  { id: "metrics", label: "Metrics" },
  { id: "email", label: "Email" },
  { id: "ads", label: "Ads" },
] as const;

/** Tabs with no data behind them yet: each says what will show. */
const COMING = {
  email: {
    icon: MailIcon,
    title: "No email yet",
    line: "Email drafts are coming. Leonidas will write and queue emails for your approval here.",
  },
  ads: {
    icon: MegaphoneIcon,
    title: "No ads yet",
    line: "Ad drafts are coming. Leonidas will write and queue ads for your approval here.",
  },
} as const;
type TabId = (typeof TABS)[number]["id"];

/** The Marketing view. A Command Center lens can host this same component later. */
export function MarketingScreen(props: {
  readonly list: MarketingListResult | null;
  readonly error: string | null;
  readonly noWorkspace?: boolean;
  readonly updatedAt?: number;
  readonly canDecide: boolean;
  readonly decide: DecideFn;
  readonly onRefresh: () => void;
}) {
  const { list, error } = props;
  const [tab, setTab] = useState<TabId>("approval");
  const brandNames = useMemo(
    () => Object.fromEntries((list?.brands ?? []).map((brand) => [brand.slug, brand.name])),
    [list],
  );
  const rows = useMemo(() => (list ? contentRows(list) : []), [list]);
  const queued = list?.queueTotal ?? 0;
  const tabs = TABS.map((item) =>
    item.id === "approval" && queued > 0 ? { ...item, label: `${item.label} ${queued}` } : item,
  );

  return (
    <SidebarInset className="isolate h-full min-h-0 overflow-hidden overscroll-y-none">
      <WindowHeader
        title="Marketing"
        tabs={tabs}
        active={tab}
        onSelect={(id) => setTab(id as TabId)}
        idBase="marketing"
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            Agents write drafts. You decide what goes out.
            {props.updatedAt ? ` Updated ${formatTime(props.updatedAt)}.` : ""}
          </p>

          {list?.bad.length ? (
            <details className="rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer">
                {list.bad.length} {list.bad.length === 1 ? "line was" : "lines were"} skipped
              </summary>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {list.bad.map((item) => (
                  <li key={`${item.file}:${item.line ?? 0}:${item.reason}`}>
                    {item.file}
                    {item.line ? ` line ${item.line}` : ""}: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div role="tabpanel" id="marketing-panel" aria-labelledby={`marketing-tab-${tab}`}>
            {tab === "email" || tab === "ads" ? (
              <WindowEmpty {...COMING[tab]} />
            ) : props.noWorkspace ? (
              <p role="status" className="text-sm text-muted-foreground">
                Marketing reads the marketing folder of your AIOS. Connect your AIOS folder on the{" "}
                <Link to="/tasks" className="text-primary underline underline-offset-4">
                  Tasks page
                </Link>
                , then come back.
              </p>
            ) : list === null ? (
              <p role="status" className="text-sm text-muted-foreground">
                {error ? "Marketing numbers are not available now. Try again later." : "Loading..."}
              </p>
            ) : tab === "approval" ? (
              <BatchApproval
                queue={list.queue}
                brandNames={brandNames}
                queueTotal={list.queueTotal}
                canDecide={props.canDecide}
                decide={props.decide}
                onDecided={props.onRefresh}
              />
            ) : tab === "content" ? (
              <ContentList rows={rows} total={list.postsTotal} brandNames={brandNames} />
            ) : (
              <MetricsPanel metrics={list.metrics} />
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export function MarketingView() {
  const { environmentId, list, error, noWorkspace, refresh, canDecide, updatedAt } = useMarketing();
  const run = useAtomCommand(marketingDecide);
  const decide: DecideFn = async (decisions) => {
    if (!environmentId) return null;
    const result = await run({ environmentId, input: { decisions: [...decisions] } });
    return AsyncResult.isSuccess(result) ? result.value.results : null;
  };
  return (
    <MarketingScreen
      list={list}
      error={error}
      noWorkspace={noWorkspace}
      updatedAt={updatedAt}
      canDecide={canDecide}
      decide={decide}
      onRefresh={refresh}
    />
  );
}
