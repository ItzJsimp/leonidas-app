import { ProviderDriverKind, type EnvironmentId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "../../index.css";
import { act, render } from "../../../test/render";

const ENV_ID = "env-local" as EnvironmentId;
const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  runGameMode: vi.fn(),
  refreshGameMode: vi.fn(),
}));

vi.mock("~/branding", () => ({ APP_VERSION_LABEL: "0.124.142" }));
vi.mock("~/env", () => ({ isElectron: true }));
vi.mock("~/components/desktop/ReleaseHistoryDialog", () => ({
  openReleaseHistoryDialog: vi.fn(),
}));
vi.mock("~/components/twoState/useBuilderMode", () => ({ useBuilderMode: () => false }));
vi.mock("~/components/twoState/useTwoStateData", () => ({
  useTwoStateCounts: () => ({ needsYou: 1, running: 2, openChats: 1, today: null }),
}));
vi.mock("~/state/desktopUpdate", () => ({
  useDesktopUpdateState: () => null,
  useUpdatePreferencesStore: (selector: (s: { updateNotice: "all" }) => unknown) =>
    selector({ updateNotice: "all" }),
}));
vi.mock("~/state/environments", () => ({
  usePrimaryEnvironment: () => ({
    environmentId: ENV_ID,
    label: "Workstation",
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
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => mocks.runGameMode }));
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
    refresh: mocks.refreshGameMode,
  }),
}));
vi.mock("~/components/scribe/useScribeToggle", () => ({
  useScribeToggle: () => ({
    settings: {
      sections: {
        hotkeys: {
          enabled: true,
          hold: ["Ctrl+Space"],
          toggle: ["Ctrl+Shift+Space"],
        },
        audio: { device: "Blue Yeti" },
      },
    },
    settingsError: null,
    refreshSettings: vi.fn(),
    enabled: true,
    busy: false,
    toggle: mocks.toggle,
  }),
}));

import { BottomStatusRail } from "./BottomStatusRail";

describe("BottomStatusRail (browser)", () => {
  it("toggles Scribe in one click, opens status popovers, and fits cleanly at the bottom", async () => {
    mocks.toggle.mockReset();
    mocks.runGameMode.mockReset();
    mocks.refreshGameMode.mockReset();
    await using screen = await render(
      <div className="flex h-dvh flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">Main view</div>
        <BottomStatusRail />
      </div>,
    );

    const footer = screen.container.querySelector<HTMLElement>('[data-slot="bottom-status-rail"]')!;
    const rect = footer.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(24);
    expect(rect.height).toBeLessThanOrEqual(36);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);

    const scribeSwitch = screen.container.querySelector<HTMLElement>(
      '[aria-label="Turn Leonidas Scribe on or off"]',
    )!;
    expect(scribeSwitch.getAttribute("aria-checked")).toBe("true");
    await act(() => scribeSwitch.click());
    expect(mocks.toggle).toHaveBeenCalledTimes(1);

    const scribeButton = screen.container.querySelector<HTMLButtonElement>(
      '[aria-label="Leonidas Scribe status: On"]',
    )!;
    await act(() => scribeButton.click());
    await expect.element(page.getByText("Blue Yeti")).toBeVisible();
    await expect.element(page.getByText("Open Scribe")).toBeVisible();
    await expect.element(page.getByText("Scribe settings")).toBeVisible();

    const providersButton = screen.container.querySelector<HTMLButtonElement>(
      '[aria-label="AI providers status: Providers: 1 ready"]',
    )!;
    await act(() => providersButton.click());
    await expect.element(page.getByText("Manage providers")).toBeVisible();

    const gameModeButton = screen.container.querySelector<HTMLButtonElement>(
      '[aria-label^="Game Mode status:"]',
    )!;
    await act(() => gameModeButton.click());
    expect(mocks.refreshGameMode).toHaveBeenCalledTimes(1);
    await expect.element(page.getByRole("button", { name: "On" })).toBeVisible();
  });
});
