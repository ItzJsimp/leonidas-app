import type { TradingAccountView, TradingTradeView } from "@t3tools/contracts";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import { accountLabel } from "./addMenu.logic";
import { formatSigned } from "./dashboard.logic";
import { ExportGuide } from "./ExportGuide";
import {
  DAY_NOTE_TEMPLATE,
  NOTE_LIMIT,
  RULE_CHECK_WAITING,
  formatDay,
  gradeLine,
  isImageType,
  screenshotParts,
  setupChoices,
  tradeWhen,
} from "./journal.logic";

/** The text colour of a dollar or point amount: green up, red down. */
export const signClass = (amount: number) =>
  amount > 0 ? "text-success-foreground" : amount < 0 ? "text-destructive-foreground" : "";

/** The day note as the Journal shows it. A failed read shows no editor, so a save cannot wipe the file. */
export type DayNoteState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly text: string };

export interface JournalDayProps {
  /** The day shown, as `YYYY-MM-DD`. */
  readonly day: string;
  /** The trades of that day, in time order. */
  readonly trades: readonly TradingTradeView[];
  /** Every trade in the workspace, so an empty day can tell "no trades yet" from "this day is empty". */
  readonly totalTrades: number;
  readonly accounts: readonly TradingAccountView[];
  /** The pack setups. Null when no pack is linked. */
  readonly setups: readonly { readonly id: string; readonly name: string }[] | null;
  readonly note: DayNoteState;
  readonly onAddTrade: () => void;
  readonly onReview: () => void;
  readonly onTag: (trade: TradingTradeView, setup: string) => Promise<string | null>;
  readonly onPaste: (trade: TradingTradeView, file: File) => Promise<string | null>;
  readonly onSaveNote: (note: string) => Promise<string | null>;
  /** Shows a saved screenshot. The parent owns the read. */
  readonly renderShot: (screenshot: string, alt: string) => ReactNode;
}

/** One day: its totals, its trades with setup tags and screenshots, and its end-of-day note. */
export function JournalDay({
  day,
  trades,
  totalTrades,
  accounts,
  setups,
  note,
  onAddTrade,
  onReview,
  onTag,
  onPaste,
  onSaveNote,
  renderShot,
}: JournalDayProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const pnl = trades.reduce((sum, trade) => sum + Math.round(trade.pnl * 100), 0) / 100;
  const breaks = trades.reduce((sum, trade) => sum + (trade.ruleBreaks?.length ?? 0), 0);
  const names = new Map(accounts.map((account) => [account.id, account]));
  const title = formatDay(day);

  return (
    <section aria-labelledby="journal-day-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="journal-day-title" className="text-lg font-medium">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {trades.length} {trades.length === 1 ? "trade" : "trades"}
            {breaks > 0 ? ` · ${breaks} ${breaks === 1 ? "rule break" : "rule breaks"}` : ""}
            {" · "}
            <span className={cn("tabular-nums", signClass(pnl))}>{formatSigned(pnl)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAddTrade}>
            Add trade
          </Button>
          <Button variant="outline" onClick={onReview}>
            Review with AI
          </Button>
        </div>
      </header>

      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}

      {trades.length === 0 ? (
        totalTrades === 0 ? (
          <Empty size="compact">
            <EmptyHeader>
              <EmptyDescription>
                Export your trades from TopstepX. They show here with no other step.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ExportGuide className="text-start" />
              <Button
                variant="outline"
                render={<a href="https://topstepx.com" target="_blank" rel="noreferrer" />}
              >
                Open TopstepX
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty size="compact">
            <EmptyHeader>
              <EmptyDescription>
                No trades on {title}. Export this day from TopstepX, or add a trade by hand.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a className="text-sm underline" href="#topstepx-export-guide">
                How to export from TopstepX
              </a>
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="rounded-xl border border-border bg-card">
          {trades.some((trade) => trade.check === "waiting") ? (
            <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              {RULE_CHECK_WAITING}
            </p>
          ) : null}
          <ul aria-label={`Trades on ${title}`} className="divide-y divide-border">
            {trades.map((trade) => (
              <TradeRow
                key={trade.id}
                day={day}
                trade={trade}
                account={names.get(trade.accountId)}
                setups={setups}
                onTag={onTag}
                onPaste={onPaste}
                renderShot={renderShot}
                report={setNotice}
              />
            ))}
          </ul>
        </div>
      )}

      {note.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading the note…</p>
      ) : note.status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          The note could not load. Reload the Journal to try again.
        </p>
      ) : (
        <DayNote key={day} day={day} text={note.text} onSave={onSaveNote} />
      )}
    </section>
  );
}

function TradeRow({
  day,
  trade,
  account,
  setups,
  onTag,
  onPaste,
  renderShot,
  report,
}: {
  readonly day: string;
  readonly trade: TradingTradeView;
  readonly account: TradingAccountView | undefined;
  readonly setups: readonly { readonly id: string; readonly name: string }[] | null;
  readonly onTag: (trade: TradingTradeView, setup: string) => Promise<string | null>;
  readonly onPaste: (trade: TradingTradeView, file: File) => Promise<string | null>;
  readonly renderShot: (screenshot: string, alt: string) => ReactNode;
  readonly report: (message: string | null) => void;
}) {
  const label = [trade.side === "short" ? "Short" : "Long", trade.size, trade.contract]
    .filter((part) => part !== undefined)
    .join(" ");
  const grade = gradeLine(trade);
  const shotPath =
    trade.screenshot !== undefined && screenshotParts(trade.screenshot) !== null
      ? trade.screenshot
      : undefined;
  const options = setups === null ? null : setupChoices(setups, trade.setup);

  return (
    <li
      tabIndex={0}
      aria-label={`${label} at ${tradeWhen(trade)}. Paste a screenshot here.`}
      className="flex flex-col gap-2 px-4 py-3 text-sm"
      onPaste={(event) => {
        const file = [...event.clipboardData.files].find((item) => isImageType(item.type));
        if (!file) return;
        event.preventDefault();
        void onPaste(trade, file).then(report);
      }}
    >
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{tradeWhen(trade)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate">{label}</span>
            {account?.stage === "sim" ? <Badge variant="outline">Sim</Badge> : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {account ? accountLabel(account) : "Unknown account"}
          </span>
          {grade ? (
            <span className="block truncate text-xs text-muted-foreground">{grade}</span>
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
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {options === null ? (
          <p className="text-xs text-muted-foreground">Link a pack to tag setups</p>
        ) : options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No setups in the pack yet</p>
        ) : (
          <Select
            value={trade.setup ?? ""}
            items={Object.fromEntries(options)}
            onValueChange={(value) => {
              if (typeof value === "string" && value !== "" && value !== trade.setup) {
                void onTag(trade, value).then(report);
              }
            }}
          >
            <SelectTrigger aria-label={`Setup for ${label} on ${formatDay(day)}`} className="w-56">
              <SelectValue placeholder="Tag a setup" />
            </SelectTrigger>
            <SelectPopup>
              {options.map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}
        {shotPath ? (
          renderShot(shotPath, `Screenshot of ${label} on ${formatDay(day)}`)
        ) : (
          <p className="text-xs text-muted-foreground">Paste a screenshot on this row</p>
        )}
      </div>
    </li>
  );
}

function DayNote({
  day,
  text,
  onSave,
}: {
  readonly day: string;
  readonly text: string;
  readonly onSave: (note: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(text === "" ? DAY_NOTE_TEMPLATE : text);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = `day-note-${day}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setFailure(null);
    void onSave(draft).then((message) => {
      setSaving(false);
      if (message === null) setSaved(true);
      else setFailure(message);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor={id}>End-of-day note</Label>
      <p className="text-xs text-muted-foreground">
        Saved as trading/days/{day}.md. Leonidas Chat can read it.
      </p>
      <Textarea
        id={id}
        rows={10}
        maxLength={NOTE_LIMIT}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-invalid={failure ? true : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          Save note
        </Button>
        {saved ? <span className="text-sm text-muted-foreground">Saved</span> : null}
        {failure ? (
          <span role="alert" className="text-sm text-destructive">
            {failure}
          </span>
        ) : null}
      </div>
    </form>
  );
}
