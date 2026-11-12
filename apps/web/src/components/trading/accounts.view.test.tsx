// @vitest-environment jsdom
import type { TradingState } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { AccountsView } from "./AccountsView";
import { FIFTEEN, stateOf } from "./accounts.fixture";

// Invented Attempt and money rows for the first open account by room (acct-10).
const richState: TradingState = stateOf(FIFTEEN, {
  firmFees: 300,
  totalCost: 420,
  payouts: 250,
  passRate: { passed: 1, finished: 3, rate: 1 / 3 },
  attempts: [
    {
      accountId: "acct-10",
      via: "purchase",
      fee: 100,
      startedAt: "2026-03-01T12:00:00-07:00",
      result: "passed",
      endedAt: "2026-03-05T12:00:00-07:00",
    },
  ],
  moneyTimeline: [
    {
      at: "2026-03-01T12:00:00-07:00",
      category: "evaluation",
      accountId: "acct-10",
      amount: -100,
      netReturn: -100,
    },
    {
      at: "2026-03-09T12:00:00-07:00",
      category: "payout",
      accountId: "acct-10",
      amount: 250,
      netReturn: 150,
    },
  ],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const renderView = async (state: TradingState) => {
  await act(async () => root.render(<AccountsView state={state} />));
};

const options = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')];

const selectedIndex = () =>
  options().findIndex((option) => option.getAttribute("aria-selected") === "true");

const chip = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find(
    (button) => button.textContent === label,
  )!;

const clickChip = async (label: string) => {
  await act(async () => {
    chip(label).click();
  });
};

const typeSearch = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const pressKey = async (key: string) => {
  const list = container.querySelector<HTMLElement>('[role="listbox"]')!;
  await act(async () => {
    list.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

const section = (name: string) => container.querySelector<HTMLElement>(`[aria-label="${name}"]`);

describe("AccountsView in jsdom with 15 accounts", () => {
  it("chips and search change the rows, and arrow keys move the selection", async () => {
    await renderView(richState);
    expect(options()).toHaveLength(12);

    await clickChip("Funded");
    expect(options()).toHaveLength(4);
    await clickChip("Closed history");
    expect(options()).toHaveLength(3);
    await clickChip("All");

    await typeSearch("1007");
    expect(options()).toHaveLength(1);
    await typeSearch("");
    expect(options()).toHaveLength(12);

    expect(section("Attempts")).toBeNull();
    await pressKey("ArrowDown");
    expect(selectedIndex()).toBe(0);
    await pressKey("ArrowDown");
    expect(selectedIndex()).toBe(1);
    expect(document.activeElement).toBe(options()[1]);
    expect(section("Attempts")).not.toBeNull();
    await pressKey("ArrowUp");
    expect(selectedIndex()).toBe(0);
    await pressKey("End");
    expect(selectedIndex()).toBe(11);
    await pressKey("ArrowDown");
    expect(selectedIndex()).toBe(11);
  });

  it("shows the totals when nothing is picked, and the picked account's Attempts, fees and Payouts", async () => {
    await renderView(richState);
    const details = container.querySelector<HTMLElement>('[aria-label="Account details"]')!;
    expect(details.textContent).toContain("All accounts");
    expect(details.textContent).toContain("$300");
    expect(details.textContent).toContain("$420");
    expect(details.textContent).toContain("$250");
    expect(details.textContent).toContain("1 of 3 finished Attempts");

    // Sorted by room to Drawdown, so the first row is acct-10 (250 to Drawdown).
    await pressKey("ArrowDown");
    expect(options()[0]!.textContent).toContain("·1010");
    expect(section("Attempts")!.textContent).toContain("Purchase");
    expect(section("Attempts")!.textContent).toContain("Passed");
    expect(section("Fees")!.textContent).toContain("$100 Firm fees");
    expect(section("Payouts")!.textContent).toContain("$250 total");
    expect(details.textContent).not.toContain("All accounts");
  });

  it("shows closed accounts only under the Closed chip", async () => {
    await renderView(richState);
    const closedLast4 = FIFTEEN.filter((account) => account.closedReason !== null).map(
      (account) => `·${account.last4}`,
    );
    expect(closedLast4).toHaveLength(3);

    for (const label of ["All", "Sim", "Evaluation", "Funded"]) {
      await clickChip(label);
      for (const option of options()) {
        for (const last4 of closedLast4) expect(option.textContent).not.toContain(last4);
      }
    }

    await clickChip("Closed history");
    expect(options()).toHaveLength(3);
    for (const option of options()) {
      expect(closedLast4.some((last4) => option.textContent?.includes(last4))).toBe(true);
    }
  });
});
