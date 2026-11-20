// @vitest-environment jsdom
import type { TradingState } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AddForms } from "./AddForms";
import { localDay, type FormKind } from "./addMenu.logic";

// Made-up firm and amounts. Real firm prices and JJ numbers stay in the private pack.
const EMPTY: TradingState = {
  accounts: [],
  attempts: [],
  passRate: { passed: 0, finished: 0, rate: null },
  firmFees: 0,
  totalCost: 0,
  payouts: 0,
  netReturn: 0,
  costByCategory: {},
  averageFundedCost: null,
  lowestRoom: null,
  moneyTimeline: [],
  months: [],
  setups: [],
  streaks: { clean: 0, bestClean: 0 },
  journey: "sim",
  issues: [],
};
const FUNDED: TradingState = {
  ...EMPTY,
  accounts: [
    {
      id: "f1",
      firm: "Firm A",
      product: "Plan 1",
      size: "50K",
      platform: "Platform",
      last4: "0001",
      stage: "funded",
      closedReason: null,
      balanceChange: 0,
      roomToDrawdown: null,
      profitTarget: null,
      winningDays: null,
      bestDayPercent: null,
      consistencyPercent: null,
    },
  ],
};

let host: HTMLElement;
let root: Root;
const append = vi.fn<(events: Record<string, unknown>[]) => Promise<string | null>>();
const onClose = vi.fn();

async function show(form: FormKind, entries: Record<string, unknown>[] = []) {
  await act(async () => {
    root.render(
      <AddForms form={form} state={FUNDED} entries={entries} append={append} onClose={onClose} />,
    );
  });
}

const field = (label: string) => {
  const found = [...document.querySelectorAll("label")].find((node) =>
    node.textContent?.startsWith(label),
  );
  const id = found?.getAttribute("for");
  const input = id ? document.getElementById(id) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`No input named ${label}`);
  return input;
};

async function type(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const press = async (name: string) => {
  const buttons = [...document.querySelectorAll("button")];
  const button =
    buttons.find((node) => node.textContent === name && !node.hasAttribute("aria-label")) ??
    buttons.find((node) => node.getAttribute("aria-label")?.startsWith(name));
  await act(async () => {
    button?.click();
  });
};

async function save() {
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.textContent === "Save",
  );
  await act(async () => {
    button?.click();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  append.mockReset().mockResolvedValue(null);
  onClose.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("the Add menu forms", () => {
  it("Log Payout saves one payout event for the picked account and closes", async () => {
    await show("payout");
    await type("Amount", "500");
    await save();
    expect(append).toHaveBeenCalledTimes(1);
    const events = append.mock.calls[0]?.[0] ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "payout.received", accountId: "f1", amount: 500 });
    expect(String(events[0]?.at)).toMatch(new RegExp(`^${localDay()}T\\d{2}:\\d{2}:\\d{2}[+-]`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Add account for an Evaluation saves the account and the purchase Attempt together", async () => {
    await show("account");
    await type("Firm", "Firm A");
    await type("Product", "Plan 1");
    await type("Size", "50K");
    await type("Last 4 digits", "0007");
    await type("Evaluation fee", "0");
    await save();
    expect(append).toHaveBeenCalledTimes(1);
    const events = append.mock.calls[0]?.[0] ?? [];
    expect(events.map((event) => event.kind)).toEqual(["account.opened", "attempt.started"]);
    expect(events[0]).toMatchObject({ platform: "TopstepX", stage: "evaluation", last4: "0007" });
    expect(events[1]).toMatchObject({ via: "purchase", fee: 0, accountId: events[0]?.id });
  });

  it("a bad amount saves nothing and shows the message under the field", async () => {
    await show("payout");
    await type("Amount", "-3");
    await save();
    expect(append).not.toHaveBeenCalled();
    const input = field("Amount");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe("Enter an amount of 0 or more.");
  });

  it("a failed save keeps the dialog open and shows the failure", async () => {
    append.mockResolvedValue("Could not save. Check the values and try again.");
    await show("payout");
    await type("Amount", "5");
    await save();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("Could not save");
  });

  it("Log fee shows its one line and Log other cost needs no account", async () => {
    await show("fee");
    expect(document.body.textContent).toContain(
      "For a Reset or an Activation fee, use Start Attempt or Record pass.",
    );
    await show("cost");
    await type("Amount", "20");
    await save();
    expect(append.mock.calls[0]?.[0][0]).toMatchObject({
      kind: "cost.paid",
      category: "mentorship",
      amount: 20,
    });
    expect(append.mock.calls[0]?.[0][0]).not.toHaveProperty("accountId");
  });

  it.each(["account", "attempt", "result", "fee", "payout", "cost"] as const)(
    "every control in %s has a visible label",
    async (form) => {
      await show(form);
      const controls = [...document.querySelectorAll("input, button[role=combobox]")].filter(
        (node) => node.getAttribute("aria-hidden") !== "true",
      );
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const label = control.id ? document.querySelector(`label[for="${control.id}"]`) : null;
        expect(label?.textContent?.trim(), `a control in ${form} has no label`).toBeTruthy();
      }
    },
  );
});

describe("Edit an entry", () => {
  const payout = {
    id: "p1",
    at: "2026-03-05T12:00:00-07:00",
    author: "Trader",
    kind: "payout.received",
    accountId: "f1",
    amount: 500,
  };

  it("lists the entry, keeps Save off until something changes, then saves only the change", async () => {
    await show("edit", [payout]);
    expect(document.body.textContent).toContain("Payout, Firm A 50K");
    expect(document.body.textContent).toContain("$500");
    expect(document.body.textContent).toContain("2026-03-05");
    await press("Edit Payout");
    const save = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === "Save",
    );
    expect(save?.hasAttribute("disabled")).toBe(true);
    await type("Amount", "450");
    await press("Save");
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0][0]).toMatchObject({
      kind: "entry.corrected",
      targetId: "p1",
      patch: { amount: 450 },
    });
  });

  it("Delete asks first, then writes entry.deleted", async () => {
    await show("edit", [payout]);
    await press("Delete Payout");
    expect(append).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Delete this entry?");
    await press("Delete");
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0][0]).toMatchObject({ kind: "entry.deleted", targetId: "p1" });
  });
});

describe("Add account with a linked pack", () => {
  // A made-up pack. Real firm prices stay in the private pack.
  const PACK = {
    status: "ready",
    folder: "C:/packs/test",
    setups: [],
    firms: [
      {
        id: "firm-a",
        name: "Firm A",
        products: [
          {
            id: "plan-1",
            name: "Plan 1",
            size: 50000,
            prices: { monthly: 10, activation: 20, reset: 15, oneTime: null },
          },
        ],
      },
    ],
    check: { status: "none", module: null, sha256: null },
  } as const;
  const control = (label: string) => {
    const found = [...document.querySelectorAll("label")].find((node) =>
      node.textContent?.startsWith(label),
    );
    const id = found?.getAttribute("for");
    return id ? document.getElementById(id) : null;
  };

  it("shows plain fields with no linked pack", async () => {
    await show("account");
    expect(control("Firm")).toBeInstanceOf(HTMLInputElement);
    expect(control("Product")).toBeInstanceOf(HTMLInputElement);
  });

  it("offers the pack's firms and products to pick", async () => {
    await act(async () => {
      root.render(
        <AddForms
          form="account"
          state={FUNDED}
          pack={PACK}
          entries={[]}
          append={append}
          onClose={onClose}
        />,
      );
    });
    expect(control("Firm")).not.toBeInstanceOf(HTMLInputElement);
    expect(control("Firm")?.textContent).toBe("");
    expect(control("Product")?.textContent).toContain("None yet");
    expect(control("Size")).toBeInstanceOf(HTMLInputElement);
  });
});
