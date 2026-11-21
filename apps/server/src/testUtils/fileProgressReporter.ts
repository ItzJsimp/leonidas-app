// @effect-diagnostics nodeBuiltinImport:off - vitest loads this reporter from the config,
// outside any Effect runtime, and only needs path.relative.
import * as NodePath from "node:path";

import type { Reporter, TestModule, Vitest } from "vite-plus/test/node";

/**
 * Prints one line when each test file starts and ends. Vitest prints a file only when it
 * ends, so a file that hangs left no trace in a timed-out CI shard. The end lines also give
 * each file's wall time for shardWeights.json.
 */
export class FileProgressReporter implements Reporter {
  private root = "";

  onInit(vitest: Vitest) {
    this.root = vitest.config.root;
  }

  private name(testModule: TestModule) {
    return NodePath.relative(this.root, testModule.moduleId).replaceAll("\\", "/");
  }

  onTestModuleStart(testModule: TestModule) {
    process.stdout.write(`[file start] ${this.name(testModule)}\n`);
  }

  onTestModuleEnd(testModule: TestModule) {
    const ms = Math.round(testModule.diagnostic().duration);
    process.stdout.write(`[file end] ${this.name(testModule)} ${testModule.state()} ${ms}ms\n`);
  }
}
