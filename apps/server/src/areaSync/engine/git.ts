// @effect-diagnostics nodeBuiltinImport:off - the engine runs the git command line.
import { execFile } from "node:child_process";

/** One git call. `out` holds stdout and stderr together, trimmed. */
export interface GitResult {
  readonly code: number;
  readonly out: string;
}
export type Git = (args: ReadonlyArray<string>, cwd: string) => Promise<GitResult>;

const TIMEOUT_MS = 120_000;

/** The computer's own git: its sign-in, its settings. LC_ALL=C keeps messages in English so they can be matched. */
export const realGit: Git = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
        timeout: TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const out = `${stdout}${stderr}`.trim();
        if (!error) return resolve({ code: 0, out });
        if (error.killed) return resolve({ code: 1, out: `git timed out. ${out}`.trim() });
        resolve({ code: typeof error.code === "number" ? error.code : 1, out });
      },
    );
  });

export type FailureKind = "offline" | "locked" | "error";

const OFFLINE =
  /could not resolve host|network is unreachable|failed to connect|connection (?:refused|timed out|reset)|timed out|unable to access.*(?:ssl|tls)/i;
const LOCKED =
  /repository .* not found|not found|does not exist|does not appear to be a git repository|authentication failed|could not read username|permission denied|returned error: 40[134]|access denied|invalid credentials/i;

/** Sorts a failed git call. Offline wins over locked, because a dead network hides the real answer. */
export function classifyFailure(out: string): FailureKind {
  if (OFFLINE.test(out)) return "offline";
  if (LOCKED.test(out)) return "locked";
  return "error";
}

/**
 * The part of a git remote url before the repo name, so Area repos sit beside Home.
 * `https://github.com/org/acme-home.git` gives `https://github.com/org/`.
 * Works for ssh urls and local paths too.
 */
export function remoteBaseOf(url: string): string | null {
  const cut = Math.max(url.lastIndexOf("/"), url.lastIndexOf("\\"), url.lastIndexOf(":"));
  return cut < 0 ? null : url.slice(0, cut + 1);
}

/** Commit identity arguments, only when the computer has none set. Never changes the user's config. */
export async function identityArgs(git: Git, dir: string): Promise<ReadonlyArray<string>> {
  const name = await git(["config", "user.name"], dir);
  const email = await git(["config", "user.email"], dir);
  return name.out && email.out
    ? []
    : ["-c", "user.name=Leonidas Sync", "-c", "user.email=sync@leonidas.invalid"];
}
