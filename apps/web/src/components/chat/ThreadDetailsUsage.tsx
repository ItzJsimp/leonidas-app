import type {
  EnvironmentId,
  ModelSelection,
  ProviderInstanceId,
  ThreadId,
  UsageLimitsReport,
} from "@t3tools/contracts";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import { limitsNotice } from "@t3tools/shared/usageLimits";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useConnectedUsageAccounts } from "../../hooks/useConnectedUsageAccounts";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import { connectedBenchmarkCandidates } from "../../lib/modelBenchmarks";
import {
  accountFreshnessLabel,
  accountTitle,
  compactWindowLabel,
  extraUsageWindows,
  formatResetCountdown,
  type GlanceLimitRow,
  glanceLimitRows,
  limitsFreshness,
  percentText,
  splitAccountHeader,
  usedPercentLabel,
} from "../../lib/usageLimitsPopover";
import { cn } from "../../lib/utils";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { providerClients } from "../settings/providerDriverMeta";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ResetCreditDialog, resetCreditsSummary, useResetCredit } from "../usage/UsageLimits";
import { readUsagePagePreferences, saveUsagePagePreferences } from "../usage/usagePagePreferences";
import type { StartBenchmarkArena } from "./BenchmarkExplorer";
import { UsageBar } from "./PlanUsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { ThreadDetailsChatQuota } from "./ThreadDetailsChatQuota";
import {
  ThreadDetailsFoldButton,
  ThreadDetailsFoldLine,
  ThreadDetailsSection,
} from "./ThreadDetailsSection";
import { UsageBenchmarks } from "./UsageBenchmarks";

type Account = UsageLimitsReport["accounts"][number];
type UsageWindow = NonNullable<GlanceLimitRow["window"]>;

/** What the context and limits sections of the chat details panel read from the chat. */
export interface ThreadDetailsUsageProps {
  readonly environmentId: EnvironmentId;
  /** Null for drafts, which have no server-side context to break down yet. */
  readonly threadId: ThreadId | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly modelLabel: string;
  readonly effortLabel: string | null;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly providerEntries: ReadonlyArray<ProviderInstanceEntry>;
  /** Null when no project is active, which hides the benchmark row action. */
  readonly onStartChat: ((selection: ModelSelection) => void) | null;
  readonly onStartArena: StartBenchmarkArena | null;
}

/** How often the open panel re-reads account limits; the server caches probes inside this. */
const LIMITS_REFRESH_MS = 5 * 60_000;
/** After a window resets, wait this long before the automatic re-read. */
const RESET_REFRESH_DELAY_MS = 5_000;
const MAX_RESET_REFRESH_DELAY_MS = 24 * 60 * 60_000;

/** The shared ledger columns: account, then the 5-hour and weekly windows. */
const LEDGER_GRID = "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-2";
const LEDGER_COLUMNS = ["5-hour", "Weekly"] as const;

function driverNameOf(driver: Account["driver"]): string {
  return providerClients.get(driver)?.label ?? String(driver);
}

function titleOf(account: Account): string {
  return accountTitle(
    { displayName: account.displayName, sourceLabel: account.sourceLabel },
    account.displayName ?? driverNameOf(account.driver),
  );
}

function resetLabel(window: UsageWindow, now: number): string {
  const countdown = formatResetCountdown(window.resetsAt, now, true);
  return countdown ?? "–";
}

/** A small chip for banked resets: the count, and a click that opens the confirm. */
function ResetChip({
  environmentId,
  account,
  text,
  canRedeem,
}: {
  readonly environmentId: EnvironmentId;
  readonly account: Account;
  readonly text: string;
  readonly canRedeem: boolean;
}) {
  const input = account.resetCreditInput ?? { instanceId: account.instanceId! };
  const { canManageProviders, confirming, setConfirming, busy, status, redeem } = useResetCredit(
    environmentId,
    input,
  );
  const count = account.limits.resetCredits?.availableCount ?? 0;
  const chip =
    "inline-flex h-3.5 items-center gap-0.5 rounded-sm border border-input bg-surface-raised px-0.75 text-3xs font-semibold leading-none tabular-nums text-foreground";
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            canRedeem ? (
              <button
                type="button"
                aria-label={`Use reset: ${text}`}
                disabled={busy || !canManageProviders}
                onClick={() => setConfirming(true)}
                className={cn(chip, "cursor-pointer transition-colors hover:bg-accent")}
              />
            ) : (
              <span className={chip} />
            )
          }
        >
          <RotateCcwIcon aria-hidden className="size-2" />
          {busy ? "…" : count}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {status ?? text}
          {canRedeem ? " · click to use one" : ""}
        </TooltipPopup>
      </Tooltip>
      {canRedeem ? (
        <ResetCreditDialog
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={() => void redeem()}
          disabled={!canManageProviders}
        />
      ) : null}
    </>
  );
}

/** One window in a ledger column: percent used, a thin bar, and the reset countdown. */
function LimitCell({
  label,
  column,
  window,
  now,
  showReset = true,
}: {
  readonly label: string;
  readonly column: string;
  readonly window: UsageWindow | null;
  readonly now: number;
  readonly showReset?: boolean;
}) {
  const shortLabel = compactWindowLabel(window, label);
  if (!window) {
    return (
      <span
        className="text-2xs tabular-nums text-muted-foreground"
        aria-label={`${label}: not reported`}
      >
        –
      </span>
    );
  }
  const used = `${usedPercentLabel(window.usedPercent)}%`;
  const fullReset = formatResetCountdown(window.resetsAt, now, false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex min-w-0 flex-col gap-0.75 whitespace-nowrap tabular-nums" />}
      >
        {shortLabel !== column ? (
          <span className="truncate text-3xs leading-3 text-muted-foreground">{shortLabel}</span>
        ) : null}
        <span className="text-2xs font-semibold leading-3 text-foreground">{used}</span>
        <UsageBar
          fill="used"
          usedPercent={window.usedPercent}
          label={`${shortLabel}: ${percentText(window.usedPercent, "used")}`}
          className="h-0.75 bg-muted-foreground/20"
        />
        {showReset ? (
          <span className="text-3xs leading-3 text-muted-foreground">
            {resetLabel(window, now)}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {shortLabel}: {percentText(window.usedPercent, "used")}
        {fullReset ? ` · ${fullReset}` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

/** One account in the ledger: its name line, its two main windows, then any extra windows. */
function AccountRows({
  environmentId,
  account,
  active,
  now,
}: {
  readonly environmentId: EnvironmentId;
  readonly account: Account;
  readonly active: boolean;
  readonly now: number;
}) {
  const driverLabel = driverNameOf(account.driver);
  const { primaryName, subtitle } = splitAccountHeader(account, driverLabel);
  const rows = glanceLimitRows(account.limits.windows, now);
  const notice = limitsNotice(account.limits);
  const age = accountFreshnessLabel(account.limits.checkedAt, now);
  const extras = extraUsageWindows(account.limits.windows, rows, now);
  const creditsText =
    account.limits.resetCredits && account.limits.resetCredits.availableCount > 0
      ? resetCreditsSummary(account.limits.resetCredits, now, true)
      : null;
  // Account ids start with their environment; only that environment can redeem for it.
  const canRedeem =
    (account.resetCreditInput !== undefined || account.instanceId !== undefined) &&
    account.id.startsWith(`${environmentId}:`);
  const title = titleOf(account);
  // Extra windows sit in the column that matches their length.
  const columnOf = (window: UsageWindow) => (window.kind === "session" ? 0 : 1);

  return (
    <li className="flex flex-col gap-1.5 px-2.5 py-2">
      <div className={LEDGER_GRID}>
        <div className="flex min-w-0 flex-col">
          <div className="flex h-4 min-w-0 items-center gap-1.5">
            <ProviderInstanceIcon
              driverKind={account.driver}
              displayName={title}
              iconClassName="size-3.5"
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="min-w-0 truncate text-xs font-semibold leading-4 text-foreground" />
                }
              >
                {primaryName}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {title}
                {age ? ` · ${age}` : ""}
              </TooltipPopup>
            </Tooltip>
            {active ? (
              <Tooltip>
                <TooltipTrigger
                  render={<span className="size-1.5 shrink-0 rounded-full bg-state" />}
                >
                  <span className="sr-only">Active</span>
                </TooltipTrigger>
                <TooltipPopup side="top">This chat uses {title}</TooltipPopup>
              </Tooltip>
            ) : null}
            {/* One fixed slot on every row, so banked resets line up in a single column. */}
            <span
              data-reset-slot
              className="ms-auto flex h-4 w-6 shrink-0 items-center justify-end"
            >
              {creditsText ? (
                <ResetChip
                  environmentId={environmentId}
                  account={account}
                  text={creditsText}
                  canRedeem={canRedeem}
                />
              ) : null}
            </span>
          </div>
          {subtitle ? (
            <span className="truncate ps-5 text-3xs leading-3.25 text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
        {notice || rows.length === 0 ? (
          <span className="col-span-2 text-2xs text-muted-foreground">
            {notice ?? "Limits pending"}
          </span>
        ) : (
          LEDGER_COLUMNS.map((column, index) => {
            const row = rows[index];
            return (
              <LimitCell
                key={column}
                label={row?.label ?? column}
                column={column}
                window={row?.window ?? null}
                now={now}
              />
            );
          })
        )}
      </div>
      {notice
        ? null
        : extras.map((extra) => {
            const column = columnOf(extra);
            const parent = rows[column]?.window ?? null;
            const sameReset = parent !== null && resetLabel(parent, now) === resetLabel(extra, now);
            const cell = (
              <LimitCell
                label={extra.label}
                column={compactWindowLabel(extra, extra.label)}
                window={extra}
                now={now}
                showReset={!sameReset}
              />
            );
            return (
              <div key={extra.id} className={LEDGER_GRID}>
                <span className="truncate ps-5 text-3xs text-muted-foreground">
                  {compactWindowLabel(extra, extra.label)}
                </span>
                {column === 0 ? cell : <span />}
                {column === 1 ? cell : <span />}
              </div>
            );
          })}
    </li>
  );
}

/**
 * Limits: every signed-in account in one ledger with shared 5-hour and weekly columns.
 * Only the user folds it, and the choice is saved for every chat.
 */
export function ThreadDetailsLimits({ usage }: { readonly usage: ThreadDetailsUsageProps }) {
  const { environmentId, instanceId, providerEntries } = usage;
  const navigate = useNavigate();
  const { active, others } = useConnectedUsageAccounts(environmentId, instanceId);
  // The setting first showed the old usage card, so a user who turned that card off keeps limits folded.
  const shown = useClientSettings((settings) => settings.usageOverlayEnabled);
  const updateSettings = useUpdateClientSettings();
  const setShown = (next: boolean) => void updateSettings({ usageOverlayEnabled: next });
  const [refreshing, setRefreshing] = useState(false);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  // Re-read every account's limits from their source while the panel is open and
  // the window is visible, so the numbers follow the provider without a click.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshProviders({ environmentId, input: {} });
      }
    }, LIMITS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [environmentId, refreshProviders]);

  const activeIds = useMemo(() => new Set(active.map((account) => account.id)), [active]);
  const accounts = useMemo(() => [...active, ...others], [active, others]);
  const chatQuotaRefreshKey = active
    .flatMap((account) => account.limits.windows.map((window) => window.usedPercent))
    .join(",");
  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshUsageLimits(environmentId, () => refreshProviders({ environmentId, input: {} }));
    } catch {
      // The bars keep their last numbers; the freshness label shows they are old.
    } finally {
      setRefreshing(false);
    }
  };
  const nextReset = useMemo(() => {
    const times = accounts
      .flatMap((account) => account.limits.windows)
      .map((window) => (window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt)))
      .filter((at) => at > now);
    return times.length > 0 ? Math.min(...times) : null;
  }, [accounts, now]);
  // A window that resets while the panel is open is gone from the provider's answer: re-read once.
  useEffect(() => {
    if (nextReset === null) return;
    const delay = Math.min(
      Math.max(nextReset + RESET_REFRESH_DELAY_MS - now, RESET_REFRESH_DELAY_MS),
      MAX_RESET_REFRESH_DELAY_MS,
    );
    const timer = setTimeout(() => {
      void refreshUsageLimits(
        environmentId,
        () => refreshProviders({ environmentId, input: {} }),
        true,
      ).catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [nextReset, now, environmentId, refreshProviders]);

  const benchmarkCandidates = useMemo(
    () => connectedBenchmarkCandidates(providerEntries, instanceId),
    [providerEntries, instanceId],
  );
  const freshness = limitsFreshness(
    accounts.map((account) => account.limits.checkedAt),
    now,
    "updated",
  );
  const openUsagePage = () => {
    saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "tokens" });
    void navigate({ to: "/usage" });
  };

  if (!shown) {
    const lead = active[0] ?? accounts[0] ?? null;
    const leadRows = lead ? glanceLimitRows(lead.limits.windows, now) : [];
    const leadWindows = lead
      ? [
          ...leadRows.flatMap((row) => (row.window ? [row.window] : [])),
          ...extraUsageWindows(lead.limits.windows, leadRows, now),
        ]
      : [];
    const tightest = leadWindows.reduce<UsageWindow | null>(
      (best, window) => (best === null || window.usedPercent > best.usedPercent ? window : best),
      null,
    );
    const more = accounts.length - 1;
    return (
      <ThreadDetailsFoldLine
        label="Limits"
        ariaLabel={
          lead && tightest
            ? `Limits: ${titleOf(lead)} ${usedPercentLabel(tightest.usedPercent)}% used. Show all accounts`
            : "Limits. Show all accounts"
        }
        onOpen={() => setShown(true)}
      >
        {lead ? (
          <>
            <ProviderInstanceIcon
              driverKind={lead.driver}
              displayName={titleOf(lead)}
              iconClassName="size-3.5"
            />
            {tightest ? (
              <>
                <span className="shrink-0 font-semibold tabular-nums">
                  {usedPercentLabel(tightest.usedPercent)}%
                </span>
                <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground">
                  {resetLabel(tightest, now)}
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">Limits pending</span>
            )}
            {more > 0 ? (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">+{more}</span>
            ) : null}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">No account</span>
        )}
      </ThreadDetailsFoldLine>
    );
  }

  return (
    <ThreadDetailsSection
      headingId="thread-details-limits-heading"
      title="Limits"
      actions={
        <>
          {freshness ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-2xs tabular-nums",
                      freshness.stale ? "text-warning-foreground" : "text-muted-foreground",
                    )}
                  />
                }
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    freshness.stale ? "bg-warning" : "bg-state",
                  )}
                />
                {freshness.label}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {freshness.stale
                  ? "These limits are over 10 minutes old. Refresh reads them again."
                  : "Read from each AI account's own limits"}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <ThreadDetailsFoldButton
            label="limits"
            tooltip="Fold limits to one line in every chat"
            onFold={() => setShown(false)}
          />
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {accounts.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div
              aria-hidden
              className={cn(
                LEDGER_GRID,
                "h-6 border-b border-border px-2.5 text-3xs font-medium text-muted-foreground",
              )}
            >
              <span>Account</span>
              {LEDGER_COLUMNS.map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>
            <ul aria-label="Limits by account" className="divide-y divide-border">
              {accounts.map((account) => (
                <AccountRows
                  key={account.id}
                  environmentId={environmentId}
                  account={account}
                  active={activeIds.has(account.id)}
                  now={now}
                />
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-2xs text-muted-foreground">
            No AI account signed in
            <Button
              size="xs"
              variant="outline"
              onClick={() => void navigate({ to: "/settings/providers" })}
            >
              Add account
            </Button>
          </div>
        )}
        <ThreadDetailsChatQuota
          environmentId={environmentId}
          threadId={usage.threadId}
          instanceId={instanceId}
          refreshKey={chatQuotaRefreshKey}
        />
        <div className="flex items-center gap-1 text-2xs">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void refreshNow()}
                  aria-label="Refresh limits"
                  className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                />
              }
            >
              <RefreshIcon size="xs" refreshing={refreshing} />
              <span>Refresh</span>
            </TooltipTrigger>
            <TooltipPopup side="top">Read the limits of every AI account again now</TooltipPopup>
          </Tooltip>
          <UsageBenchmarks
            compact
            environmentId={environmentId}
            candidates={benchmarkCandidates}
            onStartChat={usage.onStartChat}
            onStartArena={usage.onStartArena}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={openUsagePage}
                  className="ms-auto cursor-pointer rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                />
              }
            >
              Usage
            </TooltipTrigger>
            <TooltipPopup side="top">
              Open the Usage page with tokens per chat and model
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </ThreadDetailsSection>
  );
}
