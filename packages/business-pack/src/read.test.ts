// @effect-diagnostics nodeBuiltinImport:off - test fixtures live in a temp folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { MAX_FILES_PER_FOLDER, readWidgets } from "./read.ts";

const roots: string[] = [];
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "bp-"));
  roots.push(root);
  return root;
};
const write = (root: string, path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.join(root, path, ".."), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, path), text, "utf8");
};
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const OCT = Date.UTC(2026, 9, 18, 20, 0, 0);

describe("readWidgets", () => {
  it("reads payments, deals and the goal from the workspace folder", async () => {
    const root = makeRoot();
    write(
      root,
      "payments/a.md",
      "---\ndate: 2026-10-02\namount_usd: 500\nverified: true\n---\nbody",
    );
    write(root, "payments/b.md", "---\ndate: 2026-09-02\namount_usd: 900\n---\n");
    write(root, "deals/x.md", '---\nstage: "negotiating"\n---\n');
    write(root, "deals/y.md", "---\nstage: prospect\n---\n");
    write(root, "deals/index.txt", "not markdown");
    write(
      root,
      "goals/g.md",
      "---\nmetric: revenue_month\ntarget_usd: 5000\nstatus: on_track\n---\n",
    );
    const [widget] = await readWidgets(root, OCT);
    assert.equal(widget?.kpis[0]?.value, "$500 of $5,000");
    assert.equal(widget?.kpis[1]?.value, "1");
  });

  it("shows no card for a folder with none of the three folders", async () => {
    assert.deepEqual(await readWidgets(makeRoot(), OCT), []);
  });

  it("reads only the frontmatter of a large file and survives an unreadable entry", async () => {
    const root = makeRoot();
    write(
      root,
      "payments/big.md",
      `---\ndate: 2026-10-03\namount_usd: 40\n---\n${"x".repeat(200_000)}`,
    );
    NodeFS.mkdirSync(NodePath.join(root, "payments", "folder.md"));
    const [widget] = await readWidgets(root, OCT);
    assert.equal(widget?.kpis[0]?.value, "$40");
  });

  it("returns the same widgets from a short cache until the clock moves on", async () => {
    const root = makeRoot();
    write(root, "payments/a.md", "---\ndate: 2026-10-02\namount_usd: 10\n---\n");
    const first = await readWidgets(root, OCT);
    write(root, "payments/b.md", "---\ndate: 2026-10-03\namount_usd: 20\n---\n");
    assert.strictEqual(await readWidgets(root, OCT + 1_000), first);
    const later = await readWidgets(root, OCT + 31_000);
    assert.equal(later[0]?.kpis[0]?.value, "$30");
  });

  it("reads at most MAX_FILES_PER_FOLDER files of one folder", async () => {
    const root = makeRoot();
    for (let n = 0; n < MAX_FILES_PER_FOLDER + 5; n += 1) {
      write(root, `deals/d${n}.md`, "---\nstage: contacted\n---\n");
    }
    const [widget] = await readWidgets(root, OCT);
    assert.equal(widget?.kpis[1]?.value, String(MAX_FILES_PER_FOLDER));
  });
});
