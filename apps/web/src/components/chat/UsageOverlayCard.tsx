import type {
  EnvironmentId,
  ModelSelection,
  ProviderInstanceId,
  ThreadId,
  UsageLimitsReport,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { limitsNotice } from "@t3tools/shared/usageLimits";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";

import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useConnectedUsageAccounts } from "../../hooks/useConnectedUsageAccounts";
import { type LimitView } from "../../hooks/useLimitView";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useEnvironmentSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import { connectedBenchmarkCandidates } from "../../lib/modelBenchmarks";
import {
  accountFreshnessLabel,
  accountTitle,
  compactWindowLabel,
  contextWindowFigures,
  extraWindowSummaries,
  formatResetCountdown,
  formatTokenCount,
  glanceLimitRows,
  groupAccountsByProvider,
  limitsFreshness,
  percentText,
  type ProviderAccountGroup,
  siblingAccountSummary,
  splitAccountHeader,
  usageSeverity,
  usedPercentLabel,
} from "../../lib/usageLimitsPopover";
import { cn } from "../../lib/utils";
import { getAppModelOptionsForInstance } from "../../modelSelection";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { useThreadContextBreakdown } from "../../state/queries";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { providerClients } from "../settings/providerDriverMeta";
import { Button } from "../ui/button";
import { Dialog, DialogPanel, DialogPopup } from "../ui/dialog";
import { RefreshIcon } from "../ui/refresh-icon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resetCreditsSummary } from "../usage/UsageLimits";
import { readUsagePagePreferences, saveUsagePagePreferences } from "../usage/usagePagePreferences";
import type { StartBenchmarkArena } from "./BenchmarkExplorer";
import { barSegments } from "./ContextBreakdown.logic";
import { deriveTrimSuggestions } from "./ContextTrim.logic";
import { deriveWasteFindings } from "./ContextWaste.logic";
import { DetailedContextBreakdownView } from "./DetailedContextBreakdownView";
import { UsageBar, UsageRing } from "./PlanUsageLimits";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { UsageBenchmarks } from "./UsageBenchmarks";

type Account = UsageLimitsReport["accounts"][number];

const FIXED_LIMIT_VIEW: LimitView = "left";

/** How often the open card re-reads account limits; the server caches probes inside this. */
const LIMITS_REFRESH_MS = 5 * 60_000;

/** After a window resets, wait this long before the automatic re-read. */
const RESET_REFRESH_DELAY_MS = 5_000;
const MAX_RESET_REFRESH_DELAY_MS = 24 * 60 * 60_000;

const MAX_CONTEXT_SEGMENTS = 6;
const MAX_TRIM_ROWS = 3;
const TRIM_KIND_LABEL = {
  mcp: "Tool",
  skill: "Skill",
  agent: "Helper",
  memory: "File",
  "tool-results": "Shorten:",
} as const;
const sumTokens = (rows: ReadonlyArray<{ readonly tokens: number }> | undefined) =>
  rows?.reduce((total, row) => total + row.tokens, 0) ?? 0;

function driverNameOf(driver: Account["driver"]): string {
  return providerClients.get(driver)?.label ?? String(driver);
}

function titleOf(account: Account): string {
  return accountTitle(
    { displayName: account.displayName, sourceLabel: account.sourceLabel },
    account.displayName ?? driverNameOf(account.driver),
  );
}

function resolveAccountProviderEntry(
  account: Account,
  providerEntries: ReadonlyArray<ProviderInstanceEntry>,
): ProviderInstanceEntry | null {
  if (account.instanceId) {
    const direct = providerEntries.find((entry) => entry.instanceId === account.instanceId);
    if (direct) return direct;
  }
  const email = account.email?.trim().toLowerCase();
  const fingerprint = account.limits.credentialFingerprint;
  const customName = account.displayName?.trim().toLowerCase();
  return (
    providerEntries.find((entry) => {
      if (entry.driverKind !== account.driver) return false;
      const entryEmail = entry.snapshot.auth.email?.trim().toLowerCase();
      if (email && entryEmail && email === entryEmail) return true;
      const entryFp = entry.snapshot.usageLimits?.credentialFingerprint;
      if (fingerprint && entryFp && fingerprint === entryFp) return true;
      if (customName && entry.displayName.trim().toLowerCase() === customName) return true;
      return false;
    }) ?? null
  );
}

/** Compact context strip: segmented bar + progressive disclosure for category details. */
function ContextSegments({
  environmentId,
  threadId,
  usedTokens,
  expandedDetails,
  onToggleExpanded,
  onOpenDetails,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly usedTokens: number;
  readonly expandedDetails: boolean;
  readonly onToggleExpanded: () => void;
  readonly onOpenDetails: () => void;
}) {
  const query = useThreadContextBreakdown({ environmentId, threadId });
  const { refresh } = query;
  // Re-read after each reported usage change so the split follows the conversation.
  useEffect(() => {
    refresh();
  }, [usedTokens, refresh]);

  const segments = useMemo(
    () => (query.data ? barSegments(query.data.categories, query.data.maxTokens) : []),
    [query.data],
  );
  const trim = useMemo(() => (query.data ? deriveTrimSuggestions(query.data) : []), [query.data]);
  const waste = useMemo(() => (query.data ? deriveWasteFindings(query.data) : []), [query.data]);
  const used = segments.filter((segment) => segment.kind === "used" && segment.tokens > 0);
  if (used.length === 0) return null;
  const top = used.slice(0, MAX_CONTEXT_SEGMENTS);
  const named = new Set(top.map((segment) => segment.name.toLowerCase()));
  const extras: Array<{ name: string; label?: string; title?: string; tokens: number }> = [
    { name: "Skills", tokens: sumTokens(query.data?.skills) },
    {
      name: "Connected tools",
      label: "Tools",
      title: "Tools",
      tokens: sumTokens(query.data?.mcpTools),
    },
    { name: "Agents", label: "Helpers", tokens: sumTokens(query.data?.agents) },
  ].filter(
    (extra) =>
      extra.tokens > 0 &&
      !named.has(extra.name.toLowerCase()) &&
      !(extra.title && named.has(extra.title.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expandedDetails}
              aria-label="Toggle chat memory breakdown"
              className="flex h-1 w-full cursor-pointer gap-px overflow-hidden rounded-full bg-muted/70"
            />
          }
        >
          {segments
            .filter((segment) => segment.width > 0)
            .map((segment) => (
              <div
                key={segment.name}
                className={cn(segment.fill, "min-w-0.5 opacity-85")}
                style={{ width: `${segment.width}%` }}
              />
            ))}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          Click to {expandedDetails ? "hide" : "show"} memory categories ({used.length} active)
        </TooltipPopup>
      </Tooltip>

      {expandedDetails ? (
        <div className="flex flex-col gap-1.5 pt-0.5">
          <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
            {top.map((segment) => (
              <li key={segment.name} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", segment.fill)} />
                <span className="min-w-0 flex-1 truncate">{segment.name}</span>
                <span className="tabular-nums text-foreground">
                  {formatTokenCount(segment.tokens)}
                </span>
              </li>
            ))}
            {extras.map((extra) => (
              <li key={extra.name} className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={extra.title === "MCP tools" ? "These use MCP servers." : extra.title}
                >
                  {extra.label ?? extra.name}
                </span>
                <span className="tabular-nums text-foreground">
                  {formatTokenCount(extra.tokens)}
                </span>
              </li>
            ))}
          </ul>
          {trim.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-border/50 pt-1">
              <span className="text-2xs font-medium text-foreground">Trim: loaded every turn</span>
              <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                {trim.slice(0, MAX_TRIM_ROWS).map((item) => (
                  <li key={item.key} className="flex min-w-0 items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
                        {TRIM_KIND_LABEL[item.kind]} {item.label}
                        {item.unused ? " (not used in this chat)" : ""}
                      </TooltipTrigger>
                      <TooltipPopup>{item.label}</TooltipPopup>
                    </Tooltip>
                    <span className="tabular-nums text-foreground">
                      {item.estimated ? "~" : ""}
                      {formatTokenCount(item.tokens)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {waste.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-t border-border/50 pt-1">
              <span className="text-2xs font-medium text-foreground">Waste: repeated work</span>
              <ul className="flex flex-col gap-0.5 text-2xs text-muted-foreground">
                {waste.map((item) => (
                  <li key={item.key} className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="tabular-nums text-foreground">
                      ~{formatTokenCount(item.tokens)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpenDetails}
            className="cursor-pointer self-start text-2xs text-muted-foreground transition-colors hover:text-foreground"
          >
            See the full list
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Single inline quota row (Label | Bar | % left | Reset) with full non-truncated reset countdown.
 */
function InlineWindowRow({
  label,
  window,
  now,
}: {
  readonly label: string;
  readonly window: NonNullable<ReturnType<typeof glanceLimitRows>[number]["window"]> | null;
  readonly now: number;
}) {
  const shortLabel = compactWindowLabel(window, label);
  if (!window) {
    return (
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="truncate">{shortLabel}</span>
        <div className="h-1 w-full rounded-full bg-muted/60" />
        <span className="whitespace-nowrap text-right tabular-nums">–</span>
        <span className="whitespace-nowrap text-right">not shown</span>
      </div>
    );
  }
  const countdown = formatResetCountdown(window.resetsAt, now, true);
  const fullReset = formatResetCountdown(window.resetsAt, now, false);
  const leftPct = percentText(window.usedPercent, FIXED_LIMIT_VIEW);
  const resetDisplay = countdown
    ? countdown === "now"
      ? "resets now"
      : `resets ${countdown}`
    : "–";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] items-center gap-1.5 text-2xs leading-tight" />
        }
      >
        <span className="truncate text-muted-foreground">{shortLabel}</span>
        <UsageBar
          fill={FIXED_LIMIT_VIEW}
          usedPercent={window.usedPercent}
          label={`${label}: ${leftPct}`}
          className="h-1"
        />
        <span className="whitespace-nowrap text-right font-semibold tabular-nums text-foreground">
          {leftPct}
        </span>
        <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
          {resetDisplay}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="top">
        {label}: {leftPct}
        {fullReset ? ` · ${fullReset}` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Sleek inset provider card:
 * Provider header with plan/account qualifier and per-card updated age,
 * inline 4-column quota bars (% left + full reset countdown), and a bottom sub-pill for sibling accounts.
 */
function ProviderAccountCard({
  group,
  activeIds,
  now,
  onSwapAccount,
}: {
  readonly group: ProviderAccountGroup;
  readonly activeIds: ReadonlySet<string>;
  readonly now: number;
  readonly onSwapAccount: (driver: Account["driver"], nextAccount: Account) => void;
}) {
  const { primary, siblings, hasActive } = group;
  const driverLabel = driverNameOf(primary.driver);
  const { primaryName, subtitle } = splitAccountHeader(primary, driverLabel);
  const rows = glanceLimitRows(primary.limits.windows, now);
  const notice = limitsNotice(primary.limits);
  const ageLabel = accountFreshnessLabel(primary.limits.checkedAt, now);
  const extras = extraWindowSummaries(primary.limits.windows, rows, FIXED_LIMIT_VIEW, now);
  const siblingSummaries = useMemo(
    () =>
      siblings.map((sibling) => siblingAccountSummary(sibling, driverLabel, FIXED_LIMIT_VIEW, now)),
    [siblings, driverLabel, now],
  );
  const creditsText =
    primary.limits.resetCredits && primary.limits.resetCredits.availableCount > 0
      ? resetCreditsSummary(primary.limits.resetCredits, now, true)
      : null;
  const hasSubPill = siblingSummaries.length > 0 || extras.length > 0 || creditsText !== null;
  const nextSibling = siblings[0] ?? null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-2 transition-colors",
        hasActive
          ? "border-border/80 bg-muted/35"
          : "border-border/45 bg-muted/15 hover:border-border/65",
      )}
    >
      {/* Card Header */}
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProviderInstanceIcon
            driverKind={primary.driver}
            displayName={titleOf(primary)}
            iconClassName="size-3.5"
          />
          <span className="truncate text-xs font-semibold leading-none text-foreground">
            {primaryName}
          </span>
          {subtitle ? (
            <span className="truncate text-2xs leading-none text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {activeIds.has(primary.id) ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-3xs font-medium leading-none text-success" />
                }
              >
                <span aria-hidden className="size-1 rounded-full bg-success" />
                Active
              </TooltipTrigger>
              <TooltipPopup side="top">
                This chat is currently using {titleOf(primary)}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          {ageLabel ? (
            <span className="text-3xs tabular-nums leading-none text-muted-foreground">
              {ageLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* Inline Quota Rows */}
      {notice || rows.length === 0 ? (
        <span className="text-2xs text-muted-foreground">{notice ?? "Limits pending"}</span>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <InlineWindowRow key={row.key} label={row.label} window={row.window} now={now} />
          ))}
        </div>
      )}

      {/* Compact Bottom Sub-Pill (Sibling accounts, extra model pools, reset credits) */}
      {hasSubPill ? (
        <div className="flex min-w-0 items-center justify-between gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-3xs text-muted-foreground tabular-nums">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
            {extras.map((extra) => (
              <span key={extra.id} className="shrink-0">
                {extra.label}{" "}
                <strong className="font-semibold text-foreground">{extra.value} left</strong>
              </span>
            ))}
            {siblingSummaries.length > 0 ? (
              <span className="truncate">
                {extras.length > 0 ? "· " : ""}
                {siblingSummaries.map((sib, idx) => (
                  <span key={sib.id}>
                    {idx > 0 ? " · " : ""}
                    {sib.name}:{" "}
                    <strong className="font-medium text-foreground">{sib.summary}</strong>
                  </span>
                ))}
              </span>
            ) : null}
            {creditsText ? (
              <span className="truncate">
                {extras.length > 0 || siblingSummaries.length > 0 ? "· " : ""}
                <strong className="font-semibold text-foreground">{creditsText}</strong>
              </span>
            ) : null}
          </div>
          {nextSibling ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => onSwapAccount(primary.driver, nextSibling)}
                    aria-label={`Switch active ${primaryName} account to ${titleOf(nextSibling)}`}
                    className="shrink-0 cursor-pointer rounded bg-muted px-1.5 py-0.5 text-3xs font-medium text-foreground transition-colors hover:bg-muted/80"
                  />
                }
              >
                Swap
              </TooltipTrigger>
              <TooltipPopup side="top">
                Switch active chat account to {titleOf(nextSibling)} ({siblings.length + 1}{" "}
                {primaryName} accounts connected)
              </TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The one usage card: header with live updated timestamp, compact context memory strip,
 * provider-grouped inset account cards with active account Swap, and a sleek action footer.
 */
export const UsageOverlayCard = memo(function UsageOverlayCard({
  environmentId,
  threadId,
  instanceId,
  modelLabel,
  effortLabel,
  contextWindow,
  providerEntries,
  onStartChat,
  onStartArena,
  onSelectAccount,
}: {
  readonly environmentId: EnvironmentId;
  /** Null for drafts, which have no server-side context to break down yet. */
  readonly threadId: ThreadId | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly modelLabel: string;
  readonly effortLabel: string | null;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly providerEntries: ReadonlyArray<ProviderInstanceEntry>;
  /** Null when no project is active, which hides the row action. */
  readonly onStartChat: ((selection: ModelSelection) => void) | null;
  readonly onStartArena: StartBenchmarkArena | null;
  readonly onSelectAccount?:
    | ((instanceId: ProviderInstanceId, selection: ModelSelection) => void)
    | null;
}) {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateClientSettings();
  const { active, others } = useConnectedUsageAccounts(environmentId, instanceId);
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [selectedPrimaryByDriver, setSelectedPrimaryByDriver] = useState<Record<string, string>>(
    {},
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  // Follow external account changes from the composer model picker.
  useEffect(() => {
    setSelectedPrimaryByDriver({});
  }, [instanceId]);

  // Re-read every account's limits from their source while the card is open and
  // the window is visible, so the numbers follow the provider without a click.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshProviders({ environmentId, input: {} });
      }
    }, LIMITS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [environmentId, refreshProviders]);

  const figures = contextWindowFigures(contextWindow);
  const percent =
    figures.state === "reported" && figures.usedPercent != null
      ? usedPercentLabel(figures.usedPercent)
      : null;
  const severity = percent === null ? "normal" : usageSeverity(percent);
  const primary = active[0] ?? null;
  const activeIds = useMemo(() => new Set(active.map((account) => account.id)), [active]);
  const accounts = useMemo(() => [...active, ...others], [active, others]);
  const providerGroups = useMemo(
    () => groupAccountsByProvider(accounts, activeIds, selectedPrimaryByDriver),
    [accounts, activeIds, selectedPrimaryByDriver],
  );
  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshUsageLimits(environmentId, () => refreshProviders({ environmentId, input: {} }));
    } catch {
      // The bars keep their last numbers; the freshness line shows they are old.
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
  // A window that resets while the card is open is gone from the provider's answer: re-read once.
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

  const contextLine =
    figures.state === "reported"
      ? `${formatTokenCount(figures.usedTokens)} / ${figures.maxTokens ? formatTokenCount(figures.maxTokens) : "unlimited"}`
      : figures.state === "pending"
        ? `0 / ${formatTokenCount(figures.maxTokens)}`
        : "Empty context";

  const handleSwapAccount = (driver: Account["driver"], nextAccount: Account) => {
    setSelectedPrimaryByDriver((prev) => ({ ...prev, [driver]: nextAccount.id }));
    const targetEntry = resolveAccountProviderEntry(nextAccount, providerEntries);
    if (!targetEntry) return;
    const targetInstanceId = targetEntry.instanceId;
    const draftStore = useComposerDraftStore.getState();
    const rawDraftId =
      typeof routeParams.draftId === "string" && routeParams.draftId.trim().length > 0
        ? DraftId.make(routeParams.draftId.trim())
        : null;
    const composerTarget = threadId !== null ? scopeThreadRef(environmentId, threadId) : rawDraftId;
    const currentDraft = composerTarget ? draftStore.getComposerDraft(composerTarget) : null;
    const preferredModel =
      currentDraft?.modelSelectionByProvider[targetInstanceId]?.model ??
      (instanceId ? currentDraft?.modelSelectionByProvider[instanceId]?.model : undefined) ??
      draftStore.stickyModelSelectionByProvider[targetInstanceId]?.model ??
      (instanceId ? draftStore.stickyModelSelectionByProvider[instanceId]?.model : undefined) ??
      null;
    const options = getAppModelOptionsForInstance(settings, targetEntry, preferredModel);
    const resolvedModel =
      resolveSelectableModel(targetEntry.driverKind, preferredModel, options) ??
      options.find((option) => option.isDefault)?.slug ??
      options[0]?.slug ??
      targetEntry.models[0]?.slug ??
      null;
    if (!resolvedModel) return;
    const rememberedOptions =
      currentDraft?.modelSelectionByProvider[targetInstanceId]?.options ??
      draftStore.stickyOptionsByModelByProvider[targetInstanceId]?.[resolvedModel];
    const nextSelection: ModelSelection =
      rememberedOptions && rememberedOptions.length > 0
        ? { instanceId: targetInstanceId, model: resolvedModel, options: [...rememberedOptions] }
        : { instanceId: targetInstanceId, model: resolvedModel };
    if (composerTarget) {
      draftStore.setModelSelection(composerTarget, nextSelection, {
        explicit: true,
        replaceOptions: true,
      });
    }
    draftStore.setStickyModelSelection(nextSelection);
    onSelectAccount?.(targetInstanceId, nextSelection);
  };

  const handleOpenTextUsedDetails = () => {
    saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "tokens" });
    void navigate({ to: "/usage" });
  };

  return (
    <div
      data-usage-overlay
      className="pointer-events-none z-30 mt-2 ml-3 max-w-[calc(100%-1.5rem)] shrink-0 self-start"
    >
      {/* Narrow column: one line, expands in place. */}
      {!expanded ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="Show memory and accounts"
                className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-background/95 py-1 pr-3 pl-1.5 text-xs shadow-sm backdrop-blur transition-colors hover:bg-muted/60 @7xl:hidden"
              />
            }
          >
            <UsageRing
              fill="used"
              percent={percent}
              size={20}
              strokeWidth={2.5}
              severity={severity}
            />
            <span className="tabular-nums font-medium">
              {percent === null ? "Context" : `${percent}%`}
            </span>
            {primary ? (
              <ProviderInstanceIcon
                driverKind={primary.driver}
                displayName={titleOf(primary)}
                iconClassName="size-3.5"
              />
            ) : null}
            <ChevronDownIcon aria-hidden className="size-3 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Expand subscription limits and chat memory card</TooltipPopup>
        </Tooltip>
      ) : null}

      <section
        aria-label="Memory and accounts"
        className={cn(
          "pointer-events-auto w-80 max-w-full max-h-[calc(100dvh-9rem)] [scrollbar-width:thin] overflow-y-auto flex-col gap-2 rounded-xl border border-border/60 bg-popover/95 p-2.5 text-popover-foreground shadow-lg backdrop-blur-md",
          expanded ? "flex" : "hidden @7xl:flex",
        )}
      >
        {/* Top Bar: Subscription Limits + Live green dot & updated timestamp */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="truncate text-xs font-semibold tracking-tight text-foreground">
            Subscription Limits
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {freshness ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-2xs tabular-nums",
                        freshness.stale ? "text-destructive" : "text-muted-foreground",
                      )}
                    />
                  }
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      freshness.stale ? "bg-destructive" : "bg-success",
                    )}
                  />
                  <span>{freshness.label}</span>
                </TooltipTrigger>
                <TooltipPopup side="bottom">
                  {freshness.stale
                    ? "Quota readings are over 10 minutes old. Click Refresh below to re-probe."
                    : "Live subscription quota telemetry from your connected providers"}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Collapse this card"
              className={cn("@7xl:hidden size-5", expanded ? "" : "hidden")}
              onClick={() => setExpanded(false)}
            >
              <ChevronUpIcon aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Sleek Single-Line Context Strip */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/45 bg-muted/20 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <UsageRing
                fill="used"
                percent={percent}
                size={18}
                strokeWidth={2.25}
                severity={severity}
                className="text-4xs font-semibold tabular-nums"
              />
              <span className="truncate text-xs font-medium text-foreground">
                {modelLabel || "No model selected"}
              </span>
              {effortLabel ? (
                <span className="shrink-0 text-2xs text-muted-foreground">· {effortLabel}</span>
              ) : null}
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => (threadId ? setContextExpanded((prev) => !prev) : undefined)}
                    className={cn(
                      "shrink-0 text-2xs tabular-nums text-muted-foreground transition-colors",
                      threadId ? "cursor-pointer hover:text-foreground" : "cursor-default",
                    )}
                  />
                }
              >
                {contextLine}
                {percent !== null ? ` · ${percent}%` : ""}
              </TooltipTrigger>
              <TooltipPopup side="top">
                Chat memory used in this conversation.{" "}
                {threadId ? "Click to toggle category breakdown." : "Send a message to measure."}
              </TooltipPopup>
            </Tooltip>
          </div>
          {threadId && figures.state === "reported" ? (
            <ContextSegments
              environmentId={environmentId}
              threadId={threadId}
              usedTokens={figures.usedTokens}
              expandedDetails={contextExpanded}
              onToggleExpanded={() => setContextExpanded((prev) => !prev)}
              onOpenDetails={() => setDetailsOpen(true)}
            />
          ) : (
            <UsageBar
              fill="used"
              usedPercent={percent ?? 0}
              label={`Chat memory: ${percent ?? 0}% used`}
              className="h-1"
            />
          )}
        </div>

        {/* Provider-Grouped Inset Cards */}
        {providerGroups.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {providerGroups.map((group) => (
              <ProviderAccountCard
                key={group.driver}
                group={group}
                activeIds={activeIds}
                now={now}
                onSwapAccount={handleSwapAccount}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 p-2 text-2xs text-muted-foreground">
            No AI account signed in. Add an AI account in Settings to track subscription limits.
          </p>
        )}

        {/* Compact Single-Line Footer Bar */}
        <div className="flex items-center justify-between gap-1 border-t border-border/50 pt-1.5 text-2xs">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={() => void refreshNow()}
                    aria-label="Refresh subscription limits"
                    className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                  />
                }
              >
                <RefreshIcon size="xs" refreshing={refreshing} />
                <span>Refresh</span>
              </TooltipTrigger>
              <TooltipPopup side="top">
                Re-read quota windows from all connected AI providers now
              </TooltipPopup>
            </Tooltip>

            <UsageBenchmarks
              compact
              environmentId={environmentId}
              candidates={benchmarkCandidates}
              onStartChat={onStartChat}
              onStartArena={onStartArena}
            />
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={handleOpenTextUsedDetails}
                    className="cursor-pointer rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  />
                }
              >
                More details
              </TooltipTrigger>
              <TooltipPopup side="top">Open detailed token and text usage breakdown</TooltipPopup>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Turn off this card"
                    className="size-5 text-muted-foreground hover:text-foreground"
                    onClick={() => void updateSettings({ usageOverlayEnabled: false })}
                  />
                }
              >
                <XIcon aria-hidden className="size-3" />
              </TooltipTrigger>
              <TooltipPopup side="top">Hide subscription limits card</TooltipPopup>
            </Tooltip>
          </div>
        </div>
      </section>

      {threadId ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogPopup className="max-w-2xl">
            <DialogPanel>
              <DetailedContextBreakdownView
                environmentId={environmentId}
                threadId={threadId}
                onBack={() => setDetailsOpen(false)}
              />
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      ) : null}
    </div>
  );
});
