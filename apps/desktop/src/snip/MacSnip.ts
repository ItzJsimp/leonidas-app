// @effect-diagnostics nodeBuiltinImport:off -- macOS platform boundary: runs the system screen selector and reads its temporary file with Node.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const MAC_SCREEN_CAPTURE_PATH = "/usr/sbin/screencapture";
// The person picks the area, so allow time. This only stops a selector that never closes.
const MAC_SNIP_TIMEOUT_MS = 10 * 60_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** `-i` is the system selector (drag an area, Space for a window, Esc to cancel). `-x` is silent. */
export function macSnipArguments(outputPath: string): ReadonlyArray<string> {
  return ["-i", "-x", "-t", "png", outputPath];
}

export type MacSnipRun = (args: ReadonlyArray<string>) => Promise<void>;

const runScreenCapture: MacSnipRun = (args) =>
  new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      MAC_SCREEN_CAPTURE_PATH,
      [...args],
      { timeout: MAC_SNIP_TIMEOUT_MS },
      (error) => (error ? reject(error) : resolve()),
    );
  });

/**
 * Runs the system selector and returns the PNG, or null when the person cancelled.
 * Esc leaves no file, and the exit code varies, so a missing file is a cancel. A string error
 * code (ENOENT, EACCES) means the tool itself could not run, and that is a real failure.
 */
export async function captureMacSnip(run: MacSnipRun = runScreenCapture): Promise<Buffer | null> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "leonidas-snip-"));
  const outputPath = NodePath.join(directory, "snip.png");
  try {
    await run(macSnipArguments(outputPath)).catch((error: unknown) => {
      if (typeof (error as { code?: unknown } | null)?.code === "string") throw error;
    });
    const png = await NodeFSP.readFile(outputPath).catch(() => null);
    if (png === null || png.length === 0) return null;
    if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error("macOS returned an invalid snip.");
    }
    return png;
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
}
