// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A dependency-free dev tool that runs git and prints to the terminal.
// Catch-up resolver tools (ADR-0096). Run: node scripts/catchup/cli.ts <command> ...
// No command calls a model. Commands that change files say so.
//   plan <ours> <theirs> [--base <rev>]   dry-run merge, print conflict kinds and hunk tiers (reads only)
//   check <conflicted-file> <resolved-file> [--allow-combined]
//                                         fail when a resolved hunk contains an invented line
//   batch <conflicted-file>               print the free-tier worker prompt for the small hunks
//   delete-rule [--apply]                 in a merge in progress: remove deleted-upstream test files
//   regen [--run]                         in a merge in progress: take theirs for generated files, then regenerate
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { buildBatch } from "./batch.ts";
import { checkResolution, passes } from "./check.ts";
import { applyDeleteRule } from "./deleteRule.ts";
import { blobReader, buildPlan, formatPlan, git, parseMergeTree, runMergeTree } from "./plan.ts";
import { regenPlan, takeTheirs, uniqueCommands } from "./regen.ts";

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(name);
const option = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--base");

function main(): number {
  switch (command) {
    case "plan": {
      const [ours, theirs] = positional;
      if (!ours || !theirs) throw new Error("usage: plan <ours> <theirs> [--base <rev>]");
      const result = parseMergeTree(runMergeTree(ours, theirs, option("--base")));
      console.log(formatPlan(buildPlan(result, blobReader(result.tree))));
      return 0;
    }
    case "check": {
      const [conflicted, resolved] = positional;
      if (!conflicted || !resolved)
        throw new Error("usage: check <conflicted-file> <resolved-file>");
      const violations = checkResolution(
        NodeFS.readFileSync(conflicted, "utf8"),
        NodeFS.readFileSync(resolved, "utf8"),
      );
      for (const v of violations) console.log(`hunk ${v.hunk} ${v.kind}: ${v.line}`);
      const ok = passes(violations, flag("--allow-combined"));
      console.log(ok ? "PASS: no invented lines" : "FAIL: escalate this file");
      return ok ? 0 : 1;
    }
    case "batch": {
      const [file] = positional;
      if (!file) throw new Error("usage: batch <conflicted-file>");
      const batch = buildBatch(file, NodeFS.readFileSync(file, "utf8"));
      if (!batch) {
        console.log("no small hunks");
        return 0;
      }
      console.log(batch.prompt);
      console.error(`hunks ${batch.hunks.join(",")}; about ${batch.estimatedTokens} tokens in`);
      return 0;
    }
    case "delete-rule": {
      const result = applyDeleteRule(process.cwd(), !flag("--apply"));
      console.log(
        `${flag("--apply") ? "removed" : "would remove"} ${result.removed.length} test file(s)`,
      );
      for (const p of result.removed) console.log(`  rm ${p}`);
      console.log(
        `${result.needDecision.length} source file(s) need a decision (apply the four keep tests):`,
      );
      for (const p of result.needDecision) console.log(`  ${p}`);
      return 0;
    }
    case "regen": {
      const conflicted = git(["diff", "--name-only", "--diff-filter=U"])
        .split("\n")
        .filter(Boolean);
      const steps = regenPlan(conflicted);
      for (const s of steps)
        console.log(`${s.path}: take theirs, then ${s.command.join(" ")} (in ${s.cwd})`);
      if (!flag("--run")) return 0;
      takeTheirs(steps, process.cwd());
      for (const { command: cmd, cwd } of uniqueCommands(steps)) {
        const r = NodeChildProcess.spawnSync(cmd[0]!, cmd.slice(1), {
          cwd,
          stdio: "inherit",
          shell: true,
        });
        if (r.status !== 0) return r.status ?? 1;
      }
      return 0;
    }
    default:
      console.error(
        "commands: plan, check, batch, delete-rule, regen (see the header of this file)",
      );
      return 2;
  }
}

process.exitCode = main();
