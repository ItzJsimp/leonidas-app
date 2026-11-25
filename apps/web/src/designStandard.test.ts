import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { railItems, type RailItem } from "./components/twoState/railItems";
import { themeColorToHex } from "./themePalette";

const root = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);
const read = (file: string) => NodeFS.readFileSync(NodePath.join(root, file), "utf8");
const specs = NodeFS.readdirSync(NodePath.join(root, "docs/design")).map(
  (name) => `docs/design/${name}`,
);
const documents = ["DESIGN.md", ...specs];

describe("design standard", () => {
  it("stays short enough to read in full", () => {
    const words = read("DESIGN.md")
      .split(/\s+/u)
      .filter((word) => /[a-z0-9]/iu.test(word));
    expect(words.length).toBeLessThanOrEqual(1500);
  });

  it("links only files that exist", () => {
    const broken = documents.flatMap((file) =>
      [...read(file).matchAll(/\]\((?!https?:)([^)#]+)[^)]*\)/gu)]
        .map((match) => match[1]!)
        .filter((link) => !NodeFS.existsSync(NodePath.join(root, NodePath.dirname(file), link)))
        .map((link) => `${file} -> ${link}`),
    );
    expect(broken).toEqual([]);
  });

  it("lists every surface spec", () => {
    const index = read("DESIGN.md");
    expect(specs.filter((spec) => !index.includes(`(./${spec})`))).toEqual([]);
  });

  it("names only tokens and utilities that the web styles define", () => {
    const styles = read("apps/web/src/index.css");
    const missing = documents.flatMap((file) =>
      [
        ...read(file).matchAll(
          /`(--[a-z0-9-]+|duration-[a-z]+|ease-[a-z]+|touch-hit|surface-glass)`/gu,
        ),
      ]
        .map((match) => match[1]!)
        .filter((token) => {
          if (token.startsWith("duration-")) {
            return !styles.includes(`--transition-${token}:`);
          }
          if (token.startsWith("ease-")) return !styles.includes(`--${token}:`);
          if (token.startsWith("--")) return !styles.includes(`${token}:`);
          return !styles.includes(`@utility ${token}`);
        })
        .map((token) => `${file}: ${token}`),
    );
    expect(missing).toEqual([]);
  });

  it("matches the rail tables to the rail", () => {
    const documented = read("docs/design/navigation.md")
      .split("\n")
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .filter((cells) => cells.length === 7 && /^[a-z]+$/u.test(cells[1]!))
      .map((cells) => cells.slice(1, 5).join("|"));
    const everything = { business: true, builder: true, scribe: true };
    const main = railItems(everything);
    const trading = railItems({ ...everything, trading: true });
    const row = (item: RailItem) =>
      [item.group, item.id, item.label, item.short ?? ""].join("|");
    expect(documented).toEqual([...main.main, ...main.bottom, ...trading.main].map(row));
  });
});

/** Pairs that fail today (DESIGN.md "Known gaps"). Remove an entry when the theme is fixed. */
const KNOWN_LOW_CONTRAST = ["ember", "grove", "iris", "ocean"].flatMap((theme) =>
  ["light", "dark"].map((mode) => `${theme} ${mode} textMuted on surfaceRaised`),
);

type Rgb = readonly [number, number, number];

function paint(color: string, under: Rgb, opacity = 1): Rgb {
  const hex = themeColorToHex(color);
  if (!hex) throw new Error(`Expected a theme color, received ${color}`);
  const channel = (index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const alpha = (hex.length === 9 ? channel(3) / 255 : 1) * opacity;
  const mix = (index: number) => channel(index) * alpha + under[index]! * (1 - alpha);
  return [mix(0), mix(1), mix(2)];
}

function contrast(first: Rgb, second: Rgb): number {
  const luminance = (rgb: Rgb) =>
    rgb
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const [light, dark] = [luminance(first), luminance(second)].toSorted((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("design standard C3: text contrast", () => {
  it("is 4.5:1 or more in every built-in theme, except the known gaps", () => {
    const failures = BUILT_IN_THEMES.flatMap((theme) => {
      const modes = { [theme.appearance]: theme.colors, ...theme.variants };
      return Object.entries(modes).flatMap(([mode, colors]) => {
        const canvas = paint(colors.canvas, [0, 0, 0]);
        const surface = paint(colors.surface, canvas);
        const raised = paint(colors.surfaceRaised, canvas);
        const action = paint(colors.messageAction, canvas);
        const state = paint(colors.accent, canvas);
        // The Badge tint: 8 percent in light mode, 16 percent in dark mode.
        const tint = (color: string) => paint(color, surface, mode === "dark" ? 0.16 : 0.08);
        const pairs = [
          ["textMuted on canvas", colors.textMuted, canvas],
          ["textMuted on surface", colors.textMuted, surface],
          ["textMuted on surfaceRaised", colors.textMuted, raised],
          ["messageActionForeground", colors.messageActionForeground, action],
          ["accentForeground", colors.accentForeground, state],
          ["error chip", colors.errorForeground, tint(colors.error)],
          ["warning chip", colors.warningForeground, tint(colors.warning)],
        ] as const;
        return pairs
          .filter(([, text, under]) => contrast(paint(text, under), under) < 4.5)
          .map(([name]) => `${theme.id} ${mode} ${name}`);
      });
    });
    expect(failures.toSorted()).toEqual(KNOWN_LOW_CONTRAST.toSorted());
  });
});
