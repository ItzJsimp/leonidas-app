import { describe, expect, it } from "vite-plus/test";
import { elapsedSeconds, parseUpdateManifest } from "./leonidas-release-health.ts";

describe("Release delivery checks", () => {
  it("measures real job durations without inventing unfinished timings", () => {
    expect(elapsedSeconds("2026-10-11T01:00:00Z", "2026-10-11T01:05:31Z")).toBe(331);
    expect(elapsedSeconds("2026-10-11T01:00:00Z", null)).toBeNull();
    expect(elapsedSeconds("invalid", "invalid")).toBeNull();
    expect(elapsedSeconds("2026-10-11T01:01:00Z", "2026-10-11T01:00:00Z")).toBeNull();
  });
  it("rejects manifests that would send the updater to the wrong installer", () => {
    const yaml = `version: 0.2.2\npath: Leonidas-0.2.2-x64.exe\nsha512: ${"A".repeat(86)}==\n`;
    expect(parseUpdateManifest(yaml).version).toBe("0.2.2");
    expect(() => parseUpdateManifest(yaml.replace("Leonidas-0.2.2", "Leonidas-1.0.16"))).toThrow();
    expect(() => parseUpdateManifest(yaml.replace("sha512:", "missing:"))).toThrow();
  });
});
