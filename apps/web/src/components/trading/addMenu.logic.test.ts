import { deriveTradingState, parseEvent, type TradingEvent } from "@t3tools/trading";
import { describe, expect, it } from "vite-plus/test";

import {
  MESSAGES,
  accountKinds,
  attemptAccounts,
  buildAddAccount,
  buildDelete,
  buildEdit,
  buildLogCost,
  buildLogFee,
  buildLogPayout,
  buildRecordResult,
  buildStartAttempt,
  editPatch,
  entryLabel,
  feeKinds,
  payoutAccounts,
  resultAccounts,
  stampAt,
  validateField,
  validateFields,
  type BuildContext,
  type ClientEvent,
} from "./addMenu.logic";

// Made-up firm and amounts. Real firm prices stay in the private pack.
const NOW = new Date(2026, 10, 3, 14, 5, 9);
let counter = 0;
const ctx = (): BuildContext => ({ now: NOW, makeId: () => `new-${++counter}` });
const asLedger = (events: ClientEvent[]) =>
  events.map((event) => ({ ...event, author: "Trader" })) as TradingEvent[];
const derive = (events: ClientEvent[]) =>
  deriveTradingState({ events: asLedger(events), trades: [] });

const account = {
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "TopstepX",
  last4: "0001",
  date: "2026-11-01",
} as const;
const BASE = buildAddAccount({ ...account, stage: "evaluation", fee: "100" }, ctx());
const ACCOUNT_ID = String(BASE[0]?.id);

describe("stampAt", () => {
  it("joins the picked day, the local time and the local UTC offset", () => {
    expect(stampAt("2026-11-01", NOW)).toMatch(/^2026-11-01T14:05:09[+-]\d{2}:\d{2}$/);
  });
});

describe("Add account", () => {
  it("an Evaluation adds one account and one purchase Attempt with the fee", () => {
    const state = derive(BASE);
    expect(state.accounts).toHaveLength(1);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ via: "purchase", fee: 100, result: "open" });
    expect(state.firmFees).toBe(100);
    expect(state.totalCost).toBe(100);
  });

  it("a Sim account adds only the account, with no fee", () => {
    const events = buildAddAccount({ ...account, stage: "sim", fee: "" }, ctx());
    expect(events).toHaveLength(1);
    const state = derive(events);
    expect(state.accounts).toHaveLength(1);
    expect(state.attempts).toHaveLength(0);
    expect(state.firmFees).toBe(0);
  });

  it("builds events the server accepts once it adds the author", () => {
    for (const event of asLedger(BASE)) expect(typeof parseEvent(event)).toBe("object");
  });
});

describe("Start Attempt", () => {
  it("a Reset adds an Attempt and a Firm fee, and the account leaves the picker while it is open", () => {
    const failed = buildRecordResult(
      {
        accountId: ACCOUNT_ID,
        result: "failed",
        activationFee: "",
        next: "close",
        resetFee: "",
        closeReason: "drawdown",
        date: "2026-11-02",
      },
      ctx(),
    ).slice(0, 1);
    const before = [...BASE, ...failed];
    expect(attemptAccounts(derive(before))).toHaveLength(1);
    const events = buildStartAttempt(
      { accountId: ACCOUNT_ID, via: "reset", fee: "40", date: "2026-11-02" },
      ctx(),
    );
    const state = derive([...before, ...events]);
    expect(state.attempts).toHaveLength(2);
    expect(state.firmFees).toBe(140);
    expect(attemptAccounts(state)).toHaveLength(0);
  });
});

describe("Record pass or fail", () => {
  const result = { accountId: ACCOUNT_ID, date: "2026-11-02" } as const;

  it("Passed adds a Funded account with the Activation fee and moves the pass rate", () => {
    expect(resultAccounts(derive(BASE))).toHaveLength(1);
    const events = buildRecordResult(
      {
        ...result,
        result: "passed",
        activationFee: "30",
        next: "close",
        resetFee: "",
        closeReason: "drawdown",
      },
      ctx(),
    );
    expect(events.map((event) => event.kind)).toEqual(["attempt.ended", "funded.opened"]);
    expect(events[1]).toMatchObject({ fromAccountId: ACCOUNT_ID, activationFee: 30 });
    const state = derive([...BASE, ...events]);
    expect(state.passRate).toEqual({ passed: 1, finished: 1, rate: 1 });
    expect(state.firmFees).toBe(130);
    expect(state.accounts).toHaveLength(2);
    expect(payoutAccounts(state)).toHaveLength(1);
    expect(state.costByCategory.activation).toBe(30);
  });

  it("Failed then Reset adds a reset Attempt and a Firm fee", () => {
    const events = buildRecordResult(
      {
        ...result,
        result: "failed",
        activationFee: "",
        next: "reset",
        resetFee: "40",
        closeReason: "drawdown",
      },
      ctx(),
    );
    expect(events.map((event) => event.kind)).toEqual(["attempt.ended", "attempt.started"]);
    const state = derive([...BASE, ...events]);
    expect(state.passRate).toEqual({ passed: 0, finished: 1, rate: 0 });
    expect(state.firmFees).toBe(140);
    expect(state.attempts).toHaveLength(2);
  });

  it("Failed then Close ends the Attempt and closes the account with the reason", () => {
    const events = buildRecordResult(
      {
        ...result,
        result: "failed",
        activationFee: "",
        next: "close",
        resetFee: "",
        closeReason: "rule",
      },
      ctx(),
    );
    expect(events.map((event) => event.kind)).toEqual(["attempt.ended", "account.closed"]);
    const state = derive([...BASE, ...events]);
    expect(state.accounts[0]?.closedReason).toBe("rule");
    expect(state.firmFees).toBe(100);
  });

  it("never writes cost.paid for a Reset or Activation fee", () => {
    for (const next of ["reset", "close"] as const) {
      for (const outcome of ["passed", "failed"] as const) {
        const events = buildRecordResult(
          {
            ...result,
            result: outcome,
            activationFee: "30",
            next,
            resetFee: "40",
            closeReason: "drawdown",
          },
          ctx(),
        );
        expect(events.some((event) => event.kind === "cost.paid")).toBe(false);
      }
    }
  });
});

describe("Log fee, Log Payout and Log other cost", () => {
  it("a fee is an Evaluation cost on the account and counts in Firm fees", () => {
    const events = buildLogFee(
      { accountId: ACCOUNT_ID, category: "other", amount: "25", date: "2026-11-02" },
      ctx(),
    );
    expect(events[0]).toMatchObject({
      kind: "cost.paid",
      category: "evaluation",
      accountId: ACCOUNT_ID,
    });
    expect(derive([...BASE, ...events]).firmFees).toBe(125);
  });

  it("a Payout adds to Payouts and changes the net return", () => {
    const events = buildLogPayout(
      { accountId: ACCOUNT_ID, category: "other", amount: "500", date: "2026-11-02" },
      ctx(),
    );
    const state = derive([...BASE, ...events]);
    expect(state.payouts).toBe(500);
    expect(state.netReturn).toBe(400);
  });

  it("another cost raises Total cost and leaves Firm fees unchanged", () => {
    const events = buildLogCost(
      { accountId: "", category: "mentorship", amount: "200", date: "2026-11-02" },
      ctx(),
    );
    expect(events[0]).not.toHaveProperty("accountId");
    const state = derive([...BASE, ...events]);
    expect(state.totalCost).toBe(300);
    expect(state.firmFees).toBe(100);
  });
});

describe("Edit and Delete", () => {
  const purchase = BASE[1] as ClientEvent;
  const entry = { ...purchase, author: "Trader" };

  it("the patch holds only the changed fields, and the derived number changes", () => {
    const patch = editPatch(entry, { via: "purchase", fee: "80", date: "2026-11-01" }, ctx());
    expect(patch).toEqual({ fee: 80 });
    const correction = buildEdit(entry, patch, ctx());
    expect(correction[0]).toMatchObject({ kind: "entry.corrected", targetId: purchase.id, patch });
    const ledger = [...BASE, ...correction];
    expect(derive(ledger).firmFees).toBe(80);
    // The earlier event stays in the list.
    expect(ledger.find((event) => event.id === purchase.id)).toMatchObject({ fee: 100 });
  });

  it("a changed day patches `at`, and nothing changed gives an empty patch", () => {
    const moved = editPatch(entry, { via: "purchase", fee: "100", date: "2026-10-30" }, ctx());
    expect(Object.keys(moved)).toEqual(["at"]);
    expect(String(moved.at)).toMatch(/^2026-10-30T14:05:09/);
    expect(editPatch(entry, { via: "purchase", fee: "100", date: "2026-11-01" })).toEqual({});
  });

  it("Delete writes entry.deleted and the number drops", () => {
    const events = buildDelete(entry, ctx());
    expect(events[0]).toMatchObject({ kind: "entry.deleted", targetId: purchase.id });
    const ledger = [...BASE, ...events];
    expect(derive(ledger).firmFees).toBe(0);
    expect(ledger).toHaveLength(BASE.length + 1);
  });

  it("gives a plain label for an entry", () => {
    expect(entryLabel(entry, () => "Firm A 50K")).toBe("Attempt started, Firm A 50K");
  });
});

describe("validation", () => {
  it("a negative amount gives the plain message", () => {
    expect(validateField("amount", "-1", NOW)).toBe("Enter an amount of 0 or more.");
    expect(validateField("amount", "abc", NOW)).toBe(MESSAGES.amount);
    expect(validateField("amount", "1000000001", NOW)).toBe(MESSAGES.amount);
    expect(validateField("amount", "0", NOW)).toBeNull();
  });

  it("a future date gives the plain message and today is allowed", () => {
    expect(validateField("date", "2026-11-04", NOW)).toBe("The date cannot be in the future.");
    expect(validateField("date", "2026-11-03", NOW)).toBeNull();
  });

  it("empty required text gives the plain message", () => {
    expect(validateField("text", "  ", NOW)).toBe("Enter a value.");
  });

  it("checks only the fields a form needs", () => {
    const values = { ...account, stage: "sim", fee: "-5" } as const;
    expect(validateFields(accountKinds({ ...values, stage: "sim" }), values, NOW)).toEqual({});
    expect(validateFields(accountKinds({ ...values, stage: "evaluation" }), values, NOW)).toEqual({
      fee: MESSAGES.amount,
    });
    expect(
      validateFields(feeKinds, { accountId: "", amount: "5", date: "2027-01-01" }, NOW),
    ).toEqual({ accountId: MESSAGES.required, date: MESSAGES.future });
  });
});
