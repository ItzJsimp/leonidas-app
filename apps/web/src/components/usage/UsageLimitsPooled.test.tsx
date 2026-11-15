import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { LimitPool } from "@t3tools/shared/usageLimits";

const state = vi.hoisted(() => ({
  checkedAt: "",
  pools: [{ driver: "codex", accounts: [], windows: [] }] as unknown as LimitPool[],
}));
vi.mock("@t3tools/shared/usageLimits", async (original) => ({
  ...(await original<typeof import("@t3tools/shared/usageLimits")>()),
  collectLimitAccounts: () => [],
  collectLimitPools: () => state.pools,
  collectLimitNotices: () => [],
  collectExternalUsageLinks: () => [],
  poolCheckedAt: () => state.checkedAt,
}));

import { UsageLimitsPooled } from "./UsageLimitsPooled";

describe("usage check timestamp", () => {
  beforeEach(() => {
    state.checkedAt = "";
    state.pools = [{ driver: "codex", accounts: [], windows: [] } as unknown as LimitPool];
  });

  it("distinguishes today, yesterday, and an older year in local time", () => {
    const now = new Date(2026, 9, 23, 12).getTime();
    const shown = (date: Date) => {
      state.checkedAt = date.toISOString();
      return renderToStaticMarkup(<UsageLimitsPooled presentations={new Map()} now={now} />);
    };
    expect(shown(new Date(2026, 9, 23, 9, 15))).toContain(">9:15 AM</time>");
    expect(shown(new Date(2026, 9, 22, 9, 15))).toContain(">yesterday at 9:15 AM</time>");
    expect(shown(new Date(2025, 9, 22, 9, 15))).toMatch(/2025.*9:15 AM<\/time>/);
  });

  it("groups Antigravity pooled windows under family subheadings", () => {
    const now = new Date(2026, 9, 23, 12).getTime();
    state.checkedAt = new Date(2026, 9, 23, 9, 15).toISOString();
    state.pools = [
      {
        driver: "antigravity",
        accounts: [],
        windows: [
          {
            id: "gem-5h",
            kind: "session",
            label: "Gemini · 5-hour",
            usedPercent: 20,
            columns: [],
            resets: [],
          },
          {
            id: "3p-w",
            kind: "weekly",
            label: "Claude & GPT (shared) · Weekly",
            usedPercent: 40,
            columns: [],
            resets: [],
          },
          {
            id: "argon-w",
            kind: "weekly",
            label: "Gemini 4 Argon · Weekly",
            usedPercent: 10,
            columns: [],
            resets: [],
          },
        ],
      } as unknown as LimitPool,
    ];

    const html = renderToStaticMarkup(<UsageLimitsPooled presentations={new Map()} now={now} />);
    expect(html).toContain(">Gemini</h3>");
    expect(html).toContain(">Claude &amp; GPT (shared)</h3>");
    expect(html).toContain(">Gemini 4 Argon</h3>");
    expect(html).toContain(">5-hour</span>");
    expect(html).toContain(">Weekly</span>");
  });
});
