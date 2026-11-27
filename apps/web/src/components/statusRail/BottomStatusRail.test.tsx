import { ProviderDriverKind, type EnvironmentId, type ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const ENV_ID = "env-local" as EnvironmentId;
const mockToggle = vi.fn();
const mockScope = vi.hoisted(() => ({ gameMode: false }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("~/branding", () => ({ APP_VERSION_LABEL: "0.124.142" }));
const mockEnv = vi.hoisted(() => ({ isElectron: true }));
vi.mock("~/env", () => ({
  get isElectron() {
    return mockEnv.isElectron;
  },
}));
vi.mock("~/components/desktop/ReleaseHistoryDialog", () => ({
  openReleaseHistoryDialog: vi.fn(),
}));
vi.mock("~/components/twoState/useBuilderMode", () => ({ useBuilderMode: () => false }));
vi.mock("~/components/twoState/useTwoStateData", () => ({
  useTwoStateCounts: () => ({ needsYou: 2, running: 1, openChats: 1, today: null }),
}));
vi.mock("~/state/desktopUpdate", () => ({
  useDesktopUpdateState: () => null,
  useUpdatePreferencesStore: (selector: (s: { updateNotice: "all" }) => unknown) =>
    selector({ updateNotice: "all" }),
}));
vi.mock("~/state/environments", () => ({
  usePrimaryEnvironment: () => ({
    environmentId: ENV_ID,
    label: "This PC",
    displayUrl: "http://127.0.0.1:3773",
    connection: { phase: "connected" },
  }),
  useEnvironments: () => ({
    isReady: true,
    networkStatus: "online",
    environments: [{ environmentId: ENV_ID }],
  }),
  useEnvironmentProviders: () =>
    new Map<EnvironmentId, ReadonlyArray<ServerProvider>>([
      [
        ENV_ID,
        [
          {
            instanceId: "claudeAgent:default" as ServerProvider["instanceId"],
            driver: ProviderDriverKind.make("claudeAgent"),
            displayName: "Claude",
            enabled: true,
            installed: true,
            version: "1.0.0",
            status: "ready",
            auth: { status: "authenticated" },
            checkedAt: "2026-11-18T00:00:00.000Z",
            models: [],
            slashCommands: [],
            skills: [],
          },
        ],
      ],
    ]),
}));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => mockScope.gameMode }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/gameMode", () => ({
  gameModeRun: { _tag: "gameModeRun" },
  gameModeStatusQuery: (args: unknown) => ({ _tag: "gameModeStatusQuery", args }),
}));
vi.mock("~/state/scribe", () => ({
  scribeLive: (args: unknown) => ({ _tag: "scribeLive", args }),
}));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: (query: { readonly _tag?: string } | null) => ({
    data:
      query?._tag === "gameModeStatusQuery"
        ? { mode: "auto", level: "normal", running: false, active: [], watcher: true, error: null }
        : {
            connected: true,
            state: "ready",
            partial: "",
            lastTranscript: "",
            lastError: null,
            saved: [],
            process: { status: "running", restarts: 0, lastRestartAt: null },
          },
    dataUpdatedAt: 0,
    error: null,
    failure: null,
    isPending: false,
    isSuccess: true,
    refresh: vi.fn(),
  }),
}));
vi.mock("~/components/scribe/useScribeToggle", () => ({
  useScribeToggle: () => ({
    settings: null,
    settingsError: null,
    refreshSettings: vi.fn(),
    enabled: false,
    busy: false,
    toggle: mockToggle,
  }),
}));

import { BottomStatusRail } from "./BottomStatusRail";

describe("BottomStatusRail", () => {
  it("renders Scribe status with quick switch and core component statuses without nav/banner roles", () => {
    mockScope.gameMode = false;
    const html = renderToStaticMarkup(<BottomStatusRail />);

    expect(html).toContain("<footer");
    expect(html).toContain('aria-label="System status"');
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<header");
    expect(html).not.toContain('role="banner"');

    expect(html).toContain("Scribe");
    expect(html).toContain("Off");
    expect(html).toContain("This PC");
    expect(html).toContain("Providers: 1 ready");
    expect(html).toContain("1 running");
    expect(html).toContain("2 need you");
    expect(html).toContain("v0.124.142");
    expect(html).toContain('aria-label="Turn Leonidas Scribe on or off"');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("Game Mode:");
  });

  it("shows only agents, waiting items and the version in a browser", () => {
    mockScope.gameMode = true;
    mockEnv.isElectron = false;
    const html = renderToStaticMarkup(<BottomStatusRail />);
    mockEnv.isElectron = true;
    expect(html).toContain("1 running");
    expect(html).toContain("2 need you");
    expect(html).toContain("v0.124.142");
    for (const hidden of ["Scribe", "This PC", "Providers:", "Game Mode"]) {
      expect(html).not.toContain(hidden);
    }
  });

  it("includes Game Mode indicator when environment scope allows it", () => {
    mockScope.gameMode = true;
    const html = renderToStaticMarkup(<BottomStatusRail />);
    expect(html).toContain("Game Mode: Auto");
  });
});
