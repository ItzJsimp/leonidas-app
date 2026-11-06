import { describe, expect, it } from "vite-plus/test";
import {
  elapsedSeconds,
  parseMacManifest,
  parseUpdateManifest,
} from "./leonidas-release-health.ts";

describe("Release delivery checks", () => {
  it("measures real job durations without inventing unfinished timings", () => {
    expect(elapsedSeconds("2026-10-11T01:00:00Z", "2026-10-11T01:05:31Z")).toBe(331);
    expect(elapsedSeconds("2026-10-11T01:00:00Z", null)).toBeNull();
    expect(elapsedSeconds("invalid", "invalid")).toBeNull();
    expect(elapsedSeconds("2026-10-11T01:01:00Z", "2026-10-11T01:00:00Z")).toBeNull();
  });
  it("rejects manifests that would send the updater to the wrong installer", () => {
    const yaml = `version: 0.2.2\npath: Leonidas-Code-0.2.2-x64.exe\nsha512: ${"A".repeat(86)}==\n`;
    expect(parseUpdateManifest(yaml).version).toBe("0.2.2");
    expect(() => parseUpdateManifest(yaml.replace("Code-0.2.2", "Code-1.0.16"))).toThrow();
    expect(() => parseUpdateManifest(yaml.replace("sha512:", "missing:"))).toThrow();
  });
  it("requires a Mac manifest that names the arm64 zip the Mac updater installs", () => {
    const sha = `${"A".repeat(86)}==`;
    const yaml = [
      "version: 0.2.2",
      "files:",
      "  - url: Leonidas-Code-0.2.2-arm64.zip",
      `    sha512: ${sha}`,
      "    size: 123",
      "  - url: Leonidas-Code-0.2.2-arm64.dmg",
      `    sha512: ${sha}`,
      "    size: 456",
      "path: Leonidas-Code-0.2.2-arm64.zip",
      "",
    ].join("\n");
    const mac = parseMacManifest(yaml);
    expect(mac.zip).toEqual({ url: "Leonidas-Code-0.2.2-arm64.zip", sha512: sha, size: 123 });
    expect(mac.dmgUrl).toBe("Leonidas-Code-0.2.2-arm64.dmg");
    expect(() => parseMacManifest(yaml.replace(/arm64\.zip/g, "x64.zip"))).toThrow();
    expect(() => parseMacManifest(yaml.replace("version: 0.2.2", "release: 0.2.2"))).toThrow();
  });
});
