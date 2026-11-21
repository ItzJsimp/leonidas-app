// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - vitest loads this reporter from the config,
// outside any Effect runtime, and only needs path.relative and one timer per test.
import * as NodePath from "node:path";

import type { Reporter, TestCase, TestModule, Vitest } from "vite-plus/test/node";

const SLOW_TEST_MS = 30_000;

/**
 * Prints one line when each test file starts and ends. Vitest prints a file only when it
 * ends, so a file that hangs left no trace in a timed-out CI shard. The end lines also give
 * each file's wall time for shardWeights.json. A test still running after 30 s is named too,
 * so a hang inside a file points at one test.
 */
export class FileProgressReporter implements Reporter {
  private root = "";
  private readonly slowTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  onTestCaseReady(testCase: TestCase) {
    const timer = setTimeout(() => {
      process.stdout.write(
        `[slow test] ${this.name(testCase.module)} > ${testCase.fullName} still running after ${SLOW_TEST_MS / 1000} s\n`,
      );
    }, SLOW_TEST_MS);
    timer.unref();
    this.slowTimers.set(testCase.id, timer);
  }

  onTestCaseResult(testCase: TestCase) {
    clearTimeout(this.slowTimers.get(testCase.id));
    this.slowTimers.delete(testCase.id);
  }
}
