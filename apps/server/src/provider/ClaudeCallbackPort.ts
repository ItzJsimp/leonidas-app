/**
 * `claude auth login` listens on a random 127.0.0.1 port for the browser to
 * return to, but it prints only the manual link (the one that shows a code).
 * These helpers find that port so the sign-in page can return automatically.
 */

export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
}

export interface Listener {
  readonly pid: number;
  readonly port: number;
}

const LOOPBACK = /^(127\.0\.0\.1|\[::1\]|localhost)$/u;

/** One `pid ppid` pair per line (`ps -A -o pid=,ppid=` or the Windows script). */
export function parseProcessRows(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/u.exec(line);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

function splitAddress(address: string): { host: string; port: number } | null {
  const cut = address.lastIndexOf(":");
  if (cut < 0) return null;
  const port = Number(address.slice(cut + 1));
  return Number.isInteger(port) && port > 0 && port <= 65_535
    ? { host: address.slice(0, cut), port }
    : null;
}

/** Loopback listeners from `netstat -ano -p tcp` on Windows. */
export function parseNetstatListeners(output: string): Listener[] {
  const listeners: Listener[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const parts = line.trim().split(/\s+/u);
    if (parts.length < 5 || parts[0] !== "TCP" || parts[3] !== "LISTENING") continue;
    const local = splitAddress(parts[1]!);
    const pid = Number(parts[4]);
    if (local && LOOPBACK.test(local.host) && Number.isInteger(pid)) {
      listeners.push({ pid, port: local.port });
    }
  }
  return listeners;
}

/** Loopback listeners from `lsof -nP -iTCP -sTCP:LISTEN -Fpn` on macOS and Linux. */
export function parseLsofListeners(output: string): Listener[] {
  const listeners: Listener[] = [];
  let pid: number | null = null;
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null) {
      const local = splitAddress(line.slice(1));
      if (local && LOOPBACK.test(local.host)) listeners.push({ pid, port: local.port });
    }
  }
  return listeners;
}

/**
 * The one loopback port the process tree under `rootPid` listens on, or null
 * when there is none or more than one (the caller then keeps the manual link).
 */
export function findCallbackPort(
  rows: ReadonlyArray<ProcessRow>,
  listeners: ReadonlyArray<Listener>,
  rootPid: number,
): number | null {
  const tree = new Set<number>([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (tree.has(row.ppid) && !tree.has(row.pid)) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  const ports = new Set(listeners.filter((l) => tree.has(l.pid)).map((l) => l.port));
  return ports.size === 1 ? [...ports][0]! : null;
}

/** Point the sign-in page at the CLI's local listener instead of the code page. */
export function withAutomaticCallback(authorizationUrl: string, port: number): string {
  const url = new URL(authorizationUrl);
  url.searchParams.set("redirect_uri", `http://localhost:${port}/callback`);
  return url.toString();
}
