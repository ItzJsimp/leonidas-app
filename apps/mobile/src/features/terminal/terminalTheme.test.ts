import { describe, expect, it } from "vite-plus/test";
import { BUILT_IN_THEMES, getThemeColorsForAppearance } from "@t3tools/shared/themePalettes";

import { DEFAULT_MOBILE_THEME_ID, themeColorToNativeColor } from "../../lib/mobileTheme";

import { buildGhosttyThemeConfig, getMobileTerminalTheme } from "./terminalTheme";

describe("getMobileTerminalTheme", () => {
  it("uses the shared default light terminal colors", () => {
    expect(getMobileTerminalTheme(DEFAULT_MOBILE_THEME_ID, "light")).toMatchObject({
      background: "#eee6d6",
      foreground: "#1f1a14",
      cursorForeground: "#a8221b",
      cursorBackground: "#eee6d6",
    });
  });

  it("uses the shared default dark terminal colors", () => {
    const theme = BUILT_IN_THEMES.find((candidate) => candidate.id === DEFAULT_MOBILE_THEME_ID)!;
    const colors = getThemeColorsForAppearance(theme, "dark")!;
    const background = themeColorToNativeColor(colors.terminalBackground);
    expect(getMobileTerminalTheme(DEFAULT_MOBILE_THEME_ID, "dark")).toMatchObject({
      background,
      foreground: themeColorToNativeColor(colors.terminalForeground),
      cursorForeground: themeColorToNativeColor(colors.terminalCursor),
      cursorBackground: background,
    });
  });
  it("applies the selected palette without replacing ANSI status colors", () => {
    const standard = getMobileTerminalTheme(DEFAULT_MOBILE_THEME_ID, "dark");
    const ocean = getMobileTerminalTheme("ocean", "dark");

    expect(ocean.background).not.toBe(standard.background);
    expect(ocean.cursorForeground).not.toBe(standard.cursorForeground);
    expect(ocean.palette).toEqual(standard.palette);
  });

  it("uses the canonical desktop terminal roles for built-in themes", () => {
    const theme = BUILT_IN_THEMES.find((candidate) => candidate.id === "ocean")!;
    const colors = getThemeColorsForAppearance(theme, "dark")!;
    const terminal = getMobileTerminalTheme("ocean", "dark");

    expect(terminal.background).toBe(themeColorToNativeColor(colors.terminalBackground));
    expect(terminal.foreground).toBe(themeColorToNativeColor(colors.terminalForeground));
    expect(terminal.cursorForeground).toBe(themeColorToNativeColor(colors.terminalCursor));
  });
});

describe("buildGhosttyThemeConfig", () => {
  it("serializes theme colors into a ghostty config file", () => {
    const theme = getMobileTerminalTheme(DEFAULT_MOBILE_THEME_ID, "dark");
    const config = buildGhosttyThemeConfig(theme);

    expect(config).toContain(`background = ${theme.background}`);
    expect(config).toContain(`foreground = ${theme.foreground}`);
    expect(config).toContain(`cursor-color = ${theme.cursorForeground}`);
    expect(config).toContain("palette = 0=#141415");
    expect(config).toContain("palette = 15=#c6c6c8");
    expect(config.endsWith("\n")).toBe(true);
  });
});
