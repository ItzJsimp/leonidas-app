// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-stub="window" />,
  useLocation: () => "/chat",
  useNavigate: () => vi.fn(),
  useParams: () => false,
  useRouterState: () => "/chat",
}));
vi.mock("~/components/Sidebar", () => ({ default: () => <div data-stub="chat-list" /> }));
vi.mock("~/components/onboarding/GuidanceCoach", () => ({ GuidanceCoach: () => null }));
vi.mock("~/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("~/hooks/useHandleNewThread", () => ({ useHandleNewThread: () => ({}) }));
vi.mock("~/lib/chatThreadActions", () => ({ startNewThreadFromContext: vi.fn() }));
vi.mock("~/state/entities", () => ({
  useThreadShell: () => null,
  useThreadShells: () => [],
  useProjects: () => [],
  useAllEnvironmentShellsBootstrapped: () => true,
}));
// The real chat view draws the header; this stand-in draws the same slot the real header does.
vi.mock("~/components/ThreadRouteView", async () => {
  const { useChatHeaderLeading } = await import("~/components/chat/ChatHeaderLeading");
  return {
    ThreadRouteView: () => <header data-chat-header>{useChatHeaderLeading()}</header>,
  };
});
vi.mock("~/components/workspace/useActiveAiosWorkspace", () => ({
  useActiveAiosWorkspace: () => ({ active: { type: "personal", name: "Jake" } }),
}));
vi.mock("~/onboarding/useOnboardingChat", () => ({
  useOnboardingChat: () => ({ canOperate: false }),
}));
vi.mock("./useTwoStateData", () => ({
  useAiosHome: () => ({ data: null }),
  useTwoStateCounts: () => ({ needsYou: 0, running: 0, today: null }),
  useFeedStatus: () => ({ events: [], loaded: true, error: null, updatedAt: 0, refresh: () => {} }),
  useFeedEvents: () => [],
}));
vi.mock("./useLiveArea", async () => {
  const { IDLE } = await vi.importActual<typeof import("./useLiveArea")>("./useLiveArea");
  return { IDLE, useLiveArea: () => IDLE };
});
vi.mock("./useViewportWidth", () => ({ useViewportWidth: () => 1440 }));
// jsdom has no matchMedia. The pane asks it whether this is a short touch screen.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
vi.mock("./SlotOutlet", () => ({ HomeCardsOutlet: () => null }));

import { ChatPane } from "./ChatPane";
import { ShellSplit } from "./ShellSplit";
import { useTwoStateStore } from "./twoStateStore";

const target = { kind: "server", threadRef: { environmentId: "env-1", threadId: "t-1" } } as never;
const host = (html: string) => {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
};

describe("chat pane", () => {
  it("puts the chat list toggle in the chat header, with no column of its own", () => {
    const pane = host(renderToStaticMarkup(<ChatPane urlTarget={target} />));
    const toggles = pane.querySelectorAll("[aria-controls]");
    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.closest("[data-chat-header]")).not.toBeNull();
    expect(toggles[0]?.getAttribute("aria-label")).toBe("Show the chat list");
  });

  it("keeps the toggle when no chat is open", () => {
    const pane = host(renderToStaticMarkup(<ChatPane urlTarget={null} />));
    expect(pane.textContent).toContain("No chat is open");
    expect(pane.querySelector("[aria-label='Show the chat list']")).not.toBeNull();
  });

  it("shows no usage meter or account icons in the chat header", () => {
    const header = host(renderToStaticMarkup(<ChatPane urlTarget={target} />)).querySelector(
      "[data-chat-header]",
    );
    expect(header?.textContent).not.toMatch(/% of 5 h|helpers/);
    expect(header?.querySelector("[data-usage-meter]")).toBeNull();
  });

  it("marks both panes, so Ctrl+Tab and Ctrl+Shift+. can move focus between them", async () => {
    // The split is off by default. A client render sees the store change; static markup does not.
    useTwoStateStore.setState({ split: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ShellSplit threadTarget={target} />));
    expect(container.querySelector("[data-pane='left']")).not.toBeNull();
    expect(container.querySelector("[data-pane='chat']")).not.toBeNull();
    act(() => root.unmount());
    useTwoStateStore.setState({ split: false });
  });
});
