import type { TradingAccountView, TradingState } from "@t3tools/contracts";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ProgressBar } from "~/components/commandCenter/charts";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

import { accountLabel } from "./addMenu.logic";
import {
  ACCOUNT_FILTERS,
  LIST_KEYS,
  STAGE_LABEL,
  accountMoney,
  consistencyProgress,
  matchesFilter,
  matchesQuery,
  nextSelection,
  sortAccounts,
  stageOf,
  targetProgress,
  type AccountFilter,
} from "./accounts.logic";
import { formatMoney } from "./dashboard.logic";
import { formatDay } from "./journal.logic";

const RESULT_LABEL = { open: "Open", passed: "Passed", failed: "Failed" } as const;
const VIA_LABEL = { purchase: "Purchase", reset: "Reset" } as const;

const STAGE_VARIANT = {
  sim: "secondary",
  evaluation: "info",
  funded: "success",
  closed: "outline",
} as const;

function StageChip({ account }: { readonly account: TradingAccountView }) {
  const stage = stageOf(account);
  return (
    <Badge size="sm" variant={STAGE_VARIANT[stage]}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

/** One account row: name, stage, room to Drawdown, then its progress. */
function AccountRow({
  account,
  selected,
  tabStop,
  onSelect,
  register,
}: {
  readonly account: TradingAccountView;
  readonly selected: boolean;
  readonly tabStop: boolean;
  readonly onSelect: (id: string) => void;
  readonly register: (id: string, node: HTMLLIElement | null) => void;
}) {
  const name = accountLabel(account);
  const target = targetProgress(account);
  const consistency = consistencyProgress(account);
  return (
    <li
      ref={(node) => register(account.id, node)}
      role="option"
      aria-selected={selected}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onSelect(account.id)}
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-lg border px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected
          ? "border-primary bg-surface-raised"
          : "border-transparent hover:bg-surface-raised",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{name}</span>
        <StageChip account={account} />
      </span>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {account.roomToDrawdown === null
            ? "No room set"
            : `${formatMoney(account.roomToDrawdown)} to Drawdown`}
        </span>
        {account.stage === "evaluation" && account.profitTarget !== null ? (
          <span className="tabular-nums">
            {formatMoney(account.balanceChange)} of {formatMoney(account.profitTarget)}
          </span>
        ) : account.stage === "funded" && account.winningDays !== null ? (
          <span className="tabular-nums">{account.winningDays} winning days</span>
        ) : null}
      </span>
      {target === null || account.stage !== "evaluation" ? null : (
        <ProgressBar percent={target} label={`${name}, ${target} percent to target`} />
      )}
      {consistency === null ? null : (
        <span className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {consistency.over
              ? `Best day over the ${account.consistencyPercent}% limit`
              : `Best day ${account.bestDayPercent ?? 0}% of ${account.consistencyPercent}% limit`}
          </span>
          <ProgressBar
            percent={consistency.percent}
            label={`${name}, best day at ${consistency.percent} percent of the consistency limit`}
          />
        </span>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-lg font-semibold tabular-nums">{value}</dd>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}

/** The detail pane when nothing is picked: the totals of every account. */
export function AccountTotals({ state }: { readonly state: TradingState }) {
  const { passed, finished, rate } = state.passRate;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">All accounts</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Firm fees" value={formatMoney(state.firmFees)} />
        <Stat label="Total cost" value={formatMoney(state.totalCost)} />
        <Stat label="Payouts" value={formatMoney(state.payouts)} />
        <Stat
          label="Pass rate"
          value={rate === null ? "None yet" : `${Math.round(rate * 100)}%`}
          note={
            finished === 0 ? "No finished Attempts" : `${passed} of ${finished} finished Attempts`
          }
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        Pick an account to see its Attempts, fees and Payouts.
      </p>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** The selected account: its Attempts, Firm fees and Payouts. */
export function AccountDetail({
  state,
  account,
}: {
  readonly state: TradingState;
  readonly account: TradingAccountView;
}) {
  const attempts = state.attempts.filter((attempt) => attempt.accountId === account.id);
  const money = accountMoney(state, account.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="truncate text-sm font-semibold">{accountLabel(account)}</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <StageChip account={account} />
          {account.platform}
        </span>
      </div>
      <DetailSection title="Attempts">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Attempts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Via</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => (
                <TableRow key={attempt.startedAt}>
                  <TableCell>{VIA_LABEL[attempt.via]}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{formatMoney(attempt.fee)}</span>
                  </TableCell>
                  <TableCell>{formatDay(attempt.startedAt.slice(0, 10))}</TableCell>
                  <TableCell>{RESULT_LABEL[attempt.result]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
      <DetailSection title="Fees">
        <p className="text-sm tabular-nums">{formatMoney(money.firmFees)} Firm fees</p>
      </DetailSection>
      <DetailSection title="Payouts">
        {money.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Payouts yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {money.payouts.map((payout) => (
                <li key={payout.at} className="flex justify-between py-1.5 text-sm">
                  <span>{formatDay(payout.at.slice(0, 10))}</span>
                  <span className="tabular-nums">{formatMoney(payout.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-medium tabular-nums">
              {formatMoney(money.payoutTotal)} total
            </p>
          </>
        )}
      </DetailSection>
    </div>
  );
}

/** The Accounts tab: search, filter chips and a sorted list on the left; the selected account on the right. */
export function AccountsView({ state }: { readonly state: TradingState }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = sortAccounts(
    state.accounts.filter(
      (account) => matchesFilter(account, filter) && matchesQuery(account, query),
    ),
  );
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const tabStopId = selected?.id ?? rows[0]?.id;
  const nodes = useRef(new Map<string, HTMLLIElement>());

  const register = (id: string, node: HTMLLIElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!LIST_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = nextSelection(
      rows.map((row) => row.id),
      selectedId,
      event.key,
    );
    if (next === null) return;
    setSelectedId(next);
    nodes.current.get(next)?.focus();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        <Input
          type="search"
          aria-label="Search accounts"
          placeholder="Search firm, product or last 4"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div role="group" aria-label="Filter accounts" className="flex flex-wrap gap-1.5">
          {ACCOUNT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === filter}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                item.id === filter
                  ? "bg-state text-state-foreground"
                  : "border border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No accounts match. Clear the search or pick All.
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label="Accounts"
            aria-orientation="vertical"
            onKeyDown={onListKey}
            className="flex flex-col gap-1"
          >
            {rows.map((row) => (
              <AccountRow
                key={row.id}
                account={row}
                selected={row.id === selected?.id}
                tabStop={row.id === tabStopId}
                onSelect={setSelectedId}
                register={register}
              />
            ))}
          </ul>
        )}
      </div>
      <section
        aria-label="Account details"
        className="min-w-0 rounded-xl border border-border bg-card p-4"
      >
        {selected === null ? (
          <AccountTotals state={state} />
        ) : (
          <AccountDetail state={state} account={selected} />
        )}
      </section>
    </div>
  );
}
