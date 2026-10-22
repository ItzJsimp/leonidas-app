import { assert, describe, it } from "@effect/vitest";

import { readFrontmatter } from "./frontmatter.ts";
import {
  activeDealCount,
  buildWidgets,
  currentMonth,
  monthRevenue,
  pickGoal,
  type GoalRow,
  type PaymentRow,
} from "./simplygersi.ts";

describe("readFrontmatter", () => {
  it("reads flat keys and strips quotes", () => {
    const fm = readFrontmatter('---\nid: p-1\nname: "A: b"\namount_usd: 500\n---\n# Body\nx: y');
    assert.deepEqual(fm, { id: "p-1", name: "A: b", amount_usd: "500" });
  });

  it("handles CRLF and a BOM", () => {
    assert.deepEqual(readFrontmatter("﻿---\r\nstage: paid\r\n---\r\n"), { stage: "paid" });
  });

  it("returns an empty object without frontmatter or with a cut-off block", () => {
    assert.deepEqual(readFrontmatter("# Just a note"), {});
    assert.deepEqual(readFrontmatter("---\nstage: paid\n"), {});
  });
});

describe("currentMonth", () => {
  it("uses the Phoenix calendar, not UTC", () => {
    // 2026-11-01 03:00 UTC is still 2026-10-31 8 PM in Phoenix.
    assert.equal(currentMonth(Date.UTC(2026, 10, 1, 3, 0, 0)), "2026-10");
    assert.equal(currentMonth(Date.UTC(2026, 10, 1, 8, 0, 0)), "2026-11");
  });
});

const pay = (date: string, amountUsd: number, verified = false): PaymentRow => ({
  date,
  amountUsd,
  verified,
});

describe("monthRevenue", () => {
  it("sums only the given month and counts unverified payments", () => {
    const result = monthRevenue(
      [pay("2026-10-02", 500), pay("2026-10-30", 1035.12, true), pay("2026-09-30", 900)],
      "2026-10",
    );
    assert.equal(result.totalUsd, 1535.12);
    assert.equal(result.count, 2);
    assert.equal(result.unverified, 1);
  });

  it("reports the latest payment date of all months", () => {
    const result = monthRevenue([pay("2026-06-24", 10), pay("2026-03-12", 5)], "2026-10");
    assert.equal(result.totalUsd, 0);
    assert.equal(result.lastDate, "2026-06-24");
  });

  it("skips rows with a bad date or amount", () => {
    const result = monthRevenue(
      [pay("soon", 5), pay("2026-10-01", Number.NaN), pay("2026-10-01", 7)],
      "2026-10",
    );
    assert.equal(result.totalUsd, 7);
    assert.equal(result.count, 1);
  });
});

describe("activeDealCount", () => {
  it("counts contacted, replied, negotiating and delivering only", () => {
    const result = activeDealCount([
      "prospect",
      "contacted",
      "replied",
      "negotiating",
      "negotiating",
      "delivering",
      "paid",
      "lost",
    ]);
    assert.equal(result.total, 5);
    assert.deepEqual(result.byStage, { contacted: 1, replied: 1, negotiating: 2, delivering: 1 });
  });
});

const goal = (targetUsd: number, status = "on_track", metric = "revenue_month"): GoalRow => ({
  name: `Goal ${targetUsd}`,
  targetUsd,
  status,
  metric,
});

describe("pickGoal", () => {
  it("picks the lowest revenue_month target that is not met yet", () => {
    assert.equal(pickGoal([goal(5000), goal(3000), goal(8000)], 3500)?.targetUsd, 5000);
  });

  it("ignores finished goals and other metrics", () => {
    const picked = pickGoal([goal(1000, "done"), goal(2000, "on_track", "deals"), goal(4000)], 0);
    assert.equal(picked?.targetUsd, 4000);
  });

  it("falls back to the highest target when all are met, and null with no goal", () => {
    assert.equal(pickGoal([goal(1000), goal(2000)], 9000)?.targetUsd, 2000);
    assert.equal(pickGoal([], 0), null);
  });
});

describe("buildWidgets", () => {
  it("shows revenue against the goal and the active deal count", () => {
    const [widget] = buildWidgets(
      {
        payments: [pay("2026-06-24", 1035.12)],
        deals: ["contacted", "negotiating", "paid"],
        goals: [goal(5000)],
      },
      "2026-10",
    );
    assert.equal(widget?.id, "simplygersi-kpis");
    assert.equal(widget?.kpis[0]?.label, "Revenue this month");
    assert.equal(widget?.kpis[0]?.value, "$0 of $5,000");
    assert.include(widget?.kpis[0]?.detail ?? "", "Last payment 2026-06-24");
    assert.equal(widget?.kpis[1]?.label, "Active deals");
    assert.equal(widget?.kpis[1]?.value, "2");
    assert.include(widget?.kpis[1]?.detail ?? "", "1 negotiating");
  });

  it("shows revenue alone with no goal, and keeps cents when they exist", () => {
    const [widget] = buildWidgets(
      { payments: [pay("2026-10-05", 1035.12)], deals: [], goals: [] },
      "2026-10",
    );
    assert.equal(widget?.kpis[0]?.value, "$1,035.12");
    assert.include(widget?.kpis[0]?.detail ?? "", "1 payment in October, 1 not verified");
  });

  it("shows no card when there are no payments and no deals", () => {
    assert.deepEqual(buildWidgets({ payments: [], deals: [], goals: [] }, "2026-10"), []);
  });
});
