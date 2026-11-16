// `vp config` writes a dispatcher stub in .vite-hooks/_ for every Git hook. A stub for a hook with no
// script in .vite-hooks exits at once, but Git still starts a shell for it: about 370 ms each on this
// Windows machine. A commit ran 3 of them, a branch switch 1, a push 1. Delete the stubs nothing uses.
// Run after `vp config`; it is safe to run again.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const KEEP = new Set(["h", ".gitignore"]);

export function pruneHookStubs(hooksDir) {
  const stubDir = NodePath.join(hooksDir, "_");
  if (!NodeFS.existsSync(stubDir)) return [];
  const removed = [];
  for (const name of NodeFS.readdirSync(stubDir)) {
    if (KEEP.has(name) || NodeFS.existsSync(NodePath.join(hooksDir, name))) continue;
    NodeFS.unlinkSync(NodePath.join(stubDir, name));
    removed.push(name);
  }
  return removed;
}

if (process.argv[1] === NodeURL.fileURLToPath(import.meta.url)) {
  const removed = pruneHookStubs(NodePath.join(process.cwd(), ".vite-hooks"));
  if (removed.length > 0) console.log(`Removed ${removed.length} unused hook stubs.`);
}
