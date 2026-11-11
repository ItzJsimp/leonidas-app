// @effect-diagnostics nodeBuiltinImport:off - runs before `vp i`, so only Node built-ins exist.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const ENV_FILES = [".env", NodePath.join("infra", "relay", ".env")];

const projectRoot = process.env.T3CODE_PROJECT_ROOT;
if (!projectRoot) {
  throw new Error("T3CODE_PROJECT_ROOT is not set. Run this through the t3.json setup action.");
}
const worktree = NodePath.dirname(import.meta.dirname);

// A no-op `vp i` still costs about 10 s. The stamp lives in node_modules, so a
// deleted install loses it, and it is written only after a successful install.
const stampPath = NodePath.join(worktree, "node_modules", ".leonidas-install-stamp");
const stamp = NodeCrypto.createHash("sha256")
  .update(process.version)
  .update(NodeFS.readFileSync(NodePath.join(worktree, "package.json")))
  .update(NodeFS.readFileSync(NodePath.join(worktree, "pnpm-lock.yaml")))
  .update(NodeFS.readFileSync(NodePath.join(worktree, "pnpm-workspace.yaml")))
  .digest("hex");
const installIsCurrent =
  NodeFS.existsSync(NodePath.join(worktree, "node_modules", ".modules.yaml")) &&
  NodeFS.existsSync(stampPath) &&
  NodeFS.readFileSync(stampPath, "utf8").trim() === stamp;

if (!installIsCurrent) {
  // `shell` resolves `vp` through PATH, including Windows command shims.
  const install = NodeChildProcess.spawnSync("vp i", {
    cwd: worktree,
    shell: true,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
  NodeFS.writeFileSync(stampPath, `${stamp}\n`);
}

// Env files live as real files in the main checkout; worktrees only get
// symlinks to them. Only a symlink is ever replaced, so a real env file is
// never deleted, including when this runs in the main checkout itself.
for (const file of ENV_FILES) {
  const source = NodePath.join(projectRoot, file);
  const sourceStat = NodeFS.lstatSync(source, { throwIfNoEntry: false });
  if (!sourceStat) continue;
  if (!sourceStat.isFile()) {
    process.stderr.write(`Skipping ${file}: ${source} is not a regular file.\n`);
    continue;
  }
  const target = NodePath.join(worktree, file);
  const existing = NodeFS.lstatSync(target, { throwIfNoEntry: false });
  if (existing && !existing.isSymbolicLink()) continue;
  if (existing) NodeFS.rmSync(target);
  NodeFS.symlinkSync(source, target);
}

const warm = NodeChildProcess.spawnSync(
  process.execPath,
  [NodePath.join(worktree, "apps", "web", "scripts", "warm-dep-cache.ts")],
  { cwd: worktree, stdio: "inherit" },
);
process.exit(warm.status ?? 1);
