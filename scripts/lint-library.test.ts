// @effect-diagnostics nodeBuiltinImport:off - tests use real files in temp folders.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";

import { lintLibrary, MANIFEST_PATH, type LibraryItem } from "./lint-library.ts";

const item = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  name: "demo",
  kind: "skill",
  pack: "core",
  needs: [],
  version: "1.0.0",
  license: "MIT",
  credit: "Leonidas",
  ...overrides,
});

describe("lint-library", () => {
  let dir: string;
  beforeEach(() => {
    dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "library lint "));
  });
  afterEach(() => NodeFS.rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, body: string) => {
    const file = NodePath.join(dir, name);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, body);
  };
  const setup = (items: LibraryItem[], skill: string) => {
    write(MANIFEST_PATH, JSON.stringify({ items }));
    write(".agents/skills/demo/SKILL.md", skill);
  };

  it("passes the shipped library in this repo", () => {
    expect(lintLibrary(NodePath.resolve(import.meta.dirname, ".."))).toEqual([]);
  });

  it("passes a Leonidas original with an allowed license", () => {
    setup([item()], "---\nname: demo\nlicense: MIT\n---\nBody\n");
    expect(lintLibrary(dir)).toEqual([]);
  });

  it("fails a skill with no license", () => {
    setup([item()], "---\nname: demo\n---\nBody\n");
    expect(lintLibrary(dir)).toEqual(["skill demo: license missing in SKILL.md frontmatter"]);
  });

  it("fails a license that is not MIT or Apache-2.0", () => {
    setup([item({ license: "GPL-3.0" })], "---\nname: demo\nlicense: GPL-3.0\n---\nBody\n");
    expect(lintLibrary(dir)).toEqual([
      'skill demo: manifest license "GPL-3.0" is not MIT or Apache-2.0',
      'skill demo: SKILL.md license "GPL-3.0" is not MIT or Apache-2.0',
    ]);
  });

  it("fails when SKILL.md and the manifest disagree", () => {
    setup([item()], '---\nname: demo\nlicense: "Apache-2.0"\n---\nBody\n');
    expect(lintLibrary(dir)).toEqual([
      'skill demo: SKILL.md license "Apache-2.0" differs from manifest "MIT"',
    ]);
  });

  it("fails an upstream skill without its LICENSE file or credit line", () => {
    setup([item({ credit: "someone/skills" })], "---\nname: demo\nlicense: MIT\n---\nBody\n");
    expect(lintLibrary(dir)).toEqual([
      "skill demo: upstream skill has no LICENSE file",
      'skill demo: upstream skill has no "Credit: " line',
    ]);
    write(".agents/skills/demo/LICENSE", "MIT License\n");
    write(
      ".agents/skills/demo/SKILL.md",
      "---\nname: demo\nlicense: MIT\n---\nBody\n\nCredit: x\n",
    );
    expect(lintLibrary(dir)).toEqual([]);
  });

  it("fails a listed skill whose folder is missing", () => {
    write(MANIFEST_PATH, JSON.stringify({ items: [item({ name: "gone" })] }));
    expect(lintLibrary(dir)[0]).toMatch(/^skill gone: .*SKILL\.md not found$/);
  });

  it("fails when a core skill links to a missing or outside-repo file", () => {
    setup(
      [item()],
      [
        "---",
        "name: demo",
        "license: MIT",
        "---",
        "See [missing](references/nope.md) and [outside](../../../../standards/foo.md).",
        "Keep [good](references/ok.md), [web](https://example.com), [anchor](#top), and `[code](nope.md)`.",
        "```md",
        "[fenced](nope.md)",
        "```",
      ].join("\n"),
    );
    write(".agents/skills/demo/references/ok.md", "ok\n");
    expect(lintLibrary(dir)).toEqual([
      'skill demo: dead link "references/nope.md" in .agents/skills/demo/SKILL.md:5',
      'skill demo: dead link "../../../../standards/foo.md" in .agents/skills/demo/SKILL.md:5',
    ]);
  });

  it("ignores relative links in non-core skills", () => {
    setup(
      [item({ pack: "extra" })],
      "---\nname: demo\nlicense: MIT\n---\nSee [aios](../../../../standards/foo.md).\n",
    );
    expect(lintLibrary(dir)).toEqual([]);
  });
});
