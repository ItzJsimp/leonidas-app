// @effect-diagnostics globalDate:off - pure calendar formatting of a given timestamp; no clock reads.
/** The SimplyGersi card: this month's revenue against the goal, and the active deals. Pure. */
export interface PackKpi {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface PackWidget {
  readonly id: string;
  readonly title: string;
  readonly kpis: ReadonlyArray<PackKpi>;
}

export interface PaymentRow {
  readonly date: string;
  readonly amountUsd: number;
  readonly verified: boolean;
}

export interface GoalRow {
  readonly name: string;
  readonly targetUsd: number;
  readonly status: string;
  readonly metric: string;
}

export interface SimplygersiData {
  readonly payments: ReadonlyArray<PaymentRow>;
  readonly deals: ReadonlyArray<string>;
  readonly goals: ReadonlyArray<GoalRow>;
}

const ACTIVE_STAGES = ["contacted", "replied", "negotiating", "delivering"] as const;
const FINISHED_GOAL = new Set(["done", "achieved", "complete", "completed", "dropped"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The `YYYY-MM` of `now` on the Phoenix calendar (the business runs on Arizona time). */
export function currentMonth(now: number): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Phoenix" }).slice(0, 7);
}

export function monthRevenue(payments: ReadonlyArray<PaymentRow>, month: string) {
  let totalCents = 0;
  let count = 0;
  let unverified = 0;
  let lastDate: string | null = null;
  for (const payment of payments) {
    if (!DATE.test(payment.date) || !Number.isFinite(payment.amountUsd)) continue;
    if (lastDate === null || payment.date > lastDate) lastDate = payment.date;
    if (!payment.date.startsWith(month)) continue;
    totalCents += Math.round(payment.amountUsd * 100);
    count += 1;
    if (!payment.verified) unverified += 1;
  }
  return { totalUsd: totalCents / 100, count, unverified, lastDate };
}

export function activeDealCount(stages: ReadonlyArray<string>) {
  const byStage: Record<string, number> = {};
  let total = 0;
  for (const stage of stages) {
    if (!(ACTIVE_STAGES as ReadonlyArray<string>).includes(stage)) continue;
    byStage[stage] = (byStage[stage] ?? 0) + 1;
    total += 1;
  }
  return { total, byStage };
}

/** The lowest unmet `revenue_month` target; the highest one when all are met; null with none. */
export function pickGoal(goals: ReadonlyArray<GoalRow>, revenueUsd: number): GoalRow | null {
  const open = goals
    .filter(
      (goal) =>
        goal.metric === "revenue_month" &&
        !FINISHED_GOAL.has(goal.status) &&
        Number.isFinite(goal.targetUsd),
    )
    .toSorted((a, b) => a.targetUsd - b.targetUsd);
  return open.find((goal) => goal.targetUsd > revenueUsd) ?? open.at(-1) ?? null;
}

const money = (usd: number) =>
  `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(usd) ? 0 : 2 })}`;

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function buildWidgets(data: SimplygersiData, month: string): ReadonlyArray<PackWidget> {
  const revenue = monthRevenue(data.payments, month);
  const deals = activeDealCount(data.deals);
  // A business with no payments or deals is not SimplyGersi: show no card at all.
  if (data.payments.length === 0 && data.deals.length === 0) return [];
  const goal = pickGoal(data.goals, revenue.totalUsd);
  const name = monthName(month);
  const detail =
    revenue.count === 0
      ? `No payments in ${name}.${revenue.lastDate ? ` Last payment ${revenue.lastDate}.` : ""}`
      : `${plural(revenue.count, "payment")} in ${name}, ${revenue.unverified} not verified`;
  const stages = ACTIVE_STAGES.filter((stage) => deals.byStage[stage]).map(
    (stage) => `${deals.byStage[stage]} ${stage}`,
  );
  return [
    {
      id: "simplygersi-kpis",
      title: "SimplyGersi",
      kpis: [
        {
          label: "Revenue this month",
          value: goal
            ? `${money(revenue.totalUsd)} of ${money(goal.targetUsd)}`
            : money(revenue.totalUsd),
          detail,
        },
        {
          label: "Active deals",
          value: String(deals.total),
          detail: stages.length > 0 ? stages.join(", ") : "No deals in progress",
        },
      ],
    },
  ];
}
