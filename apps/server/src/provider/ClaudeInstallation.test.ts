import { describe, expect, it } from "@effect/vitest";

import { parseClaudeVersion } from "./ClaudeInstallation.ts";

describe("parseClaudeVersion", () => {
  it("reads the version from claude --version", () => {
    expect(parseClaudeVersion("2.1.300 (Claude Code)\n")).toBe("2.1.300");
  });

  it("returns null when no version is printed", () => {
    expect(parseClaudeVersion("command not found")).toBeNull();
  });
});
