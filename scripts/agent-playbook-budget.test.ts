// @effect-diagnostics nodeBuiltinImport:off - This test reads repository files with Node APIs.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

// Always-loaded instructions cost tokens in every session (Batch 12, 2026-11-06).
const root = NodePath.resolve(import.meta.dirname, "..");
const bytes = (file: string) => NodeFS.readFileSync(NodePath.join(root, file)).byteLength;

// AGENTS.md plus every in-repo file it pulls in with an `@path` line, followed recursively.
function alwaysLoaded(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const line of NodeFS.readFileSync(NodePath.join(root, file), "utf8").split("\n")) {
    const match = /^@(\S+)\s*$/.exec(line.trim());
    if (match?.[1] && !match[1].startsWith("../")) alwaysLoaded(NodePath.normalize(match[1]), seen);
  }
  return seen;
}

describe("always-loaded agent instructions", () => {
  it("keeps the playbook core under 12 KB", () => {
    // New traps go to project/agent-gotchas.md, new session notes too.
    expect(bytes("agent-playbook.md")).toBeLessThan(12_000);
  });

  it("keeps the repo part of the always-loaded set under 22 KB", () => {
    const files = [...alwaysLoaded("AGENTS.md"), "agent-playbook.md"];
    const total = files.reduce((sum, file) => sum + bytes(file), 0);
    expect(total, files.join(", ")).toBeLessThan(22_000);
  });
});
