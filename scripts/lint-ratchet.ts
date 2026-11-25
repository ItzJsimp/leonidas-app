// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - CLI script that runs the linter and reads the baseline file.
// Fails on any lint error that the baseline does not list. The baseline only shrinks:
// a fixed error also fails until `node scripts/lint-ratchet.ts --update` records it.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as Schema from "effect/Schema";

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

export type ErrorCounts = Readonly<Record<string, number>>;

interface LintDiagnostic {
  readonly code?: string;
  readonly severity: string;
  readonly filename?: string;
  readonly message: string;
  readonly labels?: ReadonlyArray<{ readonly span?: { readonly line?: number } }>;
}

const keyOf = (diagnostic: LintDiagnostic) =>
  `${diagnostic.filename ?? "?"}\t${diagnostic.code ?? "parse-error"}`;

export function countErrors(diagnostics: ReadonlyArray<LintDiagnostic>): ErrorCounts {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error") continue;
    const key = keyOf(diagnostic);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)));
}

export function compareCounts(baseline: ErrorCounts, actual: ErrorCounts) {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(actual)]);
  const grown: Array<string> = [];
  const shrunk: Array<string> = [];
  for (const key of keys) {
    const before = baseline[key] ?? 0;
    const after = actual[key] ?? 0;
    if (after > before) grown.push(key);
    if (after < before) shrunk.push(key);
  }
  return { grown: grown.toSorted(), shrunk: shrunk.toSorted() };
}

function runLint(repoRoot: string): ReadonlyArray<LintDiagnostic> {
  // One command string through the shell: Windows needs it to start vp.cmd.
  const result = NodeChildProcess.spawnSync(
    "vp lint --format json --report-unused-disable-directives",
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, shell: true },
  );
  const start = result.stdout.indexOf("{");
  if (start === -1) {
    throw new Error(`vp lint printed no JSON report (exit ${result.status}):\n${result.stderr}`);
  }
  return (decodeJson(result.stdout.slice(start)) as { diagnostics: Array<LintDiagnostic> })
    .diagnostics;
}

function main(): number {
  const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
  const baselinePath = NodePath.join(repoRoot, "scripts/lint-baseline.json");
  const update = process.argv.includes("--update");
  const diagnostics = runLint(repoRoot);
  const actual = countErrors(diagnostics);
  const firstRun = !NodeFS.existsSync(baselinePath);
  const baseline = (
    firstRun ? {} : decodeJson(NodeFS.readFileSync(baselinePath, "utf8"))
  ) as ErrorCounts;
  const { grown, shrunk } = compareCounts(baseline, actual);
  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

  // Only the first --update may record errors: later runs can never add one.
  if (grown.length > 0 && !(update && firstRun)) {
    console.error(`New lint errors in ${grown.length} file and rule pairs:`);
    for (const key of grown) {
      const [file, rule] = key.split("\t");
      console.error(`\n${file} ${rule}: ${baseline[key] ?? 0} -> ${actual[key]}`);
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === "error" && keyOf(diagnostic) === key) {
          console.error(
            `  line ${diagnostic.labels?.[0]?.span?.line ?? "?"}: ${diagnostic.message}`,
          );
        }
      }
    }
    return 1;
  }
  if (shrunk.length > 0 && !update) {
    console.error(
      `${shrunk.length} file and rule pairs have fewer errors. Run \`node scripts/lint-ratchet.ts --update\` and commit scripts/lint-baseline.json.`,
    );
    return 1;
  }
  if (update) {
    NodeFS.writeFileSync(baselinePath, `${encodeJson(actual)}\n`);
  }
  console.log(`Lint ratchet passed: ${total} known errors, none new.`);
  return 0;
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
