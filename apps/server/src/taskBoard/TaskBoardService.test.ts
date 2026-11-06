// @effect-diagnostics nodeBuiltinImport:off globalDate:off - temp AIOS folders are plain Node fixtures.
import { expect, it } from "@effect/vitest";
import type { Project, TaskBoardTask } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as ProcessRunner from "../processRunner.ts";
import * as TaskBoardService from "./TaskBoardService.ts";
import { ServerConfig } from "../config.ts";

const issue = {
  number: 12,
  title: "Build the board",
  url: "https://github.com/ItzJsimp/leonidas-code/issues/12",
  updatedAt: "2026-10-10T12:00:00Z",
  labels: [{ name: "feature" }],
  assignees: [{ login: "vMobxAi" }],
};

const output = (stdout: string, code = 0, stderr = ""): ProcessRunner.ProcessRunOutput => ({
  stdout,
  stderr,
  code: code as ProcessRunner.ProcessRunOutput["code"],
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
});

const boardProject = {
  id: "project-board",
  title: "Leonidas Code",
  workspaceRoot: "D:/leonidas-code",
  repositoryIdentity: {
    canonicalKey: "github.com/ItzJsimp/leonidas-code",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/ItzJsimp/leonidas-code.git",
    },
    provider: "github",
    displayName: "ItzJsimp/leonidas-code",
    owner: "ItzJsimp",
    name: "leonidas-code",
  },
} as Project;

// Counts issue reads and records every write; branch lookups are answered so persist can complete.
const boardRunner = (
  onIssueRead: () => void,
  issueResponse = output(JSON.stringify([issue])),
  onWrite: (args: ReadonlyArray<string>) => void = () => {},
) =>
  ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.gen(function* () {
        if (input.args.some((arg) => arg.includes("matching-refs"))) return output("[]");
        if (input.args[1] === "repos/ItzJsimp/leonidas-code") {
          return output(JSON.stringify({ default_branch: "main" }));
        }
        if (
          input.args.some((arg) => arg.startsWith("repos/ItzJsimp/leonidas-code/git/ref/heads/"))
        ) {
          return output(JSON.stringify({ object: { sha: "abc123" } }));
        }
        if (input.args.includes("PUT") || input.args.includes("POST")) {
          // Writes carry their body on stdin; tests read it as a `content=` argument.
          const body = input.stdin ? (JSON.parse(input.stdin) as { content: string }) : null;
          onWrite(body ? [...input.args, `content=${body.content}`] : input.args);
          return output("{}");
        }
        onIssueRead();
        yield* Effect.yieldNow;
        return issueResponse;
      }),
  });

const boardLayer = (runner: ReturnType<typeof boardRunner>) =>
  TaskBoardService.layer.pipe(Layer.provide(Layer.succeed(ProcessRunner.ProcessRunner, runner)));

it.effect("reads a shared board branch with GET despite the ref field", () => {
  let contentsReads = 0;
  const runner = ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        const endpoint = input.args[1] ?? "";
        if (endpoint.includes("matching-refs")) {
          return output(JSON.stringify([{ ref: `refs/heads/${endpoint.split("/heads/")[1]}` }]));
        }
        if (endpoint.includes("/contents/")) {
          contentsReads++;
          expect(input.args).toEqual(expect.arrayContaining(["--method", "GET"]));
          return output(
            JSON.stringify({
              content: Buffer.from(JSON.stringify({ version: 1, tasks: [] })).toString("base64"),
              sha: "board-sha",
            }),
          );
        }
        return output("[]");
      }),
  });
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    expect((yield* board.list(boardProject)).tasks).toHaveLength(0);
    expect(contentsReads).toBe(1);
  }).pipe(Effect.provide(boardLayer(runner)));
});

it.effect.each([
  [
    "reports disabled Issues explicitly",
    output("", 1, "the repository has disabled issues"),
    "issues_disabled",
  ],
  [
    "reports GitHub failures without exposing stderr",
    output("", 1, "sensitive provider response"),
    "request_failed",
  ],
  ["rejects malformed GitHub JSON", output("not json"), "invalid_response"],
  ["rejects malformed issue records", output(JSON.stringify([{ number: -1 }])), "invalid_response"],
] as const)("%s", ([_name, response, reason]) =>
  Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    const result = yield* Effect.result(board.list(boardProject));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.reason).toBe(reason);
      expect(result.failure.message).not.toContain("sensitive provider response");
    }
  }).pipe(Effect.provide(boardLayer(boardRunner(() => {}, response)))),
);

it.effect("shares one GitHub read between concurrent board loads", () => {
  let issueReads = 0;
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    yield* Effect.all(
      [board.list(boardProject), board.list(boardProject), board.list(boardProject)],
      {
        concurrency: "unbounded",
      },
    );
    expect(issueReads).toBe(1);
  }).pipe(Effect.provide(boardLayer(boardRunner(() => issueReads++))));
});

it.effect("reuses a successful board read for five seconds", () => {
  let issueReads = 0;
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    yield* board.list(boardProject);
    yield* board.list(boardProject);
    expect(issueReads).toBe(1);
    yield* TestClock.adjust("4 seconds");
    yield* board.list(boardProject);
    expect(issueReads).toBe(1);
    yield* TestClock.adjust("2 seconds");
    yield* board.list(boardProject);
    expect(issueReads).toBe(2);
  }).pipe(Effect.provide(boardLayer(boardRunner(() => issueReads++))));
});

it.effect("backs off repeated failed board reads: 10 s, then 20 s", () => {
  let issueReads = 0;
  const failure = output("", 1, "request_failed");
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    expect((yield* Effect.result(board.list(boardProject)))._tag).toBe("Failure");
    expect(issueReads).toBe(1);
    yield* TestClock.adjust("9 seconds");
    expect((yield* Effect.result(board.list(boardProject)))._tag).toBe("Failure");
    expect(issueReads).toBe(1);
    yield* TestClock.adjust("1 second");
    expect((yield* Effect.result(board.list(boardProject)))._tag).toBe("Failure");
    expect(issueReads).toBe(2);
    yield* TestClock.adjust("19 seconds");
    yield* Effect.result(board.list(boardProject));
    expect(issueReads).toBe(2);
    yield* TestClock.adjust("1 second");
    yield* Effect.result(board.list(boardProject));
    expect(issueReads).toBe(3);
  }).pipe(Effect.provide(boardLayer(boardRunner(() => issueReads++, failure))));
});

it.effect("drops the cached board after a write so the next load reads GitHub", () => {
  let issueReads = 0;
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    yield* board.list(boardProject);
    yield* board.create(boardProject, {
      projectId: boardProject.id,
      actor: "Jake",
      title: "Second task",
    });
    const beforeList = issueReads;
    yield* board.list(boardProject);
    expect(issueReads).toBe(beforeList + 1);
  }).pipe(Effect.provide(boardLayer(boardRunner(() => issueReads++))));
});

// A throwaway AIOS: tasks/ holds the cards and projects/leonidas-code is the Leonidas project folder.
const withAios = <A, E, R>(
  cards: Readonly<Record<string, string>>,
  use: (root: string, project: Project) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = NodeFS.realpathSync(
        NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-board-")),
      );
      NodeFS.mkdirSync(NodePath.join(root, "tasks"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(root, "projects", "leonidas-code"), { recursive: true });
      for (const [name, contents] of Object.entries(cards)) {
        NodeFS.writeFileSync(NodePath.join(root, "tasks", name), contents);
      }
      const previous = process.env.LEONIDAS_AIOS_ROOT;
      process.env.LEONIDAS_AIOS_ROOT = root;
      return { root, previous };
    }),
    ({ root }) =>
      use(root, {
        ...boardProject,
        workspaceRoot: NodePath.join(root, "projects", "leonidas-code"),
      } as Project),
    ({ root, previous }) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.LEONIDAS_AIOS_ROOT;
        else process.env.LEONIDAS_AIOS_ROOT = previous;
        NodeFS.rmSync(root, { recursive: true, force: true });
      }),
  );

const cardFile = (id: string, name: string, extra = "") =>
  `---\ntype: task\nid: ${id}\nname: "${name}"\nstatus: "Not started"\npriority: "High"\nproject: "leonidas-code"\n${extra}---\n# ${name}\n`;

const noGithub = boardRunner(() => {});

it.effect("shares fork tasks with the origin repository instead of upstream", () =>
  withAios({ "one.md": cardFile("task-one", "First card") }, (_root, project) => {
    const fork = {
      ...project,
      repositoryIdentity: {
        ...project.repositoryIdentity!,
        owner: "pingdotgg",
        name: "t3code",
        canonicalKey: "github.com/pingdotgg/t3code",
        origin: { canonicalKey: "github.com/ItzJsimp/leonidas-code" },
      },
    };
    const writes: ReadonlyArray<string>[] = [];
    return Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const workspace = yield* board.workspace([fork]);
      expect(workspace.projects.find((entry) => entry.slug === "leonidas-code")?.repository).toBe(
        "ItzJsimp/leonidas-code",
      );
      yield* board.share(fork, { projectId: fork.id, shared: true, actor: "Jake" });
      expect(writes.some((args) => args.includes("PUT"))).toBe(true);
      expect(writes.every((args) => !args.some((arg) => arg.includes("pingdotgg")))).toBe(true);
    }).pipe(
      Effect.provide(
        boardLayer(
          boardRunner(
            () => {},
            output("[]"),
            (args) => writes.push(args),
          ),
        ),
      ),
    );
  }),
);

it.effect("replays a saved-item task conversion without creating another task file", () =>
  withAios({}, (_root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const input = {
        title: 'Save quotes: "雪"',
        description: "Prompt\r\n---\nBody",
        actor: "Mob",
        idempotencyKey: "saved-conversion:one",
        projectId: project.id,
      };
      const first = yield* board.cardCreate(input, [project]);
      const second = yield* board.cardCreate(input, [project]);
      expect(second.id).toBe(first.id);
      expect(first.projectSlug).toBe("leonidas-code");
      expect((yield* board.workspace([project])).tasks).toHaveLength(1);
    }).pipe(Effect.provide(boardLayer(noGithub))),
  ),
);

it.effect("publishes native tasks through the existing shared project board", () => {
  const writes: ReadonlyArray<string>[] = [];
  return withAios({}, (root, project) => {
    const stateDir = NodePath.join(root, "native-state");
    return Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const task = yield* board.cardCreate(
        {
          title: "Native shared task",
          actor: "Jake",
          projectSlug: "leonidas-code",
          due: "2026-10-13",
        },
        [project],
      );
      yield* board.share(project, {
        projectId: project.id,
        taskIds: [task.id],
        shared: true,
        actor: "Jake",
      });
      const content = writes
        .find((args) => args.includes("PUT"))
        ?.find((arg) => arg.startsWith("content="));
      const published = JSON.parse(
        Buffer.from(content!.slice("content=".length), "base64").toString("utf8"),
      );
      expect(published.tasks).toHaveLength(1);
      expect(published.tasks[0]).toMatchObject({ id: task.id, shared: true, due: "2026-10-13" });
      expect(published.tasks[0]).not.toHaveProperty("sourceRoot");
      expect(
        (yield* board.workspace([project])).tasks.find((item) => item.id === task.id)?.shared,
      ).toBe(true);
    }).pipe(
      Effect.provide(
        boardLayer(
          boardRunner(
            () => {},
            output("[]"),
            (args) => writes.push(args),
          ),
        ).pipe(Layer.provide(Layer.succeed(ServerConfig, { stateDir } as ServerConfig["Service"]))),
      ),
    );
  });
});

it.effect("keeps imported cards editable while new tasks use native storage", () =>
  withAios({ "plan.md": cardFile("task-plan-the-day", "Plan the day") }, (root, project) => {
    const stateDir = NodePath.join(root, "native-state");
    return Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const native = yield* board.cardCreate({ title: "Plan the day", actor: "Jake" }, [project]);
      expect(native.id).not.toBe("task-plan-the-day");
      const imported = yield* board.cardUpdate(
        { taskId: "task-plan-the-day", actor: "Jake", due: "2026-10-13" },
        [project],
      );
      expect(imported.due).toBe("2026-10-13");
      const workspace = yield* board.workspace([project]);
      expect(workspace.tasks).toHaveLength(2);
      expect(workspace.tasks.find((item) => item.id === native.id)?.sourceRoot).toBe(
        NodePath.join(stateDir, "task-board"),
      );
      expect(NodeFS.readdirSync(NodePath.join(root, "tasks"))).toEqual(["plan.md"]);
      NodeFS.writeFileSync(
        NodePath.join(root, "tasks", "copy.md"),
        cardFile(native.id, "Imported copy"),
      );
      const deduped = yield* board.workspace([project]);
      expect(deduped.tasks).toHaveLength(2);
      expect(deduped.tasks.find((item) => item.id === native.id)?.title).toBe("Plan the day");
    }).pipe(
      Effect.provide(
        boardLayer(noGithub).pipe(
          Layer.provide(Layer.succeed(ServerConfig, { stateDir } as ServerConfig["Service"])),
        ),
      ),
    );
  }),
);

it.effect("owns native tasks without an AIOS and persists dates, completion and reopening", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "leonidas tasks café-"))),
    (stateDir) =>
      Effect.gen(function* () {
        const board = yield* TaskBoardService.TaskBoardService;
        const created = yield* board.cardCreate(
          { title: "Plan the day", actor: "Jake", due: "2026-10-12", projectSlug: "personal-work" },
          [],
        );
        expect(created.due).toBe("2026-10-12");
        const listed = yield* board.workspace([]);
        expect(listed.tasks.map((item) => item.id)).toContain(created.id);
        expect(listed.aiosRoot).toBeNull();
        expect(listed.projects).toContainEqual(
          expect.objectContaining({ slug: "personal-work", projectId: null }),
        );
        const done = yield* board.cardUpdate(
          { taskId: created.id, actor: "Jake", status: "done", due: null },
          [],
        );
        expect(done.status).toBe("done");
        expect(done.due).toBeNull();
        const reopened = yield* board.cardUpdate(
          { taskId: created.id, actor: "Jake", status: "todo" },
          [],
        );
        expect(reopened.completedAt).toBeNull();
        expect(NodeFS.readdirSync(NodePath.join(stateDir, "task-board", "tasks"))).toHaveLength(1);
      }).pipe(
        Effect.provide(
          boardLayer(noGithub).pipe(
            Layer.provide(Layer.succeed(ServerConfig, { stateDir } as ServerConfig["Service"])),
          ),
        ),
      ),
    (stateDir) => Effect.sync(() => NodeFS.rmSync(stateDir, { recursive: true, force: true })),
  ),
);

it.effect("persists native card milestones through create, read, update and clear", () =>
  withAios({}, (root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const created = yield* board.cardCreate(
        { title: "Plan release", actor: "Jake", due: "2026-10-12", milestone: "0.22.0" },
        [project],
      );
      expect(created).toMatchObject({ milestone: "0.22.0", due: "2026-10-12" });
      const changed = yield* board.cardUpdate(
        { taskId: created.id, actor: "Jake", milestone: "1.0.0" },
        [project],
      );
      expect(changed).toMatchObject({ milestone: "1.0.0", due: "2026-10-12" });
      const cleared = yield* board.cardUpdate(
        { taskId: created.id, actor: "Jake", milestone: null },
        [project],
      );
      expect(cleared).toMatchObject({ milestone: null, due: "2026-10-12" });
      expect(
        NodeFS.readFileSync(NodePath.join(root, "tasks", "plan-release.md"), "utf8"),
      ).not.toMatch(/^milestone:/m);
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);

it.effect("loads only valid project roadmaps and uses the workspace project slug", () =>
  withAios({}, (root, project) => {
    const projectRoot = NodePath.join(root, "projects", "leonidas-code");
    const roadmapFile = NodePath.join(projectRoot, "project-roadmap.json");
    const roadmap = {
      projectSlug: "wrong-slug",
      name: "Leonidas Code",
      currentVersion: "0.22.0",
      targetVersion: "1.0.0",
      releaseDefinition: "Public launch",
      milestones: [
        {
          version: "0.23.0",
          title: "Roadmap",
          goal: "Plan the release",
          tasks: [{ key: "MILESTONE-1", title: "Add milestone", description: "Persist versions" }],
        },
      ],
    };
    NodeFS.writeFileSync(roadmapFile, JSON.stringify(roadmap));
    return Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const loaded = yield* board.workspace([project]);
      expect(loaded.roadmaps).toMatchObject([
        { projectSlug: "leonidas-code", name: "Leonidas Code" },
      ]);
      NodeFS.writeFileSync(roadmapFile, "not json");
      expect((yield* board.workspace([project])).roadmaps).toEqual([]);
    }).pipe(Effect.provide(boardLayer(noGithub)));
  }),
);

it.effect("sections every AIOS card by project, read from disk without touching GitHub", () => {
  let githubCalls = 0;
  return withAios(
    {
      "one.md": cardFile("task-one", "First card"),
      "two.md": cardFile("task-two", "Second card").replace(
        'project: "leonidas-code"',
        'project: "simplygersi"',
      ),
    },
    (_root, project) =>
      Effect.gen(function* () {
        const board = yield* TaskBoardService.TaskBoardService;
        const workspace = yield* board.workspace([project]);
        expect(workspace.aiosConnected).toBe(true);
        expect(workspace.tasks.map((task) => task.id).sort()).toEqual(["task-one", "task-two"]);
        const section = workspace.projects.find((entry) => entry.slug === "leonidas-code");
        expect(section).toMatchObject({
          total: 1,
          open: 1,
          projectId: "project-board",
          repository: "ItzJsimp/leonidas-code",
        });
        expect(workspace.projects.some((entry) => entry.slug === "simplygersi")).toBe(true);
        expect(githubCalls).toBe(0);
      }),
  ).pipe(Effect.provide(boardLayer(boardRunner(() => githubCalls++))));
});

it.effect("claims a card in place, refuses a second claimant, and lets the holder release it", () =>
  withAios({ "one.md": cardFile("task-one", "First card") }, (root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const claimed = yield* board.cardUpdate(
        { taskId: "task-one", actor: "Jake", claimedBy: "Jake" },
        [project],
      );
      expect(claimed.status).toBe("in_progress");
      expect(claimed.claimedBy).toBe("Jake");
      expect(NodeFS.readFileSync(NodePath.join(root, "tasks", "one.md"), "utf8")).toContain(
        "claimed_by",
      );

      const stolen = yield* Effect.result(
        board.cardUpdate({ taskId: "task-one", actor: "Mob", claimedBy: "Mob" }, [project]),
      );
      expect(stolen._tag).toBe("Failure");
      if (stolen._tag === "Failure")
        expect(stolen.failure).toMatchObject({ reason: "already_claimed" });

      const released = yield* board.cardUpdate(
        { taskId: "task-one", actor: "Jake", claimedBy: null },
        [project],
      );
      expect(released.claimedBy).toBeNull();
      expect(released.status).toBe("todo");
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);

it.effect("announces each move to done once, with the task title and actor", () =>
  withAios({ "one.md": cardFile("task-one", "First card") }, (_root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const recent = () =>
        board.completions.pipe(
          Stream.runHead,
          Effect.map((value) => (value._tag === "Some" ? value.value : [])),
        );
      expect(yield* recent()).toEqual([]);

      yield* board.cardUpdate({ taskId: "task-one", actor: "Jake", status: "done" }, [project]);
      yield* board.cardUpdate({ taskId: "task-one", actor: "Jake", priority: "high" }, [project]);
      expect(yield* recent()).toEqual([
        expect.objectContaining({ taskId: "task-one", title: "First card", actor: "Jake" }),
      ]);

      yield* board.cardUpdate({ taskId: "task-one", actor: "Jake", status: "todo" }, [project]);
      yield* board.cardUpdate({ taskId: "task-one", actor: "Jake", status: "done" }, [project]);
      const twice = yield* recent();
      expect(twice).toHaveLength(2);
      expect(new Set(twice.map((completion) => completion.id)).size).toBe(2);
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);

it.effect("creates a card file linked to a project and reads it back", () =>
  withAios({}, (root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const created = yield* board.cardCreate(
        {
          title: "Wire the dashboard",
          actor: "Jake",
          priority: "high",
          projectSlug: "leonidas-code",
        },
        [project],
      );
      expect(created).toMatchObject({
        title: "Wire the dashboard",
        status: "todo",
        priority: "high",
        projectSlug: "leonidas-code",
      });
      expect(NodeFS.existsSync(NodePath.join(root, "tasks", "wire-the-dashboard.md"))).toBe(true);
      const workspace = yield* board.workspace([project]);
      expect(workspace.tasks.map((task) => task.id)).toContain(created.id);
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);

it.effect("publishes open project cards to the shared board and marks them shared on disk", () => {
  const writes: Array<ReadonlyArray<string>> = [];
  return withAios(
    {
      "open.md": cardFile("task-open", "Open card"),
      "done.md": cardFile("task-done", "Done card").replace('"Not started"', '"Done"'),
    },
    (root, project) =>
      Effect.gen(function* () {
        const board = yield* TaskBoardService.TaskBoardService;
        yield* board.share(project, { projectId: project.id, shared: true, actor: "Jake" });
        const put = writes.find((args) => args.includes("PUT"));
        const content = put?.find((arg) => arg.startsWith("content="));
        const published = JSON.parse(
          Buffer.from(content!.slice("content=".length), "base64").toString("utf8"),
        );
        expect(published.tasks.map((task: { id: string }) => task.id)).toEqual(["task-open"]);
        expect(NodeFS.readFileSync(NodePath.join(root, "tasks", "open.md"), "utf8")).toMatch(
          /shared:\s*true/,
        );
        expect(NodeFS.readFileSync(NodePath.join(root, "tasks", "done.md"), "utf8")).not.toMatch(
          /shared:/,
        );
      }),
  ).pipe(
    Effect.provide(
      boardLayer(
        boardRunner(
          () => {},
          output("[]"),
          (args) => writes.push(args),
        ),
      ),
    ),
  );
});

it.effect(
  "files a clear capture as a task card, keeps a vague one as a note, and undoes both",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "leonidas-inbox-"))),
      (stateDir) =>
        Effect.gen(function* () {
          const board = yield* TaskBoardService.TaskBoardService;
          const root = NodePath.join(stateDir, "task-board");
          const tasks = () => NodeFS.readdirSync(NodePath.join(root, "tasks"));
          const drops = () => NodeFS.readdirSync(NodePath.join(root, "inbox"));

          const filed = yield* board.inboxDrop(
            { text: "call Mob about the hotkey", actor: "Jake" },
            [],
          );
          expect(filed).toMatchObject({ kind: "task", filedTask: "Call Mob about the hotkey" });
          expect(tasks()).toHaveLength(1);

          const vague = yield* board.inboxDrop(
            { text: "Should the hotkey be configurable?", actor: "Jake" },
            [],
          );
          expect(vague.kind).toBe("note");
          expect(vague.filedTask).toBeUndefined();
          expect(tasks()).toHaveLength(1);
          expect(drops()).toHaveLength(2);

          yield* board.inboxUndo({ id: filed.id }, []);
          expect(tasks()).toHaveLength(0);
          expect(drops()).toHaveLength(1);
        }).pipe(
          Effect.provide(
            boardLayer(noGithub).pipe(
              Layer.provide(Layer.succeed(ServerConfig, { stateDir } as ServerConfig["Service"])),
            ),
          ),
        ),
      (stateDir) => Effect.sync(() => NodeFS.rmSync(stateDir, { recursive: true, force: true })),
    ),
);

const findTask = (tasks: ReadonlyArray<TaskBoardTask>) =>
  tasks.find((task) => task.id === "task-one");

it.effect("refuses an edit made from an old view and keeps the newer edit and its history", () =>
  withAios({ "one.md": cardFile("task-one", "First card") }, (root, project) =>
    Effect.gen(function* () {
      const old = 1_767_225_600; // 2026-01-01, in seconds
      NodeFS.utimesSync(NodePath.join(root, "tasks", "one.md"), old, old);
      const board = yield* TaskBoardService.TaskBoardService;
      const seen = findTask((yield* board.workspace([project])).tasks)!;

      const first = yield* board.cardUpdate(
        {
          taskId: "task-one",
          actor: "Jake",
          title: "Jake title",
          expectedUpdatedAt: seen.updatedAt,
        },
        [project],
      );
      expect(first.title).toBe("Jake title");

      const stale = yield* Effect.result(
        board.cardUpdate(
          {
            taskId: "task-one",
            actor: "Mob",
            title: "Mob title",
            expectedUpdatedAt: seen.updatedAt,
          },
          [project],
        ),
      );
      expect(stale._tag).toBe("Failure");
      if (stale._tag === "Failure")
        expect(stale.failure).toMatchObject({ reason: "stale_revision" });
      const kept = findTask((yield* board.workspace([project])).tasks)!;
      expect(kept.title).toBe("Jake title");
      expect(kept.history.map((entry) => entry.actor)).toEqual(["Jake"]);

      const retried = yield* board.cardUpdate(
        { taskId: "task-one", actor: "Mob", priority: "low", expectedUpdatedAt: kept.updatedAt },
        [project],
      );
      expect(retried).toMatchObject({ title: "Jake title", priority: "low" });
      expect(retried.history.map((entry) => entry.actor)).toEqual(["Jake", "Mob"]);
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);

// The shared board copy of task-one, as a collaborator's machine would have published it.
const sharedCopy = (overrides: Partial<TaskBoardTask> = {}): TaskBoardTask => ({
  id: "task-one",
  project: "Leonidas Code",
  title: "First card",
  description: "",
  status: "todo",
  priority: "high",
  claimedBy: null,
  claimedAt: null,
  claimedAgent: null,
  completedBy: null,
  completedAt: null,
  completionSummary: null,
  createdAt: 0,
  updatedAt: 0,
  labels: [],
  source: "aios_card",
  projectSlug: "leonidas-code",
  shared: true,
  sharedBy: "Mob",
  sourceId: "task-one",
  sourceFile: "one.md",
  issueUrl: null,
  history: [],
  ...overrides,
});

// A stateful GitHub contents API: a PUT lands only with the current sha, like the real one.
const fakeGithub = (tasks: ReadonlyArray<TaskBoardTask>) => {
  const state = {
    tasks,
    sha: 1,
    puts: 0,
    failPuts: false,
    // Runs once before the next PUT, as if a collaborator wrote first.
    beforePut: null as null | (() => void),
  };
  const runner = ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        const path = input.args.find((arg) => arg.startsWith("repos/")) ?? "";
        const branch = /matching-refs\/heads\/(.+)$/.exec(path)?.[1];
        if (branch) return output(JSON.stringify([{ ref: `refs/heads/${branch}` }]));
        if (input.args.includes("PUT")) {
          state.puts++;
          if (state.failPuts) return output("", 1, "HTTP 502: Bad Gateway");
          const before = state.beforePut;
          state.beforePut = null;
          before?.();
          const body = JSON.parse(input.stdin ?? "{}") as { sha?: string; content?: string };
          const field = (name: "sha" | "content") => body[name];
          if (field("sha") !== String(state.sha)) {
            return output("", 1, "HTTP 409: sha does not match");
          }
          state.tasks = JSON.parse(Buffer.from(field("content")!, "base64").toString("utf8")).tasks;
          state.sha++;
          return output("{}");
        }
        if (path.includes("/contents/")) {
          const content = Buffer.from(JSON.stringify({ version: 1, tasks: state.tasks }));
          return output(
            JSON.stringify({ content: content.toString("base64"), sha: String(state.sha) }),
          );
        }
        return output("[]");
      }),
  });
  return { state, runner };
};

it.effect("refuses an edit to a shared-only task when the shared copy changed", () => {
  const github = fakeGithub([sharedCopy({ updatedAt: 5_000 })]);
  const edit = (expectedUpdatedAt: number) => ({
    taskId: "task-one",
    projectId: boardProject.id,
    actor: "Mob",
    priority: "low" as const,
    expectedUpdatedAt,
  });
  return Effect.gen(function* () {
    const board = yield* TaskBoardService.TaskBoardService;
    const stale = yield* Effect.result(board.cardUpdate(edit(4_000), [boardProject]));
    expect(stale._tag).toBe("Failure");
    if (stale._tag === "Failure") expect(stale.failure).toMatchObject({ reason: "stale_revision" });
    expect(github.state.puts).toBe(0);
    const updated = yield* board.cardUpdate(edit(5_000), [boardProject]);
    expect(updated.priority).toBe("low");
  }).pipe(Effect.provide(boardLayer(github.runner)));
});

const sharedCard = cardFile("task-one", "First card", 'shared: true\nshared_by: "Mob"\n');

it.effect("keeps a failed shared mirror visible until a retry publishes the edit", () => {
  const github = fakeGithub([sharedCopy()]);
  return withAios({ "one.md": sharedCard }, (root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      github.state.failPuts = true;
      const edited = yield* board.cardUpdate(
        { taskId: "task-one", actor: "Mob", title: "Renamed offline" },
        [project],
      );
      expect(edited).toMatchObject({ title: "Renamed offline", sharedSync: "failed" });
      expect(NodeFS.readFileSync(NodePath.join(root, "tasks", "one.md"), "utf8")).toMatch(
        /^shared_sync: failed$/m,
      );
      expect(findTask((yield* board.workspace([project])).tasks)?.sharedSync).toBe("failed");
      expect(github.state.tasks[0]?.title).toBe("First card");

      github.state.failPuts = false;
      yield* board.share(project, {
        projectId: project.id,
        taskIds: ["task-one"],
        shared: true,
        actor: "Mob",
      });
      const recovered = findTask((yield* board.workspace([project])).tasks);
      expect(recovered).toMatchObject({ shared: true });
      expect(recovered?.sharedSync).toBeUndefined();
      expect(github.state.tasks[0]).toMatchObject({ title: "Renamed offline" });
      expect(github.state.tasks[0]).not.toHaveProperty("sharedSync");
    }),
  ).pipe(Effect.provide(boardLayer(github.runner)));
});

it.effect("retries a mirror after a GitHub sha conflict and keeps the collaborator's edit", () => {
  const later = Date.now() + 60_000;
  const jakeNote = {
    id: "jake-note",
    taskId: "task-one",
    action: "progress" as const,
    actor: "Jake",
    timestamp: later,
    note: "Picked this up on my machine",
  };
  const github = fakeGithub([sharedCopy()]);
  return withAios({ "one.md": sharedCard }, (_root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      // Jake retitles the shared copy just before Mob's mirror lands, so Mob's first PUT is stale.
      github.state.beforePut = () => {
        github.state.tasks = [
          sharedCopy({ title: "Jake title", updatedAt: later, history: [jakeNote] }),
        ];
        github.state.sha++;
      };
      const edited = yield* board.cardUpdate(
        { taskId: "task-one", actor: "Mob", priority: "low" },
        [project],
      );
      expect(edited.sharedSync).toBeUndefined();
      expect(github.state.puts).toBe(2);
      const copy = github.state.tasks[0]!;
      expect(copy).toMatchObject({ title: "Jake title", priority: "low" });
      expect(copy.history.map((entry) => entry.actor).sort()).toEqual(["Jake", "Mob"]);
    }),
  ).pipe(Effect.provide(boardLayer(github.runner)));
});

it.effect("ticks one brief priority in place and refuses a line that changed", () =>
  withAios({ "one.md": cardFile("task-one", "First card") }, (root, project) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const dir = NodePath.join(root, "logs", "briefings");
      NodeFS.mkdirSync(dir, { recursive: true });
      const file = "logs/briefings/2026-10-23-briefing.md";
      const before =
        "# Brief\r\n- **Priorities Seeded:**\r\n- [ ] **Ship:** today\r\n- [ ] **Call:** bank\r\n";
      NodeFS.writeFileSync(NodePath.join(root, file), before);

      const home = yield* board.home([project]);
      const ship = home.brief?.priorities.find((priority) => priority.title === "Ship");
      expect(ship?.line).toBe("- [ ] **Ship:** today");
      const ticked = yield* board.homePriorityToggle({ file, line: ship!.line!, done: true }, [
        project,
      ]);
      expect(ticked.line).toBe("- [x] **Ship:** today");
      expect(NodeFS.readFileSync(NodePath.join(root, file), "utf8")).toBe(
        before.replace("- [ ] **Ship:**", "- [x] **Ship:**"),
      );

      // The caller still holds the old line: the file changed, so nothing is written.
      const stale = yield* Effect.result(
        board.homePriorityToggle({ file, line: ship!.line!, done: true }, [project]),
      );
      expect(stale._tag).toBe("Failure");
      if (stale._tag === "Failure")
        expect(stale.failure).toMatchObject({ reason: "stale_revision" });

      const outside = yield* Effect.result(
        board.homePriorityToggle({ file: "tasks/one.md", line: "- [ ] **x:** y", done: true }, [
          project,
        ]),
      );
      expect(outside._tag).toBe("Failure");
      if (outside._tag === "Failure")
        expect(outside.failure).toMatchObject({ reason: "invalid_data" });
    }),
  ).pipe(Effect.provide(boardLayer(noGithub))),
);
