// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const updateSettings = vi.fn();
const servers = [
  { id: "reui", enabled: true, transport: "http", url: "https://mcp.reui.io" },
] as const;

vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({ scope: { kind: "all" }, target: { environmentId: "env-1" } }),
}));
vi.mock("./useScopedSettings", () => ({
  useScopedSettings: (select: (settings: { mcpServers: typeof servers }) => unknown) =>
    select({ mcpServers: servers }),
  useUpdateScopedSettings: () => updateSettings,
}));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("./settingsLayout", () => ({
  SettingsPageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SettingsRow: ({ control, children }: { control: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {control}
      {children}
    </div>
  ),
}));

import { McpServersSettingsPanel } from "./McpServersSettings";

let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  updateSettings.mockClear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) =>
  [...container.querySelectorAll("button")].find((node) => node.textContent?.includes(label));

it("lists the saved servers", async () => {
  await act(async () => createRoot(container).render(<McpServersSettingsPanel />));
  expect(container.textContent).toContain("reui");
  expect(container.textContent).toContain("https://mcp.reui.io");
});

it("shows an error and saves nothing for an empty form", async () => {
  await act(async () => createRoot(container).render(<McpServersSettingsPanel />));
  await act(async () => button("Add server")?.click());
  await act(async () => button("Save")?.click());
  expect(container.querySelector("[role=alert]")).not.toBeNull();
  expect(updateSettings).not.toHaveBeenCalled();
});
