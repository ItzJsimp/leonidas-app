// @vitest-environment jsdom
import type { LayaUsage } from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, expect, it, vi } from "vite-plus/test";

import { LayaChecksSection } from "./LayaChecks";

const query = vi.hoisted(() => ({
  data: null as LayaUsage | null,
  error: null as string | null,
  dataUpdatedAt: 0,
  refresh: vi.fn(),
}));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => "test" }));
vi.mock("~/state/query", () => ({ useEnvironmentQuery: () => query }));
vi.mock("~/state/taskBoard", () => ({ layaUsageQuery: () => null }));

const days = [
  { date: "2026-11-01", count: 9 },
  { date: "2026-11-02", count: 14 },
  { date: "2026-11-03", count: 11 },
];
const ready: LayaUsage = {
  status: "ready",
  modelPresent: true,
  packPresent: true,
  engineStatus: "ready",
  modelHash: "e26d6440",
  probeMs: 12,
  jevState: "off",
  gameMode: false,
  tiers: { rules: 101, model: 12, jev: 3 },
  total: 34,
  days,
  jobs: [
    { job: "bash_gate", count: 20, blocked: 2, asked: 1, flagged: 0 },
    { job: "screen", count: 14, blocked: 0, asked: 0, flagged: 3 },
  ],
};
const roots: ReturnType<typeof createRoot>[] = [];
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
  query.data = null;
  query.error = null;
  query.dataUpdatedAt = 0;
  query.refresh.mockClear();
});

const page = { setRefreshedAt: (_value: number) => {} };
function Page() {
  const [refreshedAt, set] = useState(1);
  page.setRefreshedAt = set;
  return <LayaChecksSection refreshedAt={refreshedAt} />;
}

async function renderSection() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<RouterProvider router={router} />));
  return container;
}

it("shows status, checks per day, each check type and the engine details", async () => {
  query.data = ready;
  query.dataUpdatedAt = Date.parse("2026-11-07T20:31:00");
  const section = await renderSection();
  const text = section.textContent ?? "";
  expect(text).toContain("LayaChecked");
  expect(text).toContain("last 3 days");
  expect(text).toContain("Ready");
  expect(text).toContain("All checks34checks");
  expect(section.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
    "Checks per day, last 3 days: 9, 14, 11",
  );
  expect(text).toContain("Command checks20 checks2 blocked1 asked you");
  expect(text).toContain("Web page checks14 checks3 warnings");
  expect(text).toContain("Modele26d6440");
  expect(text).toContain("Last probe12 ms");
  expect(text).toContain("Jev backupOff");
  expect(text).toContain("Game ModeOff");
  expect(text).toContain("Rules 101 · Model 12 · Jev backup 3");
  expect(section.querySelector("a")).toBeNull();
});

it("writes one check in the singular and groups large counts", async () => {
  query.data = {
    ...ready,
    total: 124_800,
    jobs: [{ job: "bash_gate", count: 1, blocked: 1, asked: 0, flagged: 1 }],
  };
  const text = (await renderSection()).textContent ?? "";
  expect(text).toContain(`${(124_800).toLocaleString()}checks`);
  expect(text).toContain("1 check1 blocked1 warning");
});

it.each(["error", "missing-runtime", "missing-model", "missing-pack"] as const)(
  "explains %s health, keeps prior counts and links to Settings",
  async (engineStatus) => {
    query.data = { ...ready, status: "missing", engineStatus, jevState: "paused" };
    const section = await renderSection();
    expect(section.textContent).toContain("All checks34checks");
    expect(section.textContent).toContain("Jev backupPaused");
    expect(section.textContent).toContain("Rules still run. Open Settings to check Laya setup.");
    const link = section.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/settings/general");
    link?.focus();
    expect(document.activeElement).toBe(link);
  },
);

it("says paused checks are paused and offers no Settings link", async () => {
  query.data = { ...ready, status: "missing", engineStatus: "paused", gameMode: true };
  const section = await renderSection();
  expect(section.textContent).toContain("Paused for Game Mode");
  expect(section.textContent).toContain("Local model checks are paused. Rules still run.");
  expect(section.textContent).toContain("Game ModeOn");
  expect(section.querySelector("a")).toBeNull();
});

it("shows health before the first check and keeps loading and failure messages readable", async () => {
  query.data = { ...ready, total: 0, jobs: [], days: [], probeMs: null, modelHash: null };
  const empty = await renderSection();
  expect(empty.textContent).toContain("No checks have run yet.");
  expect(empty.textContent).toContain("Not measured");
  expect(empty.textContent).toContain("Not found");
  expect(empty.querySelector('[role="img"]')).toBeNull();
  query.data = null;
  const loading = await renderSection();
  expect(loading.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
    "Loading Laya checks",
  );
  query.error = "raw private error";
  const failed = await renderSection();
  expect(failed.textContent).toContain("Try again later.");
  expect(failed.textContent).not.toContain("raw private error");
});

it("keeps only the name in the heading, with the time and status beside it", async () => {
  query.data = ready;
  query.dataUpdatedAt = Date.parse("2026-11-07T20:31:00");
  const section = await renderSection();
  const heading = section.querySelector("h2");
  expect(heading?.textContent).toBe("Laya");
  expect(section.querySelector("time")?.closest("h2")).toBeNull();
});

it("reloads the Laya numbers when the page refreshes, not on first render", async () => {
  query.data = ready;
  await renderSection();
  expect(query.refresh).not.toHaveBeenCalled();
  await act(async () => page.setRefreshedAt(2));
  expect(query.refresh).toHaveBeenCalledTimes(1);
});

it.each([
  ["Jev backup", "backup checker"],
  ["Answered by", "each layer settled"],
])("explains %s in a tooltip on focus", async (label, hint) => {
  query.data = ready;
  const section = await renderSection();
  const term = [...section.querySelectorAll("dt")].find((dt) => dt.textContent === label);
  await act(async () => term?.focus());
  expect(document.body.textContent).toContain(hint);
});

it("sizes the Settings button for touch", async () => {
  query.data = { ...ready, status: "missing", engineStatus: "error" };
  const link = (await renderSection()).querySelector("a");
  expect(link?.className).toContain("h-9");
});
