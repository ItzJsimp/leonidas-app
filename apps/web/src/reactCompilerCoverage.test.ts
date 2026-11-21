// @effect-diagnostics nodeBuiltinImport:off - compiles real source files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { transform } from "oxc-transform-react";
import { describe, expect, it } from "vite-plus/test";

import { REACT_COMPILER_BAILOUTS } from "../reactCompilerBailouts.ts";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);

const KNOWN_BAILOUTS: ReadonlySet<string> = new Set(REACT_COMPILER_BAILOUTS);

const webSourceFiles = NodeFS.readdirSync(NodePath.join(repoRoot, "apps/web/src"), {
  recursive: true,
})
  .map(String)
  .filter((file) => /\.tsx?$/.test(file) && !/\.(test|browser)\.tsx?$/.test(file))
  .filter((file) => !file.endsWith(".gen.ts"))
  .filter((file) => !KNOWN_BAILOUTS.has(file.replaceAll("\\", "/")))
  .map((file) => `apps/web/src/${file}`);

// Lint reports most compiler bailouts, but not every one (try/finally, throw
// inside try). A skipped file still builds, just unmemoized, so check the output.
describe("React Compiler coverage", () => {
  it.each(webSourceFiles)("compiles %s", async (file) => {
    const absolute = NodePath.join(repoRoot, file);
    const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
      jsx: { runtime: "automatic", development: false, refresh: false },
      reactCompiler: { reportDiagnostics: true },
    });
    const bailouts = result.errors.map((error) => error.codeframe ?? error.message);
    expect(bailouts).toEqual([]);
  });

  // A listed file that compiles must leave the list: the list also lets it keep manual memos.
  it.each(REACT_COMPILER_BAILOUTS)("still bails out on apps/web/src/%s", async (file) => {
    const absolute = NodePath.join(repoRoot, "apps/web/src", file);
    const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
      jsx: { runtime: "automatic", development: false, refresh: false },
      reactCompiler: { reportDiagnostics: true },
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
}, 120_000);
