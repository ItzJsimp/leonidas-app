// Installs every first-run starter skill into a brand-new scratch AIOS folder the
// same way the welcome wizard does, then checks each one lands in both skill roots
// and loads in Claude Code. `--list <folder>` reports what an AIOS folder has installed.
//
//   node scripts/verify-starter-skills.ts            install + file checks
//   node scripts/verify-starter-skills.ts --live     also ask Claude Code which skills it loaded
//   node scripts/verify-starter-skills.ts --list D:\MyAIOS
import { Console, Effect, FileSystem, Path, Stream } from "effect";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as NodeServices from "@effect/platform-node/NodeServices";

import {
  CORE_SKILLS,
  SKILL_PACKS,
  SKILL_ROOTS,
  skillFiles,
  type BundledSkill,
} from "../apps/web/src/onboarding/skillPacks.ts";

// Claude Code's published SKILL.md limits.
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const services = Effect.provide(NodeServices.layer);
const fileSystem = Effect.runSync(FileSystem.FileSystem.pipe(Effect.provide(NodeServices.layer)));
const path = Effect.runSync(Path.Path.pipe(Effect.provide(NodeServices.layer)));
const log = (line: string) => Effect.runSync(Console.log(line));

interface Frontmatter {
  readonly name?: string;
  readonly description?: string;
}

function parseFrontmatter(text: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (!field) return null;
    let value = field[2]!.trim();
    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length < 2) return null;
      value = JSON.parse(value) as string;
    }
    fields[field[1]!] = value;
  }
  return fields;
}

function checkSkillFile(text: string, folderName: string): string[] {
  const problems: string[] = [];
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter) return ["frontmatter missing or not parseable"];
  const { name, description } = frontmatter;
  if (name !== folderName) problems.push(`name "${name}" does not match folder "${folderName}"`);
  if (!name || !NAME_PATTERN.test(name) || name.length > NAME_MAX) {
    problems.push(`name "${name}" breaks the lowercase-hyphen, 64-character rule`);
  }
  if (!description) problems.push("description missing");
  else {
    if (description.length > DESCRIPTION_MAX) problems.push("description over 1024 characters");
    if (/[<>]/.test(description)) problems.push("description contains < or >");
  }
  if (text.replace(/^---[\s\S]*?\n---\r?\n/, "").trim().length === 0) problems.push("empty body");
  return problems;
}

/** Skill folders under each root of an AIOS folder, with any problems found. */
async function listInstalledSkills(folder: string) {
  const byName = new Map<string, { roots: string[]; problems: string[] }>();
  for (const root of SKILL_ROOTS) {
    const dir = path.join(folder, root);
    if (!(await Effect.runPromise(fileSystem.exists(dir)))) continue;
    for (const name of await Effect.runPromise(fileSystem.readDirectory(dir))) {
      const skillFolder = path.join(dir, name);
      if (!(await isSkillFolder(skillFolder))) continue;
      const file = path.join(skillFolder, "SKILL.md");
      const row = byName.get(name) ?? { roots: [], problems: [] };
      if (await Effect.runPromise(fileSystem.exists(file))) {
        row.roots.push(root);
        for (const p of checkSkillFile(
          await Effect.runPromise(fileSystem.readFileString(file)),
          name,
        )) {
          row.problems.push(`${root}: ${p}`);
        }
      } else row.problems.push(`${root}: folder has no SKILL.md`);
      byName.set(name, row);
    }
  }
  for (const [name, row] of byName) {
    for (const root of SKILL_ROOTS) {
      if (!row.roots.includes(root)) row.problems.push(`missing from ${root}`);
    }
    if (row.roots.length === SKILL_ROOTS.length) {
      const [a, b] = await Promise.all(
        SKILL_ROOTS.map((root) =>
          Effect.runPromise(fileSystem.readFileString(path.join(folder, root, name, "SKILL.md"))),
        ),
      );
      if (a !== b) row.problems.push("the two copies differ");
    }
  }
  return [...byName].toSorted(([a], [b]) => a.localeCompare(b));
}

function isSkillFolder(target: string): Promise<boolean> {
  return Effect.runPromise(
    fileSystem.readLink(target).pipe(
      Effect.as(true),
      Effect.catch((error) => {
        const cause = error.reason.cause;
        return typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          cause.code === "EINVAL"
          ? fileSystem.stat(target).pipe(Effect.map((info) => info.type === "Directory"))
          : Effect.fail(error);
      }),
    ),
  );
}

async function printList(folder: string): Promise<number> {
  const rows = await listInstalledSkills(folder);
  if (rows.length === 0) {
    log(`No skills found under ${SKILL_ROOTS.join(" or ")} in ${folder}`);
    return 1;
  }
  let bad = 0;
  for (const [name, row] of rows) {
    const ok = row.problems.length === 0;
    if (!ok) bad++;
    log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(28)} ${row.roots.join(", ")}`);
    for (const problem of row.problems) log(`       ${problem}`);
  }
  log(`\n${rows.length} skills, ${bad} with problems (${folder})`);
  return bad === 0 ? 0 : 1;
}

// Fixed command lines with no user input, so a shell string is safe; Windows needs the
// shell to resolve the .cmd shims.
function limitOutput<E, R>(stream: Stream.Stream<Uint8Array, E, R>, label: string) {
  return stream.pipe(
    Stream.mapAccum(
      () => 0,
      (size, chunk) => {
        const nextSize = size + chunk.byteLength;
        if (nextSize > MAX_OUTPUT_BYTES) {
          throw new Error(`${label} exceeded ${MAX_OUTPUT_BYTES} bytes`);
        }
        return [nextSize, [chunk]] as const;
      },
    ),
  );
}

export async function run(command: string, folder: string, timeoutMs = 120_000) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    return await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
          const handle = yield* spawner.spawn(
            ChildProcess.make(command, [], { cwd: folder, shell: true }),
          );
          const [, , status] = yield* Effect.all(
            [
              Stream.runForEach(Stream.decodeText(limitOutput(handle.stdout, "stdout")), (text) =>
                Effect.sync(() => {
                  stdout.push(text);
                }),
              ),
              Stream.runForEach(Stream.decodeText(limitOutput(handle.stderr, "stderr")), (text) =>
                Effect.sync(() => {
                  stderr.push(text);
                }),
              ),
              handle.exitCode,
            ],
            { concurrency: "unbounded" },
          ).pipe(Effect.timeout(timeoutMs));
          return {
            stdout: stdout.join(""),
            stderr: stderr.join(""),
            status: Number(status),
            error: undefined,
          };
        }).pipe(services),
      ),
    );
  } catch (error) {
    return {
      stdout: stdout.join(""),
      stderr: stderr.join(""),
      status: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Asks Claude Code, run inside the folder, which skills it discovered at session start (one tiny haiku call). */
async function claudeLoadedSkills(folder: string): Promise<Set<string> | string> {
  const result = await run(
    'claude -p "Reply with OK." --output-format stream-json --verbose --max-turns 1 --model haiku',
    folder,
  );
  if (result.error) return `claude could not start: ${result.error.message}`;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    const event = JSON.parse(line) as {
      type?: string;
      subtype?: string;
      skills?: string[];
      slash_commands?: string[];
    };
    if (event.type === "system" && event.subtype === "init") {
      return new Set([...(event.skills ?? []), ...(event.slash_commands ?? [])]);
    }
  }
  return `no init event from claude (exit ${result.status}): ${result.stderr.slice(0, 300)}`;
}

/** Renders the prompt Codex would send (no model call) and keeps skills read from this folder. */
async function codexLoadedSkills(folder: string): Promise<Set<string> | string> {
  const result = await run("codex debug prompt-input", folder);
  if (result.error) return `codex could not start: ${result.error.message}`;
  const text = result.stdout.replaceAll("\\\\", "/").replaceAll("\\", "/");
  const want = path.join(folder, ".agents", "skills").replaceAll("\\", "/").toLowerCase();
  // Codex lists skill roots as aliases (`r7` = `<path>`), then skills as `(file: r7/<name>/SKILL.md)`.
  const alias = [...text.matchAll(/`(r\d+)` = `([^`]+)`/g)].find(
    (match) => match[2]!.toLowerCase() === want,
  )?.[1];
  if (!alias) return `codex did not read ${want} (exit ${result.status})`;
  const names = [...text.matchAll(new RegExp(`\\(file: ${alias}/([a-z0-9-]+)/SKILL\\.md\\)`, "g"))];
  return new Set(names.map((match) => match[1]!));
}

function reportLive(engine: string, loaded: Set<string> | string, skills: readonly BundledSkill[]) {
  if (typeof loaded === "string") {
    log(`${engine}: check failed, ${loaded}`);
    return false;
  }
  const missing = skills.filter((skill) => !loaded.has(skill.name)).map((skill) => skill.name);
  log(
    `${engine} loaded ${skills.length - missing.length}/${skills.length} starter skills` +
      (missing.length ? `; missing: ${missing.join(", ")}` : ""),
  );
  return missing.length === 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const listIndex = argv.indexOf("--list");
  if (listIndex >= 0) {
    const folder = argv[listIndex + 1];
    if (!folder) {
      Effect.runSync(Console.error("Usage: --list <AIOS folder>"));
      return 2;
    }
    return await printList(path.resolve(folder));
  }

  const skills: BundledSkill[] = [...CORE_SKILLS, ...Object.values(SKILL_PACKS).flat()];
  const folder = await Effect.runPromise(
    fileSystem.makeTempDirectory({ prefix: "leonidas-starter-skills-" }),
  );
  log(`Scratch AIOS folder: ${folder}\nInstalling ${skills.length} skills\n`);
  // Mirrors the wizard: every skill, every root, parent folders created on write.
  for (const skill of skills) {
    for (const root of SKILL_ROOTS) {
      for (const file of skillFiles(skill, root)) {
        const target = path.join(folder, file.relativePath);
        await Effect.runPromise(
          fileSystem.makeDirectory(path.dirname(target), { recursive: true }),
        );
        await Effect.runPromise(fileSystem.writeFileString(target, file.contents));
      }
    }
  }

  let exitCode = await printList(folder);
  const installed = new Set((await listInstalledSkills(folder)).map(([name]) => name));
  for (const skill of skills) {
    if (!installed.has(skill.name)) {
      log(`FAIL ${skill.name}: not written`);
      exitCode = 1;
    }
  }

  if (argv.includes("--live")) {
    log("");
    if (!reportLive("Claude Code", await claudeLoadedSkills(folder), skills)) exitCode = 1;
    if (!reportLive("Codex", await codexLoadedSkills(folder), skills)) exitCode = 1;
  }
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
