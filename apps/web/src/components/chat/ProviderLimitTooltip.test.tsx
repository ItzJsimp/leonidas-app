import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./PlanUsageLimits", () => ({
  UsageBar: ({ label }: { readonly label: string }) => <div data-bar-label={label} />,
}));

import { ProviderLimitTooltip } from "./ProviderLimitTooltip";

function makeProvider(
  driver: "antigravity" | "claudeAgent",
  windows: NonNullable<ServerProvider["usageLimits"]>["windows"],
): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(driver),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated", label: "Google" },
    checkedAt: "2026-10-09T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: "2026-10-09T12:00:00.000Z",
      windows,
    },
  };
}

describe("ProviderLimitTooltip", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");

  it("groups Antigravity windows under family headings with 5-hour and Weekly periods", () => {
    const html = renderToStaticMarkup(
      <ProviderLimitTooltip
        now={now}
        provider={makeProvider("antigravity", [
          {
            id: "argon-w",
            kind: "weekly",
            label: "Gemini 4 Argon · Weekly",
            usedPercent: 12,
          },
          {
            id: "3p-w",
            kind: "weekly",
            label: "Claude & GPT (shared) · Weekly",
            usedPercent: 45,
          },
          {
            id: "gem-5h",
            kind: "session",
            label: "Gemini · 5-hour",
            windowDurationMins: 300,
            usedPercent: 20,
          },
          {
            id: "3p-5h",
            kind: "session",
            label: "Claude & GPT (shared) · 5-hour",
            windowDurationMins: 300,
            usedPercent: 15,
          },
          {
            id: "gem-w",
            kind: "weekly",
            label: "Gemini · Weekly",
            usedPercent: 30,
          },
        ])}
      />,
    );

    const geminiIdx = html.indexOf(">Gemini<");
    const sharedIdx = html.indexOf(">Claude &amp; GPT (shared)<");
    const argonIdx = html.indexOf(">Gemini 4 Argon<");
    expect(geminiIdx).toBeGreaterThan(-1);
    expect(sharedIdx).toBeGreaterThan(geminiIdx);
    expect(argonIdx).toBeGreaterThan(sharedIdx);
    expect(html).toContain('data-bar-label="Gemini · 5-hour: 20% used"');
    expect(html).toContain('data-bar-label="Claude &amp; GPT (shared) · Weekly: 45% used"');
    expect(html).toContain('data-bar-label="Gemini 4 Argon · Weekly: 12% used"');
  });

  it("keeps the flat layout for Claude/Codex windows", () => {
    const html = renderToStaticMarkup(
      <ProviderLimitTooltip
        now={now}
        provider={makeProvider("claudeAgent", [
          { id: "s", kind: "session", label: "Session", usedPercent: 10 },
          { id: "w", kind: "weekly", label: "Weekly", usedPercent: 25 },
        ])}
      />,
    );

    expect(html).toContain("Session limit");
    expect(html).toContain("Weekly");
    expect(html).not.toContain(">Gemini<");
  });
});
