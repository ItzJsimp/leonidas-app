// @effect-diagnostics nodeBuiltinImport:off - checks are plain modules that run git and gh.
import * as NodeChildProcess from "node:child_process";

export interface ExecResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one command. A missing program resolves with code null, never throws. */
export type Exec = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly timeoutMs?: number },
) => Promise<ExecResult>;

export const execFile: Exec = (command, args, options) =>
  new Promise((resolve) => {
    NodeChildProcess.execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 60_000,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

/** One problem. The key stays the same while the problem stays, so it is not sent twice. */
export interface Finding {
  readonly key: string;
  readonly text: string;
}

export type CheckOutcome =
  | { readonly status: "ok"; readonly summary: string }
  | { readonly status: "skipped"; readonly summary: string }
  | {
      readonly status: "findings";
      readonly level: "info" | "needs_you" | "failed";
      readonly title: string;
      readonly summary: string;
      readonly findings: ReadonlyArray<Finding>;
    };

export interface CheckInput {
  readonly aiosRoot: string;
  /** The Leonidas Code checkout at `<aios>/projects/leonidas-code`, or null for non-builders. */
  readonly repoPath: string | null;
  readonly now: number;
  readonly exec: Exec;
  readonly dryRun: boolean;
  /** The last successful run, for checks that read only what is new. */
  readonly lastRunAt: number | null;
}

/**
 * Notify once: send an event only when a finding appears that the last sent set did not have.
 * The same set, or a smaller one, sends nothing. A clean run clears the memory.
 */
export function decideNotify(
  previous: ReadonlyArray<string>,
  outcome: CheckOutcome,
): { readonly notify: boolean; readonly remember: ReadonlyArray<string> } {
  if (outcome.status === "skipped") return { notify: false, remember: previous };
  if (outcome.status === "ok") return { notify: false, remember: [] };
  const keys = [...new Set(outcome.findings.map((finding) => finding.key))].toSorted();
  const known = new Set(previous);
  return { notify: keys.some((key) => !known.has(key)), remember: keys };
}

/** The first lines of a finding list for an event body, inside the 500-character limit. */
export function findingsBody(summary: string, findings: ReadonlyArray<Finding>): string {
  let body = summary;
  for (const finding of findings) {
    const next = `${body}\n- ${finding.text}`;
    if (next.length > 480) return `${body}\n...`;
    body = next;
  }
  return body;
}
