import type { TradingAccountView, TradingTradeView } from "@t3tools/contracts";
import { useMemo } from "react";

import { cn } from "~/lib/utils";

import { formatSigned } from "./dashboard.logic";
import {
  RULE_CHECK_WAITING,
  TOPSTEPX_EXPORT_STEPS,
  accountLabel,
  formatDay,
  gradeLine,
  tradeTime,
  tradesByDay,
} from "./journal.logic";

/** The 5 TopstepX export steps as an ordered list. */
export function ExportGuide({ className }: { readonly className?: string }) {
  return (
    <ol className={cn("list-decimal space-y-1 ps-5 text-sm text-muted-foreground", className)}>
      {TOPSTEPX_EXPORT_STEPS.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

const signClass = (amount: number) =>
  amount > 0 ? "text-success-foreground" : amount < 0 ? "text-destructive-foreground" : "";

/** Imported trades by day, newest day first, with each day's net dollars. */
export function JournalView({
  trades,
  accounts,
}: {
  readonly trades: readonly TradingTradeView[];
  readonly accounts: readonly TradingAccountView[];
}) {
  const days = useMemo(() => tradesByDay(trades), [trades]);
  const names = useMemo(
    () => new Map(accounts.map((account) => [account.id, accountLabel(account)])),
    [accounts],
  );
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.day} className="rounded-xl border border-border bg-card">
          <h2 className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-medium">
            {formatDay(day.day)}
            <span className={cn("tabular-nums", signClass(day.pnl))}>{formatSigned(day.pnl)}</span>
          </h2>
          {day.trades.some((trade) => trade.check === "waiting") ? (
            <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              {RULE_CHECK_WAITING}
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {day.trades.map((trade) => (
              <li key={trade.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                  {tradeTime(trade.at)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {[trade.side === "short" ? "Short" : "Long", trade.size, trade.contract]
                      .filter((part) => part !== undefined)
                      .join(" ")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {names.get(trade.accountId) ?? "Unknown account"}
                  </span>
                  {gradeLine(trade) ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {gradeLine(trade)}
                    </span>
                  ) : null}
                </span>
                {trade.points === undefined ? null : (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {trade.points > 0 ? "+" : ""}
                    {trade.points} pts
                  </span>
                )}
                <span className={cn("w-20 shrink-0 text-end tabular-nums", signClass(trade.pnl))}>
                  {formatSigned(trade.pnl)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <details className="rounded-xl border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          How to export from TopstepX
        </summary>
        <ExportGuide className="mt-3" />
      </details>
    </div>
  );
}
