import type { TradingTradeView } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

import { formatSigned } from "./dashboard.logic";
import { ExportGuide } from "./ExportGuide";
import { JournalDay, signClass, type JournalDayProps } from "./JournalDay";
import { dayRows, formatDay, tradesByDay } from "./journal.logic";

export interface JournalViewProps extends Omit<JournalDayProps, "day" | "trades" | "totalTrades"> {
  /** Every trade in the workspace. The list and the day detail both read it. */
  readonly trades: readonly TradingTradeView[];
  /** Today as `YYYY-MM-DD`. Today always has a row, even with no trades. */
  readonly today: string;
  readonly selectedDay: string;
  readonly onSelectDay: (day: string) => void;
}

/** Days on the left, the picked day on the right. Stacked on a narrow screen. */
export function JournalView({
  trades,
  today,
  selectedDay,
  onSelectDay,
  note,
  ...dayProps
}: JournalViewProps) {
  const rows = dayRows(trades, today);
  const detail = tradesByDay(trades).find((day) => day.day === selectedDay);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav aria-label="Days" className="md:w-56 md:shrink-0">
          <ul className="flex flex-col gap-1">
            {rows.map((row) => {
              const selected = row.day === selectedDay;
              return (
                <li key={row.day}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelectDay(row.day)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-start text-sm",
                      selected
                        ? "border-border bg-accent"
                        : "border-transparent hover:bg-accent/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatDay(row.day)}
                        {row.day === today ? " · Today" : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.count === 0
                          ? "No trades"
                          : `${row.count} ${row.count === 1 ? "trade" : "trades"}`}
                        {row.breaks > 0
                          ? ` · ${row.breaks} rule ${row.breaks === 1 ? "break" : "breaks"}`
                          : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", signClass(row.pnl))}>
                      {formatSigned(row.pnl)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">
          <JournalDay
            {...dayProps}
            key={selectedDay}
            day={selectedDay}
            trades={detail?.trades ?? []}
            totalTrades={trades.length}
            note={note}
          />
        </div>
      </div>
      <details
        id="topstepx-export-guide"
        className="rounded-xl border border-border bg-card px-4 py-3"
      >
        <summary className="cursor-pointer text-sm font-medium">
          How to export from TopstepX
        </summary>
        <ExportGuide className="mt-3" />
      </details>
    </div>
  );
}
