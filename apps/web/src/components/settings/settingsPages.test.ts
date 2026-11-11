import { describe, expect, it } from "vite-plus/test";

import { resolveLegacySettingsRedirect } from "./legacySettingsRoutes";
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SECTION_LABELS,
  type SettingsPath,
} from "./settingsSearch";

const settingsSources = import.meta.glob<string>("./*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const routeSources = import.meta.glob<string>("../../routes/_chat.settings.*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const read = (file: string): string => {
  const source = settingsSources[`./${file}`];
  expect(source, file).toBeDefined();
  return source!;
};
const routeSource = (slug: string): string | undefined =>
  routeSources[`../../routes/_chat.settings.${slug}.tsx`];

const NAV_PATHS = SETTINGS_NAV_GROUPS.flatMap((group) => group.paths);
// Pages that keep their route but not a nav row. Scheduled tasks left the nav on 2026-11-07:
// the Automations tab links to it.
const PAGES_OUTSIDE_NAV: readonly SettingsPath[] = ["/settings/scheduled-tasks"];

/** The block of a settings page inside the shared page panel. */
function pageBlock(source: string, page: string): string {
  const start = source.indexOf(`page === "${page}"`);
  expect(start, `page block ${page}`).toBeGreaterThan(-1);
  const next = source.indexOf('{page === "', start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("settings pages", () => {
  it("lists every page once in the nav, in concern groups", () => {
    expect(new Set(NAV_PATHS).size).toBe(NAV_PATHS.length);
    expect([...NAV_PATHS, ...PAGES_OUTSIDE_NAV].toSorted()).toEqual(
      (Object.keys(SETTINGS_SECTION_LABELS) as SettingsPath[]).toSorted(),
    );
    expect(SETTINGS_NAV_GROUPS.map((group) => group.heading)).toEqual([
      null,
      "Agents",
      "Code",
      "Connections",
      null,
    ]);
  });

  it.each([...NAV_PATHS, ...PAGES_OUTSIDE_NAV])("%s has a route file", (path) => {
    const slug = path.replace("/settings/", "");
    expect(routeSource(slug)).toBeDefined();
  });

  it("puts Models beside Providers under Agents", () => {
    const agents = SETTINGS_NAV_GROUPS.find((group) => group.heading === "Agents");
    expect(agents?.paths.slice(0, 2)).toEqual(["/settings/providers", "/settings/models"]);
  });

  it("points every search item at a page in the nav", () => {
    const stray = SETTINGS_SEARCH_ITEMS.filter((item) => !NAV_PATHS.includes(item.to));
    expect(stray.map((item) => item.id)).toEqual([]);
  });

  describe("protected Leonidas pages stay reachable from the nav", () => {
    const panels = read("SettingsPanels.tsx");
    const cases: ReadonlyArray<readonly [string, SettingsPath, string]> = [
      ["Models", "/settings/models", "ModelsSettingsPanel"],
      ["AI services and accounts", "/settings/providers", "ProviderSettingsPanel"],
    ];
    it.each(cases)("%s", (_label, path, component) => {
      const slug = path.replace("/settings/", "");
      expect(NAV_PATHS).toContain(path);
      expect(routeSource(slug)).toContain(component);
    });

    // Page, then the component its panel renders. The shared panel is scanned per page block.
    const rows: ReadonlyArray<readonly [string, string, string]> = [
      ["API keys", "general", "<ApiKeysSettings"],
      ["Voice", "general", "<VoiceSettingsRow"],
      ["Usage analytics", "general", "<UsageAnalyticsSettings"],
      ["Login item", "general", "<LoginItemSettings"],
      ["Prompt prediction", "chat", "<PromptPredictionSettings"],
      ["Skill folders", "chat", "SkillFoldersEditor"],
      ["Reasoning effort", "threads", "<ReasoningEffortSettings"],
      ["Cache", "maintenance", "<CacheSettings"],
      ["Settings backup", "maintenance", "<SettingsBackupSettings"],
      ["Reset section button", "general", "<ResetSectionButton"],
    ];
    it.each(rows)("%s renders on the %s page", (_label, page, tag) => {
      expect(pageBlock(panels, page)).toContain(tag);
    });

    it("keeps the model cards, GitHub settings and account groups in their pages", () => {
      const models = read("ModelsSettings.tsx");
      for (const card of [
        "TokenReportCard",
        "PcAdvisorCard",
        "ModelCompareCard",
        "OllamaAccountNotice",
      ]) {
        expect(models).toContain(`<${card}`);
      }
      expect(read("ProviderSettingsPanel.tsx")).toContain("ProviderAccountGroups");
      expect(read("ProviderSettingsPanel.tsx")).toContain("ConnectAccountDialog");
      const sourceControl = read("SourceControlSettings.tsx");
      expect(sourceControl).toContain("<GitHubAccountSettings");
      expect(sourceControl).toContain("<GitHubTokenSettings");
      expect(read("ConnectionsSettings.tsx")).toContain("<GitHubRoutingSettings");
    });
  });
});

describe("old settings links", () => {
  it.each([
    ["/settings/integrations", "", "/settings/browser"],
    ["/settings/storage", "", "/settings/maintenance"],
    ["/settings/connections", "", "/settings/environments"],
    ["/settings/integrations", "#device-hub", "/settings/devices"],
    ["/settings/integrations", "#devices", "/settings/devices"],
    ["/settings/storage", "#storage-worktrees", "/settings/worktrees"],
    ["/settings/storage", "#storage-artifacts", "/settings/maintenance"],
    ["/settings/connections", "#network-access", "/settings/access"],
    ["/settings/connections", "#remote-environments", "/settings/environments"],
  ])("%s%s redirects to %s", (pathname, hash, expected) => {
    expect(resolveLegacySettingsRedirect(pathname, hash)).toBe(expected);
  });

  it("leaves current pages alone", () => {
    expect(resolveLegacySettingsRedirect("/settings/browser", "")).toBeNull();
    expect(resolveLegacySettingsRedirect("/settings/general", "#theme")).toBeNull();
  });

  it("keeps a stub route for each old page so the link still matches", () => {
    for (const slug of ["integrations", "storage", "connections"]) {
      expect(routeSource(slug)).toContain(`createFileRoute("/_chat/settings/${slug}")`);
    }
  });
});
