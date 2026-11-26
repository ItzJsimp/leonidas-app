// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-stub="window" />,
  useLocation: () => "/inbox",
  useNavigate: () => vi.fn(),
  useParams: () => false,
  useRouterState: () => "/inbox",
}));
vi.mock("~/components/workspace/useActiveAiosWorkspace", () => ({
  useActiveAiosWorkspace: () => ({ active: { type: "personal", name: "Jake" } }),
}));
vi.mock("~/components/workspace/WorkspaceSwitcher", () => ({ WorkspaceMenu: () => null }));
vi.mock("~/hooks/useLocalStorage", async () => {
  const { EMPTY_SETUP_STATE, SETUP_STATE_STORAGE_KEY } =
    await import("~/onboarding/setupState.logic");
  return {
    useLocalStorage: (key: string, initial: unknown) => [
      key === SETUP_STATE_STORAGE_KEY ? EMPTY_SETUP_STATE : initial,
      vi.fn(),
    ],
  };
});
vi.mock("./useTwoStateData", () => ({
  useTwoStateCounts: () => ({ needsYou: 3, running: 0, today: null }),
}));
vi.mock("./useLiveArea", async () => {
  const { IDLE } = await vi.importActual<typeof import("./useLiveArea")>("./useLiveArea");
  return { IDLE, useLiveArea: () => IDLE };
});
vi.mock("./ChatPane", () => ({ ChatPane: () => <section aria-label="Chat" /> }));
vi.mock("./CommandCenterForward", () => ({ CommandCenterForward: () => <div /> }));
vi.mock("./SlotOutlet", () => ({ HomeCardsOutlet: () => null }));

import { AppRail } from "./AppRail";
import { ShellSplit } from "./ShellSplit";

const html = () =>
  renderToStaticMarkup(
    <div>
      <AppRail />
      <ShellSplit threadTarget={null} />
    </div>,
  );

describe("shell frame", () => {
  it("has no Claude 5-hour stat anywhere", () => {
    expect(html()).not.toContain("Claude 5h");
  });

  it("has no header or banner region with stats", () => {
    const host = document.createElement("div");
    host.innerHTML = html();
    const regions = host.querySelectorAll("header, [role='banner']");
    for (const region of regions) {
      expect(region.textContent).not.toMatch(/Needs you|Running|Today|Claude 5h/);
    }
    expect(host.querySelector("[aria-label='Command Center stats']")).toBeNull();
  });

  it("keeps the rail as the only navigation, with the Today icon in it", () => {
    const host = document.createElement("div");
    host.innerHTML = html();
    const navs = host.querySelectorAll("nav");
    expect(navs).toHaveLength(1);
    expect(navs[0]?.querySelector("[aria-label='Today']")).not.toBeNull();
    // A pin adds a tab to the chat panel and never removes it from the rail.
    const inboxLink = navs[0]?.querySelector("[aria-label='Notifications, 3 need you']");
    expect(inboxLink).not.toBeNull();
    expect(inboxLink?.textContent).toContain("Notifications");
    expect(inboxLink?.textContent).not.toContain("Alerts");
    expect(navs[0]?.querySelector("[aria-label='Leonidas Chat']")).not.toBeNull();
  });

  it("has one state: workspace picker on top, Chat first, no collapse control, icon-only Usage and Settings", () => {
    const host = document.createElement("div");
    host.innerHTML = html();
    const nav = host.querySelector("nav")!;
    expect(nav.querySelector("[aria-label$='the menu']")).toBeNull();
    expect(nav.querySelector("button, a")?.getAttribute("aria-label")).toMatch(/^Workspace: /);
    const labels = [...nav.querySelectorAll("a")].map((link) => link.getAttribute("aria-label"));
    const at = (name: string) => labels.findIndex((label) => label?.startsWith(name));
    expect(at("Leonidas Chat")).toBeLessThan(at("Command Center"));
    expect(at("Command Center")).toBeLessThan(at("Today"));
    for (const name of ["Usage", "Settings"]) {
      expect(nav.querySelector(`[aria-label='${name}']`)?.textContent).toBe("");
    }
  });

  it("does not ship the old stat band", () => {
    expect(Object.keys(import.meta.glob("./TwoStateHeader.tsx"))).toEqual([]);
  });
});
