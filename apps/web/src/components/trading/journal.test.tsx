// @vitest-environment jsdom
import type { TradingAccountView, TradingTradeView } from "@t3tools/contracts";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ImportPromptView } from "./ImportPrompt";
import { JournalView, type JournalViewProps } from "./JournalView";
import { PackConsentView } from "./PackNotice";
import { ReviewDialogView } from "./ReviewWithAi";
import { ScreenshotImage } from "./ScreenshotThumb";
import { TradeFormView } from "./TradeForm";
import { TOPSTEPX_EXPORT_STEPS, importSummary, tradesByDay } from "./journal.logic";

// Made-up firm and trades. Real exports stay on the trader's PC.
const account = (id: string, closed = false, stage: "evaluation" | "sim" = "evaluation") =>
  ({
    id,
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "TopstepX",
    last4: id.slice(-4),
    stage,
    closedReason: closed ? "manual" : null,
    balanceChange: 0,
    roomToDrawdown: null,
    profitTarget: null,
    winningDays: null,
    bestDayPercent: null,
    consistencyPercent: null,
  }) satisfies TradingAccountView;
const trade = (id: string, day: string, time: string, pnl: number): TradingTradeView => ({
  id: `topstepx:${id}`,
  accountId: "acct-0001",
  day,
  at: `${day}T${time}:00-05:00`,
  pnl,
  contract: "MNQZ6",
  side: "long",
  size: 2,
  points: 2.5,
});
const TRADES = [
  trade("1", "2026-11-03", "10:00", 10.1),
  trade("3", "2026-11-04", "10:40", -5),
  trade("2", "2026-11-04", "10:30", 8.2),
];
const FILE = { name: "trades.csv", trades: 2, firstDay: "2026-11-04", lastDay: "2026-11-04" };
const noop = async () => ({ ok: false as const, message: "" });
const saveNoop = async () => null;
const SHOT = "screenshots/2026-11-04/0123456789abcdef0123456789abcdef.png";

/** Props for a Journal view with nothing wired. Each test overrides what it checks. */
const view = (overrides: Partial<JournalViewProps> = {}): JournalViewProps => ({
  trades: TRADES,
  accounts: [account("acct-0001")],
  today: "2026-11-04",
  selectedDay: "2026-11-04",
  onSelectDay: () => undefined,
  setups: null,
  note: { status: "ready", text: "" },
  onAddTrade: () => undefined,
  onReview: () => undefined,
  onTag: saveNoop,
  onPaste: saveNoop,
  onSaveNote: saveNoop,
  renderShot: () => null,
  ...overrides,
});

describe("Journal", () => {
  it("groups trades by day, newest day first, in time order, with whole-cent totals", () => {
    const days = tradesByDay(TRADES);
    expect(days.map((day) => day.day)).toEqual(["2026-11-04", "2026-11-03"]);
    expect(days[0]?.trades.map((item) => item.id)).toEqual(["topstepx:2", "topstepx:3"]);
    expect(days[0]?.pnl).toBe(3.2);
  });

  it("shows the picked day with its trades, net dollars and the account name", () => {
    const html = renderToStaticMarkup(<JournalView {...view()} />);
    expect(html).toContain("Nov 4");
    expect(html).toContain("+$3.20");
    expect(html).toContain("Long 2 MNQZ6");
    expect(html).toContain("Firm A Plan 1 50K ·0001");
    expect(html).toContain("How to export from TopstepX");
  });

  it("guides the TopstepX export in 5 steps or fewer", () => {
    expect(TOPSTEPX_EXPORT_STEPS.length).toBeLessThanOrEqual(5);
    const text = TOPSTEPX_EXPORT_STEPS.join(" ");
    for (const part of ["Trades tab", "Export", "date range", "Downloads"]) {
      expect(text).toContain(part);
    }
  });

  it("marks a sim account's trades with a Sim chip", () => {
    const html = renderToStaticMarkup(
      <JournalView {...view({ accounts: [account("acct-0001", false, "sim")] })} />,
    );
    expect(html).toContain("Sim");
  });

  it("shows a manual trade as Manual in place of a time", () => {
    const manual = { ...trade("9", "2026-11-04", "00:00", 4), id: "manual-abc" };
    const html = renderToStaticMarkup(<JournalView {...view({ trades: [manual] })} />);
    expect(html).toContain("Manual");
  });
});

describe("Day with no trades", () => {
  it("shows an empty state that links to the export guide", () => {
    const html = renderToStaticMarkup(
      <JournalView {...view({ selectedDay: "2026-11-05", today: "2026-11-05" })} />,
    );
    expect(html).toContain("No trades on Nov 5");
    expect(html).toContain('href="#topstepx-export-guide"');
    expect(html).toContain("How to export from TopstepX");
  });

  it("teaches the export when no trades exist at all", () => {
    const html = renderToStaticMarkup(
      <JournalView {...view({ trades: [], selectedDay: "2026-11-05", today: "2026-11-05" })} />,
    );
    expect(html).toContain("Export your trades from TopstepX");
    expect(html).toContain("Open TopstepX");
    expect(html).toContain("Today");
  });
});

describe("Import prompt", () => {
  it("asks which account, with only open accounts to pick", () => {
    expect(importSummary(FILE)).toBe("2 trades, Nov 4");
    const html = renderToStaticMarkup(
      <ImportPromptView
        file={FILE}
        accounts={[account("acct-0001"), account("acct-0002", true), account("acct-0003")]}
        onImport={noop}
        onNotNow={() => undefined}
      />,
    );
    expect(html).toContain("New TopstepX export");
    expect(html).toContain("2 trades, Nov 4 · trades.csv");
    expect(html).toContain("Which account?");
    expect(html).toContain("Not now");
  });

  it("asks for an account first when none is open", () => {
    const html = renderToStaticMarkup(
      <ImportPromptView
        file={FILE}
        accounts={[account("acct-0002", true)]}
        onImport={noop}
        onNotNow={() => undefined}
      />,
    );
    expect(html).toContain("Add an account, then import this file.");
    expect(html).not.toContain("Which account?");
  });
});

describe("Rule check", () => {
  it("says once per day that the check waits for market data, and shows grades", () => {
    const rows = [
      { ...trade("8", "2026-11-05", "10:00", 1), check: "waiting" as const },
      { ...trade("9", "2026-11-05", "10:10", 1), check: "waiting" as const },
      {
        ...trade("10", "2026-11-06", "10:00", 1),
        check: "graded" as const,
        setup: "Setup 1",
        ruleBreaks: ["after a loss"],
      },
    ];
    const waiting = renderToStaticMarkup(
      <JournalView {...view({ trades: rows, selectedDay: "2026-11-05", today: "2026-11-06" })} />,
    );
    expect(waiting.split("Rule check waits for market data").length - 1).toBe(1);
    const graded = renderToStaticMarkup(
      <JournalView {...view({ trades: rows, selectedDay: "2026-11-06", today: "2026-11-06" })} />,
    );
    expect(graded).toContain("Setup 1: after a loss");
  });

  it("asks before the check module runs and shows the exact file", () => {
    const html = renderToStaticMarkup(
      <PackConsentView module="C:/packs/test/checks/check.mjs" onAnswer={async () => null} />,
    );
    expect(html).toContain("Allow the rule check?");
    expect(html).toContain("C:/packs/test/checks/check.mjs");
    expect(html).toContain("Allow");
    expect(html).toContain("Decline");
  });
});

describe("Setup tags and screenshots", () => {
  const tagged = { ...trade("1", "2026-11-04", "10:00", 2), screenshot: SHOT };

  it("offers the pack setups, and says to link a pack when none is linked", () => {
    const withPack = renderToStaticMarkup(
      <JournalView
        {...view({
          trades: [tagged],
          setups: [{ id: "setup-1", name: "Setup 1" }],
        })}
      />,
    );
    expect(withPack).toContain('aria-label="Setup for Long 2 MNQZ6 on Nov 4"');
    const noPack = renderToStaticMarkup(<JournalView {...view({ trades: [tagged] })} />);
    expect(noPack).toContain("Link a pack to tag setups");
    expect(noPack).not.toContain("Setup for Long");
  });

  it("shows the saved screenshot as a thumbnail with alt text", () => {
    const html = renderToStaticMarkup(
      <JournalView
        {...view({
          trades: [tagged],
          renderShot: (_path, alt) => (
            <ScreenshotImage mime="image/png" dataBase64="QUJD" alt={alt} />
          ),
        })}
      />,
    );
    expect(html).toContain('alt="Screenshot of Long 2 MNQZ6 on Nov 4"');
    expect(html).toContain("data:image/png;base64,QUJD");
  });
});

describe("Review with AI dialog", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("shows the engine, the model and a rough cost before anything runs", async () => {
    await act(async () => {
      root.render(
        <ReviewDialogView
          day="2026-11-04"
          engine="Test engine"
          model="test-model"
          characters={4000}
          inputPrice={5}
          outputPrice={25}
          ready
          submitting={false}
          failure={null}
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Test engine");
    expect(text).toContain("test-model");
    expect(text).toContain("About $0.03, a rough estimate");
    expect(text).not.toContain("Cost depends on your plan");
    expect(text).toContain("1,000 tokens");
  });

  it("falls back to the plan line when the model has no price", async () => {
    await act(async () => {
      root.render(
        <ReviewDialogView
          day="2026-11-04"
          engine="Test engine"
          model="test-model"
          characters={4000}
          inputPrice={null}
          outputPrice={null}
          ready
          submitting={false}
          failure={null}
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Cost depends on your plan");
    expect(text).not.toContain("rough estimate");
  });

  it("sends nothing on Cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        <ReviewDialogView
          day="2026-11-04"
          engine="Test engine"
          model="test-model"
          characters={4000}
          inputPrice={null}
          outputPrice={null}
          ready
          submitting={false}
          failure={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );
    });
    const cancel = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === "Cancel",
    );
    await act(async () => cancel?.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("Add trade form", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("asks for an open account first", async () => {
    await act(async () => {
      root.render(
        <TradeFormView
          accounts={[]}
          defaultDay="2026-11-04"
          onSave={async () => null}
          onClose={() => undefined}
        />,
      );
    });
    expect(document.body.textContent).toContain("Add an account first.");
  });

  it("saves the typed values as numbers, and closes when saved", async () => {
    const onSave = vi.fn(async () => null);
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <TradeFormView
          accounts={[account("acct-0001")]}
          defaultDay="2026-11-04"
          onSave={onSave}
          onClose={onClose}
        />,
      );
    });
    const setField = async (label: string, value: string) => {
      const found = [...document.querySelectorAll("label")].find((node) =>
        node.textContent?.startsWith(label),
      );
      const input = document.getElementById(found?.getAttribute("for") ?? "");
      if (!(input instanceof HTMLInputElement)) throw new Error(`No input named ${label}`);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await setField("Contract", "Contract 1");
    await setField("Points", "-3");
    await setField("Dollars", "-60");
    const save = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === "Save",
    );
    await act(async () => save?.click());
    expect(onSave).toHaveBeenCalledWith({
      accountId: "acct-0001",
      day: "2026-11-04",
      contract: "Contract 1",
      side: "long",
      size: 1,
      points: -3,
      pnl: -60,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
