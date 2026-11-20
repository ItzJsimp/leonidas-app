// @effect-diagnostics nodeBuiltinImport:off - synchronous node and global APIs are used on purpose in this file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { projectSlug, scaffoldAiosProject } from "./aiosProjectScaffold.ts";

let root: string;

beforeEach(() => {
  root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-scaffold-"));
});

afterEach(() => {
  NodeFS.rmSync(root, { recursive: true, force: true });
});

const read = (...parts: string[]) => NodeFS.readFileSync(NodePath.join(root, ...parts), "utf8");
// @effect-diagnostics-next-line globalDate:off
const now = new Date("2026-11-12T12:00:00Z");

describe("projectSlug", () => {
  it("makes a plain slug and never an empty one", () => {
    expect(projectSlug("  Space Game: Part 2!  ")).toBe("space-game-part-2");
    expect(projectSlug("!!!")).toBe("project");
  });
});

describe("scaffoldAiosProject", () => {
  it("copies the template to projects/<slug> with every value filled in", () => {
    const result = scaffoldAiosProject({
      root,
      name: 'My "Space" Game',
      purpose: "A game\nabout {{DATE}} ships",
      now,
    });
    expect(result.slug).toBe("my-space-game");
    expect(result.root).toBe(NodePath.join(root, "projects", "my-space-game"));

    const project = read("projects", "my-space-game", "project.md");
    expect(project).toContain("id: project-my-space-game");
    expect(project).toContain('created: "2026-11-12"');
    expect(project).toContain("scope: personal");
    expect(project).toContain("name: \"My 'Space' Game\"");
    expect(read("projects", "my-space-game", "AGENTS.md")).toContain("A game about ''DATE'' ships");
    expect(read("projects", "my-space-game", "CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(NodeFS.existsSync(NodePath.join(result.root, ".agents", "skills", ".gitkeep"))).toBe(
      true,
    );
    // Only the four known values were filled: the marks for the owner's facts stay.
    for (const file of ["AGENTS.md", "project.md", "spec.md", "agent-playbook.md"]) {
      const text = read("projects", "my-space-game", file);
      expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(text).toContain("TODO:");
    }
  });

  it("uses a free name and never touches a folder that exists", () => {
    NodeFS.mkdirSync(NodePath.join(root, "projects", "game"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, "projects", "game", "keep.txt"), "mine");

    const first = scaffoldAiosProject({ root, name: "Game", purpose: "", now });
    const second = scaffoldAiosProject({ root, name: "Game", purpose: "", now });

    expect(first.slug).toBe("game-2");
    expect(second.slug).toBe("game-3");
    expect(read("projects", "game", "keep.txt")).toBe("mine");
    expect(read("projects", "game-2", "AGENTS.md")).toContain("TODO: what this project is");
  });

  it("refuses an empty name and leaves no folder behind", () => {
    expect(() => scaffoldAiosProject({ root, name: "  ", purpose: "x", now })).toThrow(
      "needs a name",
    );
    expect(NodeFS.existsSync(NodePath.join(root, "projects"))).toBe(false);
  });
});
