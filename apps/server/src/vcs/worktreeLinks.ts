// @effect-diagnostics nodeBuiltinImport:off - Effect FileSystem has no lstat, and a link must be seen without following it.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

// shortcut: pnpm links inside node_modules point into the same tree, so they are skipped to keep
// the walk fast. Upgrade this if a link there ever points outside the worktree.
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

/**
 * Removes every junction and symlink under `root` without entering one, and returns how many it
 * cut. `git worktree remove` and `git clean` delete through a link into its target, so a worktree
 * that links AIOS skill folders would empty them (2026-11-07: 49 AIOS skill files). Returns 0 for a
 * folder that is not a worktree root. Throws when a link cannot be cut: the caller must then not
 * remove the worktree.
 */
export async function cutWorktreeLinks(root: string): Promise<number> {
  // The path can come from a client: only walk a folder with a ".git" entry (a worktree root).
  // Any other path is left for Git to refuse.
  try {
    await NodeFSP.lstat(NodePath.join(root, ".git"));
  } catch {
    return 0;
  }
  let cut = 0;
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = NodePath.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        await NodeFSP.unlink(path);
        cut += 1;
      } else if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
        await walk(path);
      }
    }
  };
  await walk(root);
  return cut;
}
