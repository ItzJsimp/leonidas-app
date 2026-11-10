import type { TradingState } from "@t3tools/contracts";

import { randomUUID } from "../../lib/utils";

/** An event as the client sends it. The server sets `author` and checks every field. */
export type ClientEvent = Record<string, unknown>;
export type Entry = Record<string, unknown>;

export type FormKind = "account" | "attempt" | "result" | "fee" | "payout" | "cost" | "edit";

export const FORM_TITLES: Readonly<Record<Exclude<FormKind, "edit">, string>> = {
  account: "Add account",
  attempt: "Start Attempt",
  result: "Record pass or fail",
  fee: "Log fee",
  payout: "Log Payout",
  cost: "Log other cost",
};

export const MESSAGES = {
  amount: "Enter an amount of 0 or more.",
  future: "The date cannot be in the future.",
  required: "Enter a value.",
} as const;

const MAX_AMOUNT = 1_000_000_000;

export type FieldKind = "text" | "amount" | "date";
export type FieldErrors = Record<string, string>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as a local `YYYY-MM-DD` day. */
export const localDay = (now: Date = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** The picked day plus the current local time and UTC offset, such as `2026-11-03T14:05:09-07:00`. */
export function stampAt(day: string, now: Date = new Date()): string {
  const offset = -now.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const hours = pad(Math.trunc(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return `${day}T${time}${sign}${hours}:${minutes}`;
}

/** Returns the plain message for one field value, or null when it is fine. */
export function validateField(kind: FieldKind, raw: string, now: Date = new Date()): string | null {
  const value = raw.trim();
  if (kind === "text") return value === "" ? MESSAGES.required : null;
  if (kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return MESSAGES.required;
    return value > localDay(now) ? MESSAGES.future : null;
  }
  const amount = Number(value);
  return value === "" || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT
    ? MESSAGES.amount
    : null;
}

/** Checks every named field. An empty result means the form can be saved. */
export function validateFields(
  kinds: Readonly<Record<string, FieldKind>>,
  values: Readonly<Record<string, string>>,
  now: Date = new Date(),
): FieldErrors {
  const errors: FieldErrors = {};
  for (const [key, kind] of Object.entries(kinds)) {
    const message = validateField(kind, values[key] ?? "", now);
    if (message) errors[key] = message;
  }
  return errors;
}

export interface BuildContext {
  readonly now?: Date;
  readonly makeId?: () => string;
}
const idOf = (ctx: BuildContext) => (ctx.makeId ?? randomUUID)();

// ---- Add account -------------------------------------------------------------------------------

export interface AccountValues {
  firm: string;
  product: string;
  size: string;
  platform: string;
  last4: string;
  stage: "sim" | "evaluation" | "funded";
  fee: string;
  date: string;
}

export const accountKinds = (values: AccountValues): Record<string, FieldKind> => ({
  firm: "text",
  product: "text",
  size: "text",
  platform: "text",
  last4: "text",
  date: "date",
  ...(values.stage === "evaluation" ? { fee: "amount" as const } : {}),
});

/** `account.opened`, plus `attempt.started` by purchase for an Evaluation. */
export function buildAddAccount(values: AccountValues, ctx: BuildContext = {}): ClientEvent[] {
  const at = stampAt(values.date, ctx.now);
  const accountId = idOf(ctx);
  const opened: ClientEvent = {
    id: accountId,
    at,
    kind: "account.opened",
    firm: values.firm.trim(),
    product: values.product.trim(),
    size: values.size.trim(),
    platform: values.platform.trim(),
    last4: values.last4.trim(),
    stage: values.stage,
  };
  if (values.stage !== "evaluation") return [opened];
  return [
    opened,
    {
      id: idOf(ctx),
      at,
      kind: "attempt.started",
      accountId,
      via: "purchase",
      fee: Number(values.fee),
    },
  ];
}

// ---- Start Attempt -----------------------------------------------------------------------------

export interface AttemptValues {
  accountId: string;
  via: "purchase" | "reset";
  fee: string;
  date: string;
}

export const attemptKinds: Record<string, FieldKind> = {
  accountId: "text",
  fee: "amount",
  date: "date",
};

export const buildStartAttempt = (values: AttemptValues, ctx: BuildContext = {}): ClientEvent[] => [
  {
    id: idOf(ctx),
    at: stampAt(values.date, ctx.now),
    kind: "attempt.started",
    accountId: values.accountId,
    via: values.via,
    fee: Number(values.fee),
  },
];

// ---- Record pass or fail -----------------------------------------------------------------------

export interface ResultValues {
  accountId: string;
  result: "passed" | "failed";
  activationFee: string;
  next: "reset" | "close";
  resetFee: string;
  closeReason: "drawdown" | "rule";
  date: string;
}

export const resultKinds = (values: ResultValues): Record<string, FieldKind> => ({
  accountId: "text",
  date: "date",
  ...(values.result === "passed" ? { activationFee: "amount" as const } : {}),
  ...(values.result === "failed" && values.next === "reset" ? { resetFee: "amount" as const } : {}),
});

/**
 * Passed: `attempt.ended` plus `funded.opened`. Failed: `attempt.ended` plus a reset Attempt or a
 * close. The Activation fee and the Reset fee live on those events, never on `cost.paid`.
 */
export function buildRecordResult(values: ResultValues, ctx: BuildContext = {}): ClientEvent[] {
  const at = stampAt(values.date, ctx.now);
  const ended: ClientEvent = {
    id: idOf(ctx),
    at,
    kind: "attempt.ended",
    accountId: values.accountId,
    result: values.result,
  };
  if (values.result === "passed") {
    return [
      ended,
      {
        id: idOf(ctx),
        at,
        kind: "funded.opened",
        accountId: idOf(ctx),
        fromAccountId: values.accountId,
        activationFee: Number(values.activationFee),
      },
    ];
  }
  if (values.next === "reset") {
    return [
      ended,
      {
        id: idOf(ctx),
        at,
        kind: "attempt.started",
        accountId: values.accountId,
        via: "reset",
        fee: Number(values.resetFee),
      },
    ];
  }
  return [
    ended,
    {
      id: idOf(ctx),
      at,
      kind: "account.closed",
      accountId: values.accountId,
      reason: values.closeReason,
    },
  ];
}

// ---- Log fee, Log Payout, Log other cost -------------------------------------------------------

export interface MoneyValues {
  accountId: string;
  category: "mentorship" | "data" | "tools" | "other";
  amount: string;
  date: string;
}

export const feeKinds: Record<string, FieldKind> = {
  accountId: "text",
  amount: "amount",
  date: "date",
};
export const costKinds: Record<string, FieldKind> = { amount: "amount", date: "date" };

/** Only an Evaluation fee goes here. A Reset or Activation fee would count twice. */
export const buildLogFee = (values: MoneyValues, ctx: BuildContext = {}): ClientEvent[] => [
  {
    id: idOf(ctx),
    at: stampAt(values.date, ctx.now),
    kind: "cost.paid",
    category: "evaluation",
    amount: Number(values.amount),
    accountId: values.accountId,
  },
];

export const buildLogPayout = (values: MoneyValues, ctx: BuildContext = {}): ClientEvent[] => [
  {
    id: idOf(ctx),
    at: stampAt(values.date, ctx.now),
    kind: "payout.received",
    accountId: values.accountId,
    amount: Number(values.amount),
  },
];

export const buildLogCost = (values: MoneyValues, ctx: BuildContext = {}): ClientEvent[] => [
  {
    id: idOf(ctx),
    at: stampAt(values.date, ctx.now),
    kind: "cost.paid",
    category: values.category,
    amount: Number(values.amount),
  },
];

// ---- Account pickers ---------------------------------------------------------------------------

type AccountView = TradingState["accounts"][number];

export const accountLabel = (account: AccountView) =>
  `${account.firm} ${account.product} ${account.size} ·${account.last4}`;

const isOpen = (account: AccountView) => account.closedReason === null;

const hasOpenAttempt = (state: TradingState, accountId: string) =>
  state.attempts.some((attempt) => attempt.accountId === accountId && attempt.result === "open");

/** Open Evaluation accounts with no open Attempt. */
export const attemptAccounts = (state: TradingState) =>
  state.accounts.filter(
    (account) =>
      isOpen(account) && account.stage === "evaluation" && !hasOpenAttempt(state, account.id),
  );

/** Open accounts with an open Attempt. */
export const resultAccounts = (state: TradingState) =>
  state.accounts.filter((account) => isOpen(account) && hasOpenAttempt(state, account.id));

export const feeAccounts = (state: TradingState) => state.accounts.filter(isOpen);

export const payoutAccounts = (state: TradingState) =>
  state.accounts.filter((account) => isOpen(account) && account.stage === "funded");

// ---- Edit an entry -----------------------------------------------------------------------------

export interface EditField {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "amount" | "choice";
  readonly options?: ReadonlyArray<readonly [value: string, label: string]>;
}

const STAGES = [
  ["sim", "Sim"],
  ["evaluation", "Evaluation"],
  ["funded", "Funded"],
] as const;
const COST_CATEGORIES = [
  ["evaluation", "Evaluation fee"],
  ["reset", "Reset"],
  ["activation", "Activation fee"],
  ["mentorship", "Mentorship"],
  ["data", "Market data"],
  ["tools", "Tools"],
  ["other", "Other"],
] as const;

export const EDIT_FIELDS: Readonly<Record<string, readonly EditField[]>> = {
  "account.opened": [
    { key: "firm", label: "Firm", kind: "text" },
    { key: "product", label: "Product", kind: "text" },
    { key: "size", label: "Size", kind: "text" },
    { key: "platform", label: "Platform", kind: "text" },
    { key: "last4", label: "Last 4 digits", kind: "text" },
    { key: "stage", label: "Stage", kind: "choice", options: STAGES },
  ],
  "attempt.started": [
    {
      key: "via",
      label: "Type",
      kind: "choice",
      options: [
        ["purchase", "Purchase"],
        ["reset", "Reset"],
      ],
    },
    { key: "fee", label: "Fee", kind: "amount" },
  ],
  "attempt.ended": [
    {
      key: "result",
      label: "Result",
      kind: "choice",
      options: [
        ["passed", "Passed"],
        ["failed", "Failed"],
      ],
    },
  ],
  "funded.opened": [{ key: "activationFee", label: "Activation fee", kind: "amount" }],
  "account.closed": [
    {
      key: "reason",
      label: "Reason",
      kind: "choice",
      options: [
        ["drawdown", "Drawdown"],
        ["rule", "Rule break"],
        ["manual", "Closed by hand"],
      ],
    },
  ],
  "cost.paid": [
    { key: "category", label: "Category", kind: "choice", options: COST_CATEGORIES },
    { key: "amount", label: "Amount", kind: "amount" },
  ],
  "payout.received": [{ key: "amount", label: "Amount", kind: "amount" }],
};

const kindOf = (entry: Entry) => String(entry.kind ?? "");

export const entryDay = (entry: Entry) => String(entry.at ?? "").slice(0, 10);

/** The money on an entry, or null when it has none. */
export function entryAmount(entry: Entry): number | null {
  const value = entry.fee ?? entry.activationFee ?? entry.amount;
  return typeof value === "number" ? value : null;
}

/** A plain one-line label. `accountName` is looked up from the derived state. */
export function entryLabel(entry: Entry, accountName: (id: string) => string): string {
  const named = (text: string) => {
    const name = typeof entry.accountId === "string" ? accountName(entry.accountId) : "";
    return name ? `${text}, ${name}` : text;
  };
  const pick = (key: string) =>
    EDIT_FIELDS[kindOf(entry)]
      ?.find((field) => field.key === key)
      ?.options?.find(([value]) => value === entry[key])?.[1] ?? String(entry[key] ?? "");
  switch (kindOf(entry)) {
    case "account.opened":
      return `Account added: ${entry.firm} ${entry.product} ${entry.size} ·${entry.last4}`;
    case "attempt.started":
      return named(entry.via === "reset" ? "Reset" : "Attempt started");
    case "attempt.ended":
      return named(`Attempt ${pick("result").toLowerCase()}`);
    case "funded.opened":
      return named("Activation fee");
    case "account.closed":
      return named(`Account closed (${pick("reason")})`);
    case "cost.paid":
      return named(pick("category"));
    case "payout.received":
      return named("Payout");
    default:
      return kindOf(entry) || "Entry";
  }
}

/** The string values an Edit form starts with: the editable fields and the day. */
export function editValues(entry: Entry): Record<string, string> {
  const values: Record<string, string> = { date: entryDay(entry) };
  for (const field of EDIT_FIELDS[kindOf(entry)] ?? []) {
    values[field.key] = String(entry[field.key]);
  }
  return values;
}

export function editKinds(entry: Entry): Record<string, FieldKind> {
  const kinds: Record<string, FieldKind> = { date: "date" };
  for (const field of EDIT_FIELDS[kindOf(entry)] ?? []) {
    kinds[field.key] = field.kind === "amount" ? "amount" : "text";
  }
  return kinds;
}

/** The patch holds only the fields that changed. It is empty when nothing changed. */
export function editPatch(
  entry: Entry,
  values: Readonly<Record<string, string>>,
  ctx: BuildContext = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of EDIT_FIELDS[kindOf(entry)] ?? []) {
    const raw = values[field.key] ?? "";
    const next = field.kind === "amount" ? Number(raw) : raw.trim();
    if (next !== entry[field.key]) patch[field.key] = next;
  }
  if (values.date !== undefined && values.date !== entryDay(entry)) {
    patch.at = stampAt(values.date, ctx.now);
  }
  return patch;
}

const correctionBase = (ctx: BuildContext) => ({
  id: idOf(ctx),
  at: stampAt(localDay(ctx.now), ctx.now),
});

export const buildEdit = (
  entry: Entry,
  patch: Record<string, unknown>,
  ctx: BuildContext = {},
): ClientEvent[] => [
  { ...correctionBase(ctx), kind: "entry.corrected", targetId: String(entry.id), patch },
];

export const buildDelete = (entry: Entry, ctx: BuildContext = {}): ClientEvent[] => [
  { ...correctionBase(ctx), kind: "entry.deleted", targetId: String(entry.id) },
];
