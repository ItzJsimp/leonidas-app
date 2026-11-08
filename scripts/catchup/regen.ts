// Generated files are never merged by hand: take T3 Code's version, then regenerate from source.
import { git } from "./plan.ts";

export interface RegenStep {
  path: string;
  /** Command to run after `git checkout --theirs`. */
  command: string[];
  /** Folder to run it in, relative to the repository root. */
  cwd: string;
}

const GENERATED: ReadonlyArray<{ test: RegExp; command: string[]; cwd: string }> = [
  { test: /(^|\/)pnpm-lock\.yaml$/, command: ["vp", "install", "--no-frozen-lockfile"], cwd: "." },
  { test: /(^|\/)routeTree\.gen\.tsx?$/, command: ["vp", "build"], cwd: "apps/web" },
];

export function regenPlan(conflicted: readonly string[]): RegenStep[] {
  const steps: RegenStep[] = [];
  for (const path of conflicted) {
    if (path.startsWith(".repos/")) continue;
    const rule = GENERATED.find((g) => g.test.test(path));
    if (rule) steps.push({ path, command: rule.command, cwd: rule.cwd });
  }
  return steps;
}

/** Take T3 Code's copy of each generated file so the regeneration command starts clean. */
export function takeTheirs(steps: readonly RegenStep[], cwd: string): void {
  for (const step of steps) git(["checkout", "--theirs", "--", step.path], cwd);
}

/** One command per distinct tool, in order, so a lockfile is not regenerated twice. */
export function uniqueCommands(
  steps: readonly RegenStep[],
): Array<{ command: string[]; cwd: string }> {
  const seen = new Set<string>();
  const out: Array<{ command: string[]; cwd: string }> = [];
  for (const s of steps) {
    const key = `${s.cwd}:${s.command.join(" ")}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ command: s.command, cwd: s.cwd });
    }
  }
  return out;
}
