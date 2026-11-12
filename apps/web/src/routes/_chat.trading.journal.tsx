import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { TradingTradeView } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ImportPrompt } from "../components/trading/ImportPrompt";
import { PackNotice } from "../components/trading/PackNotice";
import { JournalView } from "../components/trading/JournalView";
import type { DayNoteState } from "../components/trading/JournalDay";
import { ReviewWithAi } from "../components/trading/ReviewWithAi";
import { AddTradeDialog } from "../components/trading/TradeForm";
import { ScreenshotThumb } from "../components/trading/ScreenshotThumb";
import { useTradingAppend } from "../components/trading/useTradingAppend";
import { localDay } from "../components/trading/addMenu.logic";
import {
  buildTagEvent,
  errorReason,
  importAccounts,
  isImageType,
  journalErrorText,
  screenshotParts,
} from "../components/trading/journal.logic";
import { RailWindow } from "../components/twoState/RailWindow";
import { Spinner } from "../components/ui/spinner";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { useEnvironmentQuery } from "../state/query";
import {
  tradingDayQuery,
  tradingDaySave,
  tradingScreenshotSave,
  tradingStateQuery,
} from "../state/trading";
import { useAtomCommand } from "../state/use-atom-command";

/** The file as base64 text, without the `data:` prefix. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const text = String(reader.result);
      resolve(text.slice(text.indexOf(",") + 1));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

type Dialog = "add" | "review" | null;

function TradingJournal() {
  const { environmentId, scope, scopeReady, active } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? tradingStateQuery({ environmentId, input: scope }) : null,
  );
  const data = query.data;
  const today = localDay();
  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const trades = data?.trades ?? [];
  // Newest day first; today always has a row, so a new day opens on it.
  const selectedDay = picked ?? newestDay(trades, today);
  const noteQuery = useEnvironmentQuery(
    environmentId && scopeReady && data
      ? tradingDayQuery({ environmentId, input: { ...scope, day: selectedDay } })
      : null,
  );
  const append = useTradingAppend();
  const saveNote = useAtomCommand(tradingDaySave, { reportFailure: false });
  const savePaste = useAtomCommand(tradingScreenshotSave, { reportFailure: false });

  if (data === null || data === undefined || !environmentId) {
    return (
      <RailWindow title="Journal">
        {query.error ? (
          <p role="alert" className="p-6 text-sm text-muted-foreground">
            The Journal could not read your trades. Check that this is a Trading workspace.
          </p>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Spinner size="sm" aria-label="Loading your trades" />
          </div>
        )}
      </RailWindow>
    );
  }

  const dayTrades = trades.filter((trade) => trade.day === selectedDay);
  const note: DayNoteState = noteQuery.error
    ? { status: "failed" }
    : noteQuery.data
      ? { status: "ready", text: noteQuery.data.note }
      : { status: "loading" };

  const onPaste = async (trade: TradingTradeView, file: File) => {
    if (!isImageType(file.type)) return journalErrorText("unsupported_image");
    const dataBase64 = await readBase64(file);
    const result = await savePaste({
      environmentId,
      input: { ...scope, day: trade.day, tradeId: trade.id, mime: file.type, dataBase64 },
    });
    if (result._tag === "Success") return null;
    if (isAtomCommandInterrupted(result)) return journalErrorText(undefined);
    return journalErrorText(errorReason(squashAtomCommandFailure(result)));
  };

  const onSaveNote = async (text: string) => {
    const result = await saveNote({
      environmentId,
      input: { ...scope, day: selectedDay, note: text },
    });
    if (result._tag === "Success") return null;
    if (isAtomCommandInterrupted(result)) return journalErrorText(undefined);
    return journalErrorText(errorReason(squashAtomCommandFailure(result)));
  };

  const renderShot = (screenshot: string, alt: string) => {
    const parts = screenshotParts(screenshot);
    if (!parts) return null;
    return (
      <ScreenshotThumb
        environmentId={environmentId}
        scope={scope}
        day={parts.day}
        name={parts.name}
        alt={alt}
      />
    );
  };

  return (
    <RailWindow title="Journal">
      <div className="flex flex-col gap-4 p-4">
        <PackNotice environmentId={environmentId} scope={scope} pack={data.pack} />
        <ImportPrompt environmentId={environmentId} scope={scope} accounts={data.state.accounts} />
        <JournalView
          trades={trades}
          accounts={data.state.accounts}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setPicked}
          note={note}
          setups={data.pack.status === "ready" ? data.pack.setups : null}
          onAddTrade={() => setDialog("add")}
          onReview={() => setDialog("review")}
          onTag={(trade, setup) => append([buildTagEvent(trade.id, setup)])}
          onPaste={onPaste}
          onSaveNote={onSaveNote}
          renderShot={renderShot}
        />
        {dialog === "add" ? (
          <AddTradeDialog
            environmentId={environmentId}
            scope={scope}
            accounts={importAccounts(data.state.accounts)}
            defaultDay={selectedDay}
            onClose={() => setDialog(null)}
          />
        ) : null}
        {dialog === "review" ? (
          <ReviewWithAi
            environmentId={environmentId}
            day={selectedDay}
            workspaceRoot={active?.root ?? null}
            characters={(noteQuery.data?.note.length ?? 0) + JSON.stringify(dayTrades).length}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </div>
    </RailWindow>
  );
}

/** The newest day with a trade, or today when no trade exists. */
function newestDay(trades: readonly TradingTradeView[], today: string): string {
  let newest = today;
  for (const trade of trades) if (trade.day > newest) newest = trade.day;
  return newest;
}

export const Route = createFileRoute("/_chat/trading/journal")({ component: TradingJournal });
