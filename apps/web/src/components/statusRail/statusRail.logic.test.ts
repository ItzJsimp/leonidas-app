import {
  ProviderDriverKind,
  type DesktopUpdateState,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { INITIAL_SCRIBE_LIVE } from "~/components/scribe/scribeLive.logic";
import {
  deriveAgentsRailStatus,
  deriveEnvironmentRailStatus,
  deriveGameModeRailStatus,
  describeGameMode,
  deriveProvidersRailStatus,
  deriveScribeRailStatus,
  deriveUpdateRailStatus,
} from "./statusRail.logic";

function makeProvider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
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
    ...overrides,
  };
}

describe("deriveScribeRailStatus", () => {
  it("reports Off when connected and hotkeys are disabled", () => {
    const status = deriveScribeRailStatus({
      hasEnvironment: true,
      live: { ...INITIAL_SCRIBE_LIVE, connected: true, state: "ready" },
      enabled: false,
    });
    expect(status).toMatchObject({ tone: "muted", shortLabel: "Off", canToggle: true });
  });

  it("reports On when connected and hotkeys are enabled", () => {
    const status = deriveScribeRailStatus({
      hasEnvironment: true,
      live: { ...INITIAL_SCRIBE_LIVE, connected: true, state: "ready" },
      enabled: true,
    });
    expect(status).toMatchObject({ tone: "success", shortLabel: "On", canToggle: true });
  });

  it("prioritizes active listening/error states even when enabled is read", () => {
    expect(
      deriveScribeRailStatus({
        hasEnvironment: true,
        live: { ...INITIAL_SCRIBE_LIVE, connected: true, state: "listening" },
        enabled: true,
      }),
    ).toMatchObject({ tone: "info", shortLabel: "Listening" });

    expect(
      deriveScribeRailStatus({
        hasEnvironment: true,
        live: {
          ...INITIAL_SCRIBE_LIVE,
          connected: true,
          state: "mic_error",
          lastError: { code: "mic_error", message: "No mic found", at: "2026-11-18T00:00:00.000Z" },
        },
        enabled: true,
      }),
    ).toMatchObject({ tone: "warning", shortLabel: "Mic issue", detailLabel: "No mic found" });
  });

  it("reports Offline and disables toggling when disconnected", () => {
    expect(
      deriveScribeRailStatus({
        hasEnvironment: true,
        live: { ...INITIAL_SCRIBE_LIVE, connected: false },
        enabled: true,
      }),
    ).toMatchObject({ tone: "error", shortLabel: "Offline", canToggle: false });
  });
});

describe("deriveEnvironmentRailStatus", () => {
  it("reflects connection phases and offline network", () => {
    expect(
      deriveEnvironmentRailStatus({
        label: "This PC",
        phase: "connected",
        networkStatus: "online",
        environmentCount: 1,
      }),
    ).toMatchObject({ tone: "success", label: "This PC" });

    expect(
      deriveEnvironmentRailStatus({
        label: "This PC",
        phase: "connected",
        networkStatus: "offline",
        environmentCount: 1,
      }),
    ).toMatchObject({ tone: "error", label: "This PC: Offline" });

    expect(
      deriveEnvironmentRailStatus({
        label: "Workstation",
        phase: "reconnecting",
        networkStatus: "online",
        environmentCount: 2,
      }),
    ).toMatchObject({ tone: "warning", label: "Workstation: Reconnecting" });
  });
});

describe("deriveProvidersRailStatus", () => {
  it("counts ready and needing-attention enabled providers", () => {
    const allReady = deriveProvidersRailStatus([
      makeProvider(),
      makeProvider({
        instanceId: "codex:default" as ServerProvider["instanceId"],
        driver: ProviderDriverKind.make("codex"),
        displayName: "Codex",
      }),
    ]);
    expect(allReady).toMatchObject({ tone: "success", label: "Providers: 2 ready" });

    const withSignIn = deriveProvidersRailStatus([
      makeProvider(),
      makeProvider({
        instanceId: "codex:default" as ServerProvider["instanceId"],
        driver: ProviderDriverKind.make("codex"),
        displayName: "Codex",
        auth: { status: "unauthenticated" },
      }),
    ]);
    expect(withSignIn).toMatchObject({ tone: "warning", label: "Providers: 1/2" });

    const withError = deriveProvidersRailStatus([
      makeProvider({ status: "error", message: "Binary crashed" }),
    ]);
    expect(withError).toMatchObject({ tone: "error", label: "Providers: 0/1" });
  });
});

describe("deriveAgentsRailStatus & deriveUpdateRailStatus", () => {
  it("formats running agents vs idle", () => {
    expect(deriveAgentsRailStatus({ running: 0 })).toMatchObject({
      tone: "muted",
      label: "Agents idle",
    });
    expect(deriveAgentsRailStatus({ running: 2 })).toMatchObject({
      tone: "info",
      label: "2 running",
    });
  });

  it("shows update ready in Electron or version label", () => {
    const baseState: DesktopUpdateState = {
      enabled: true,
      status: "downloaded",
      currentVersion: "0.124.142",
      hostArch: "x64",
      appArch: "x64",
      runningUnderArm64Translation: false,
      channel: "latest",
      availableVersion: "0.124.143",
      downloadedVersion: "0.124.143",
      downloadPercent: null,
      downloadProgress: null,
      checkedAt: null,
      message: null,
      errorContext: null,
      canRetry: false,
      releaseNotes: [],
      omittedReleaseCount: 0,
    };
    expect(
      deriveUpdateRailStatus({
        isElectron: true,
        state: baseState,
        noticeLevel: "all",
        versionLabel: "0.124.142",
      }),
    ).toMatchObject({ tone: "update", label: "Update ready" });

    expect(
      deriveUpdateRailStatus({
        isElectron: false,
        state: baseState,
        noticeLevel: "all",
        versionLabel: "0.124.142",
      }),
    ).toMatchObject({ tone: "muted", label: "v0.124.142" });
  });
});

describe("deriveGameModeRailStatus", () => {
  const base = {
    mode: "auto",
    level: "soft",
    watcher: true,
    throttled: 0,
    virtualDisplay: "off",
    active: false,
    game: null,
    gameSource: null,
    forcedUntil: null,
    error: null,
  } as const;

  it("shows Auto as Off while it waits, and as On with the game it found", () => {
    expect(deriveGameModeRailStatus(base)).toMatchObject({
      tone: "success",
      label: "Game Mode: Auto, Off",
    });
    expect(
      deriveGameModeRailStatus({
        ...base,
        active: true,
        game: "cs2",
        gameSource: "name",
        throttled: 6,
      }),
    ).toMatchObject({ tone: "info", label: "Game Mode: Auto, On (cs2)" });
  });

  it("formats on, off, and error states", () => {
    expect(
      deriveGameModeRailStatus({ ...base, mode: "on", level: "strict", active: true }),
    ).toMatchObject({ tone: "info", label: "Game Mode: On" });
    expect(deriveGameModeRailStatus({ ...base, mode: "off" })).toMatchObject({
      tone: "muted",
      label: "Game Mode: Off",
    });
    expect(deriveGameModeRailStatus({ ...base, watcher: false, error: "Failed" })).toMatchObject({
      tone: "warning",
      label: "Game Mode: Issue",
    });
  });
});

describe("describeGameMode", () => {
  const base = {
    mode: "auto",
    level: "soft",
    watcher: true,
    throttled: 0,
    virtualDisplay: "off",
    active: false,
    game: null,
    gameSource: null,
    forcedUntil: null,
    error: null,
  } as const;

  it("says what Auto decided and why", () => {
    expect(describeGameMode(base)).toBe("Auto: off, waiting for a game");
    expect(
      describeGameMode({ ...base, active: true, game: "Valorant", gameSource: "game folder" }),
    ).toBe("Auto: on, found Valorant (game folder)");
    expect(describeGameMode({ ...base, watcher: false })).toBe(
      "The Game Mode watcher is not running",
    );
  });

  it("says when a forced on ends", () => {
    expect(describeGameMode({ ...base, mode: "on", active: true })).toBe("Forced on");
    expect(
      describeGameMode({
        ...base,
        mode: "on",
        active: true,
        forcedUntil: "2026-11-25T19:19:00-07:00",
      }),
    ).toMatch(/^Forced on until .*, then Auto$/);
  });
});
