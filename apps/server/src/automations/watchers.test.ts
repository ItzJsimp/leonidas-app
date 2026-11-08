// @effect-diagnostics nodeBuiltinImport:off - tests build real git repos and AIOS folders in temp.
// @effect-diagnostics globalDate:off - tests set file and commit times.
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { type AutomationState, BUILT_INS, runBuiltIn, scheduleText } from "./catalog.ts";
import { type CheckInput, decideNotify, type Exec, execFile } from "./check.ts";
import { isFreeStep, makeFreeChat } from "./freeChat.ts";
import { type DigestDeps, FRONTIER_SOURCES, parseFeed } from "./frontierDigest.ts";

const roots: string[] = [];
const temp = (prefix: string) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const NOW = Date.parse("2026-11-07T12:00:00Z");
const DAY = 86_400_000;
const builtIn = (id: string) => BUILT_INS.find((entry) => entry.id === id)!;
const noDigest: DigestDeps = { fetchText: async () => null, freeChat: async () => null };

/** Runs a built-in twice on the same state and counts the events, the way the scheduler does. */
async function eventsOverTwoRuns(id: string, input: CheckInput, deps: DigestDeps = noDigest) {
  let state: AutomationState | undefined;
  let events = 0;
  for (let run = 0; run < 2; run++) {
    const output = await runBuiltIn(builtIn(id), state, input, deps);
    if (output.event !== null) events++;
    state = output.state;
  }
  return events;
}

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-11-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-11-01T12:00:00Z",
    },
  });

/** An AIOS with a builder repo whose `origin` has one commit. */
function builderAios() {
  const aios = temp("aios-");
  const origin = temp("origin-");
  git(origin, "init", "-q", "--bare", "-b", "main");
  const repo = NodePath.join(aios, "projects", "leonidas-code");
  NodeFS.mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "origin", "main");
  return { aios, repo };
}

const input = (aios: string, repo: string | null, exec: Exec = execFile): CheckInput => ({
  aiosRoot: aios,
  repoPath: repo,
  now: NOW,
  exec,
  dryRun: false,
  lastRunAt: null,
});

describe("decideNotify", () => {
  const findings = (...keys: string[]) =>
    ({
      status: "findings",
      level: "failed",
      title: "t",
      summary: "s",
      findings: keys.map((key) => ({ key, text: key })),
    }) as const;
  it("sends once for a new set, never for the same or a smaller set, and resets on clean", () => {
    expect(decideNotify([], findings("a", "b")).notify).toBe(true);
    expect(decideNotify(["a", "b"], findings("b", "a")).notify).toBe(false);
    expect(decideNotify(["a", "b"], findings("a")).notify).toBe(false);
    expect(decideNotify(["a"], findings("a", "c")).notify).toBe(true);
    expect(decideNotify(["a"], { status: "ok", summary: "" })).toEqual({
      notify: false,
      remember: [],
    });
    expect(decideNotify(["a"], { status: "skipped", summary: "" }).remember).toEqual(["a"]);
  });
});

describe("repo-health", () => {
  it("a clean repo sends no event", async () => {
    const { aios, repo } = builderAios();
    expect(await eventsOverTwoRuns("repo-health", input(aios, repo))).toBe(0);
  });

  it("an old unpushed worktree sends exactly one event", async () => {
    const { aios, repo } = builderAios();
    const worktree = NodePath.join(temp("wt-"), "fake");
    git(repo, "worktree", "add", "-q", "-b", "task/fake", worktree);
    git(worktree, "commit", "-q", "--allow-empty", "-m", "unpushed work");
    const output = await runBuiltIn(builtIn("repo-health"), undefined, input(aios, repo), noDigest);
    expect(output.report.join("\n")).toContain("task/fake: 1 unpushed commit");
    expect(await eventsOverTwoRuns("repo-health", input(aios, repo))).toBe(1);
  });
});

describe("release-health", () => {
  const fakeGh =
    (conclusion: string, smoke: string): Exec =>
    async (command, args) => {
      if (command === "git")
        return { code: 0, stdout: "https://github.com/ItzJsimp/leonidas-app.git\n", stderr: "" };
      if (args[1] === "list") {
        return {
          code: 0,
          stdout: JSON.stringify([
            { databaseId: 7, conclusion, url: "https://x/7", headSha: "abcdef1234" },
          ]),
          stderr: "",
        };
      }
      return {
        code: 0,
        stdout: JSON.stringify({
          jobs: [{ steps: [{ name: "Check the server boots and answers", conclusion: smoke }] }],
        }),
        stderr: "",
      };
    };
  it("a passing release sends no event", async () => {
    expect(
      await eventsOverTwoRuns(
        "release-health",
        input("/aios", "/repo", fakeGh("success", "success")),
      ),
    ).toBe(0);
  });
  it("a failed boot smoke sends exactly one event", async () => {
    expect(
      await eventsOverTwoRuns(
        "release-health",
        input("/aios", "/repo", fakeGh("failure", "failure")),
      ),
    ).toBe(1);
  });
  it("no gh gives a skipped run and no event", async () => {
    const noGh: Exec = async (command) =>
      command === "git"
        ? { code: 0, stdout: "git@github.com:a/b.git", stderr: "" }
        : { code: null, stdout: "", stderr: "" };
    const output = await runBuiltIn(
      builtIn("release-health"),
      undefined,
      input("/aios", "/repo", noGh),
      noDigest,
    );
    expect(output.state.lastResult).toBe("skipped");
    expect(output.event).toBeNull();
  });
});

describe("upstream-digest", () => {
  const withLedger = (keys: string[]) => {
    const repo = temp("repo-");
    NodeFS.mkdirSync(NodePath.join(repo, "project"));
    NodeFS.writeFileSync(
      NodePath.join(repo, "project", "upstream-review-ledger.json"),
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, { verdict: "seen" }]))),
    );
    return repo;
  };
  const fakeGit =
    (log: string): Exec =>
    async (_command, args) => ({
      code: 0,
      stdout: args.includes("remote") ? "origin\nupstream\n" : args.includes("log") ? log : "",
      stderr: "",
    });
  const sha = "1234567890abcdef";
  it("commits already in the ledger send no event", async () => {
    const repo = withLedger(["1234567890"]);
    expect(
      await eventsOverTwoRuns(
        "upstream-digest",
        input("/aios", repo, fakeGit(`${sha}\tfix: thing\n`)),
      ),
    ).toBe(0);
  });
  it("a new upstream commit sends exactly one event", async () => {
    const repo = withLedger([]);
    expect(
      await eventsOverTwoRuns(
        "upstream-digest",
        input("/aios", repo, fakeGit(`${sha}\tfix: thing\n`)),
      ),
    ).toBe(1);
  });
});

describe("canon-drift", () => {
  const aiosWith = (agents: string) => {
    const aios = temp("aios-");
    NodeFS.mkdirSync(NodePath.join(aios, "standards"));
    NodeFS.writeFileSync(NodePath.join(aios, "standards", "real.md"), "# Real\n");
    NodeFS.writeFileSync(NodePath.join(aios, "AGENTS.md"), agents);
    return aios;
  };
  it("clean links and paths send no event", async () => {
    const aios = aiosWith(
      "See [real](./standards/real.md), `standards/real.md` and [web](https://x.dev).\n```\n[ignored](./nope.md)\n```\n",
    );
    expect(await eventsOverTwoRuns("canon-drift", input(aios, null))).toBe(0);
  });
  it("one broken link sends exactly one event", async () => {
    const aios = aiosWith("See [gone](./standards/gone.md).\n");
    const output = await runBuiltIn(builtIn("canon-drift"), undefined, input(aios, null), noDigest);
    expect(output.report.join("\n")).toContain("AGENTS.md: broken link ./standards/gone.md");
    expect(await eventsOverTwoRuns("canon-drift", input(aios, null))).toBe(1);
  });
});

describe("frontier-digest", () => {
  const feed = `<rss><channel><item><title>Agents get hooks</title><link>https://example.com/a</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Old</title><link>https://example.com/old</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const answer = JSON.stringify({
    proposals: [
      {
        title: "Teach hooks in the build skill",
        change: "Add a hooks step.",
        target: "build",
        url: "https://example.com/a",
      },
    ],
  });

  it("reads only items newer than the window", () => {
    expect(parseFeed(feed, NOW - 7 * DAY).map((item) => item.title)).toEqual(["Agents get hooks"]);
  });

  it("the free guard refuses paid models", () => {
    expect(isFreeStep({ engine: "openrouter", model: "openrouter/free", key: "k" })).toBe(true);
    expect(isFreeStep({ engine: "openrouter", model: "qwen/qwen3-coder:free", key: "k" })).toBe(
      true,
    );
    expect(isFreeStep({ engine: "openrouter", model: "anthropic/claude-opus-5-5", key: "k" })).toBe(
      false,
    );
  });

  it("a dry run makes 0 paid calls and writes no file", async () => {
    const aios = temp("aios-");
    const calls: Parameters<typeof isFreeStep>[0][] = [];
    const fetchModel = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: answer } }] }),
      )) as unknown as typeof fetch;
    const freeChat = makeFreeChat(
      [
        { engine: "openrouter", model: "anthropic/claude-opus-5-5", key: "paid" },
        { engine: "groq", model: "qwen/qwen3.8-27b", key: "free" },
      ],
      { fetch: fetchModel, calls },
    );
    const deps: DigestDeps = {
      fetchText: async () => feed,
      freeChat,
      sources: [FRONTIER_SOURCES.find((s) => s.kind === "feed")!],
    };
    const output = await runBuiltIn(
      builtIn("frontier-digest"),
      undefined,
      { ...input(aios, null), dryRun: true },
      deps,
    );
    expect(calls.map((call) => call.engine)).toEqual(["groq"]);
    expect(calls.every(isFreeStep)).toBe(true);
    expect(output.report).toContain("Paid model calls: 0");
    expect(output.report.join("\n")).toContain("Proposal: Teach hooks in the build skill");
    expect(NodeFS.readdirSync(aios)).toEqual([]);
  });

  it("a real run files one task card and sends exactly one event", async () => {
    const aios = temp("aios-");
    const deps: DigestDeps = {
      fetchText: async () => feed,
      freeChat: async () => ({ text: answer, engine: "groq", model: "qwen" }),
      sources: [FRONTIER_SOURCES.find((s) => s.kind === "feed")!],
    };
    expect(await eventsOverTwoRuns("frontier-digest", input(aios, null), deps)).toBe(1);
    const card = NodeFS.readFileSync(
      NodePath.join(aios, "tasks", "frontier-teach-hooks-in-the-build-skill.md"),
      "utf8",
    );
    expect(card).toContain("autonomous: false");
  });
});

describe("scheduleText", () => {
  it("reads in plain 12-hour words", () => {
    expect(scheduleText({ type: "interval", everyMs: 3_600_000 })).toBe("Every hour");
    expect(scheduleText({ type: "fixed_time", timeOfDay: "18:00", weekdays: [0] })).toBe(
      "Sundays at 6:00 PM",
    );
    expect(scheduleText({ type: "fixed_time", timeOfDay: "08:00" })).toBe("Daily at 8:00 AM");
  });
});
