// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SETTINGS_NAV_GROUPS } from "./settingsSearch";

// Each page panel becomes a marker, so this test proves route wiring and nothing else.
function marker(name: string) {
  return () => <div data-page-panel={name} />;
}

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component?: () => ReactNode }) => ({
    options,
    useSearch: () => ({}),
  }),
}));
vi.mock("./SettingsPanels", () => ({
  GeneralSettingsPanel: marker("general"),
  AppearanceSettingsPanel: marker("appearance"),
  ChatSettingsPanel: marker("chat"),
  DiffsSettingsPanel: marker("diffs"),
  ThreadsSettingsPanel: marker("threads"),
  WorktreesSettingsPanel: marker("worktrees"),
  MaintenanceSettingsPanel: marker("maintenance"),
  AboutSettingsPanel: marker("about"),
  LabsSettingsPanel: marker("labs"),
  ArchivedThreadsPanel: marker("archived"),
}));
vi.mock("./IntegrationsSettings", () => ({
  IntegrationsSettingsPanel: ({ view }: { view: string }) => <div data-page-panel={view} />,
}));
vi.mock("./ConnectionsSettings", () => ({
  ConnectionsSettings: ({ view }: { view: string }) => <div data-page-panel={view} />,
}));
vi.mock("./LimitsSettings", () => ({ LimitsSettings: marker("limits") }));
vi.mock("./ModelsSettings", () => ({ ModelsSettingsPanel: marker("models") }));
vi.mock("./KeybindingsSettings", () => ({ KeybindingsSettingsPanel: marker("keybindings") }));
vi.mock("./OpenSourceLicenses", () => ({
  OpenSourceLicensesPanel: marker("open-source-licenses"),
}));
vi.mock("./ProjectsSettings", () => ({ ProjectsSettings: marker("projects") }));
vi.mock("./ProviderSettingsPanel", () => ({ ProviderSettingsPanel: marker("providers") }));
vi.mock("./ScheduledTasksSettings", () => ({ ScheduledTasksSettings: marker("scheduled-tasks") }));
vi.mock("./SnapShotSettings", () => ({ SnapShotSettings: marker("snap-shot") }));
vi.mock("./SourceControlSettings", () => ({
  SourceControlSettingsPanel: marker("source-control"),
}));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: "all" },
    environment: { environmentId: "env-1" },
  }),
}));

const NAV_PATHS = SETTINGS_NAV_GROUPS.flatMap((group) => group.paths);
const EXPECTED_MARKER: Readonly<Record<string, string>> = {
  "/settings/browser": "browser",
  "/settings/devices": "devices",
  "/settings/environments": "environments",
  "/settings/access": "access",
};

let container: HTMLDivElement | undefined;

// Without this flag act() does not flush the render, so every page reads as empty.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
});

describe("settings routes", () => {
  it.each(NAV_PATHS)("%s renders its page", async (path) => {
    const slug = path.replace("/settings/", "");
    const { Route } = (await import(`../../routes/_chat.settings.${slug}.tsx`)) as {
      Route: { options: { component: (() => ReactNode) & { preload?: () => Promise<unknown> } } };
    };
    const Page = Route.options.component;
    // The router plugin splits route components into lazy chunks; load it before the render.
    await Page.preload?.();
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Page />));
    const marked = container.querySelector("[data-page-panel]");
    expect(marked?.getAttribute("data-page-panel")).toBe(EXPECTED_MARKER[path] ?? slug);
    await act(async () => root.unmount());
  });
});
