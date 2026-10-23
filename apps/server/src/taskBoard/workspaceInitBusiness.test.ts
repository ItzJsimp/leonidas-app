// @effect-diagnostics nodeBuiltinImport:off - temp business folders are plain Node fixtures.
import { expect, it } from "@effect/vitest";
import type { Project } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ServerConfig } from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as TaskBoardService from "./TaskBoardService.ts";

// The `gh api user` call answers with a login, so setup can name the Owner.
const calls: string[] = [];
const signedIn = ProcessRunner.ProcessRunner.of({
  run: (input) => {
    calls.push(`${input.command} ${input.args.join(" ")} @${input.cwd ?? ""}`);
    return Effect.succeed({ code: 0, stdout: "ada-gh\n", stderr: "" } as never);
  },
});

const project = (id: string, workspaceRoot: string) =>
  ({ id, title: id, workspaceRoot }) as unknown as Project;

const withFolder = <A, E>(
  use: (fixture: {
    temp: string;
    fresh: string;
    projects: ReadonlyArray<Project>;
  }) => Effect.Effect<A, E, TaskBoardService.TaskBoardService>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const temp = NodeFS.realpathSync(
        NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "new business-")),
      );
      // A new business lives beside, not inside, the managed `projects` folder.
      const fresh = NodePath.join(temp, "businesses", "acme");
      NodeFS.mkdirSync(fresh, { recursive: true });
      const previous = process.env.LEONIDAS_AIOS_ROOT;
      delete process.env.LEONIDAS_AIOS_ROOT;
      return { temp, fresh, previous };
    }),
    ({ temp, fresh }) =>
      use({ temp, fresh, projects: [project("p-acme", fresh)] }).pipe(
        Effect.provide(
          TaskBoardService.layer.pipe(
            Layer.provide(Layer.succeed(ProcessRunner.ProcessRunner, signedIn)),
            Layer.provide(
              Layer.succeed(ServerConfig, {
                stateDir: NodePath.join(temp, "native-state"),
              } as ServerConfig["Service"]),
            ),
          ),
        ),
      ),
    ({ temp, previous }) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.LEONIDAS_AIOS_ROOT;
        else process.env.LEONIDAS_AIOS_ROOT = previous;
        NodeFS.rmSync(temp, { recursive: true, force: true });
      }),
  );

it.effect("sets up a project folder with no tasks/ as a business and copies the template", () =>
  withFolder(({ fresh, projects }) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      calls.length = 0;
      const ready = yield* board.workspaceInit(
        { root: fresh, id: "acme", name: "Acme", type: "business", ownerName: "Ada Owner" },
        projects,
      );
      expect(ready).toMatchObject({ status: "ready", id: "acme", type: "business" });
      expect(NodeFS.existsSync(NodePath.join(fresh, "org", "members", "ada-owner.md"))).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(fresh, "tasks", "README.md"))).toBe(true);
      // Home becomes a Git repo with a first commit, so publishing has something to push.
      expect(calls.filter((call) => call.startsWith("git"))).toEqual([
        `git init --initial-branch=main @${fresh}`,
        `git add -A @${fresh}`,
        `git commit --message Set up Acme @${fresh}`,
      ]);
    }),
  ),
);

it.effect("refuses an unlisted folder with no Owner name, and one that is no project", () =>
  withFolder(({ temp, fresh, projects }) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const noOwner = yield* Effect.exit(
        board.workspaceInit({ root: fresh, id: "acme", name: "Acme", type: "business" }, projects),
      );
      const stranger = NodePath.join(temp, "elsewhere");
      NodeFS.mkdirSync(stranger);
      const notProject = yield* Effect.exit(
        board.workspaceInit(
          { root: stranger, id: "x", name: "X", type: "business", ownerName: "Ada" },
          projects,
        ),
      );
      // A parent of a project folder is not the project folder.
      const parent = yield* Effect.exit(
        board.workspaceInit(
          { root: NodePath.dirname(fresh), id: "p", name: "P", type: "business", ownerName: "Ada" },
          projects,
        ),
      );
      expect([noOwner, notProject, parent].every((exit) => Exit.isFailure(exit))).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(fresh, "org"))).toBe(false);
      expect(NodeFS.existsSync(NodePath.join(stranger, "org"))).toBe(false);
      expect(NodeFS.existsSync(NodePath.join(NodePath.dirname(fresh), "org"))).toBe(false);
    }),
  ),
);

it.effect("makes a task private in an Area and shows the real title only where the Area is", () =>
  withFolder(({ temp, fresh, projects }) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      // A business card goes to the business folder only when another workspace is the default.
      const personal = NodePath.join(temp, "personal");
      NodeFS.mkdirSync(NodePath.join(personal, "tasks"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(personal, "projects"));
      NodeFS.writeFileSync(
        NodePath.join(personal, "workspace.json"),
        JSON.stringify({ id: "personal", name: "Personal", type: "personal", schemaVersion: 1 }),
      );
      process.env.LEONIDAS_AIOS_ROOT = personal;
      yield* board.workspaceInit(
        { root: fresh, id: "acme", name: "Acme", type: "business", ownerName: "Ada Owner" },
        projects,
      );
      const areas = NodePath.join(fresh, "org", "areas.md");
      NodeFS.writeFileSync(
        areas,
        NodeFS.readFileSync(areas, "utf8").replace(
          "| `home` | Home |",
          "| `deals` | Deals | `acme-deals` | `general` | private | active |\n| `home` | Home |",
        ),
      );
      const made = yield* board.cardCreate(
        { title: "Secret plan", description: "Hush deal notes", actor: "Ada", workspaceId: "acme" },
        projects,
      );
      const notJoined = yield* Effect.exit(
        board.cardUpdate(
          { taskId: made.id, actor: "Ada", workspaceId: "acme", privateArea: "deals" },
          projects,
        ),
      );
      expect(Exit.isFailure(notJoined)).toBe(true);

      NodeFS.mkdirSync(NodePath.join(fresh, "areas", "deals"), { recursive: true });
      // The task page sends the version it saw; a good move must not read as a stale edit.
      const seen = (yield* board.workspace(projects, "acme")).tasks.find((t) => t.id === made.id)!;
      const stale = yield* Effect.exit(
        board.cardUpdate(
          {
            taskId: made.id,
            actor: "Ada",
            workspaceId: "acme",
            privateArea: "deals",
            expectedUpdatedAt: seen.updatedAt - 1,
          },
          projects,
        ),
      );
      expect(Exit.isFailure(stale)).toBe(true);
      expect(
        NodeFS.readFileSync(
          NodePath.join(
            fresh,
            "tasks",
            NodeFS.readdirSync(NodePath.join(fresh, "tasks")).find((f) => f !== "README.md")!,
          ),
          "utf8",
        ),
      ).toContain("Secret plan");
      const updated = yield* board.cardUpdate(
        {
          taskId: made.id,
          actor: "Ada",
          workspaceId: "acme",
          privateArea: "deals",
          expectedUpdatedAt: seen.updatedAt,
        },
        projects,
      );
      expect(updated.labels).toContain("private");
      expect(NodeFS.readdirSync(NodePath.join(fresh, "tasks")).length).toBeGreaterThan(1);
      expect(updated.title).toBe("Private task in Deals");
      const homeFiles = NodeFS.readdirSync(NodePath.join(fresh, "tasks"));
      const homeText = homeFiles
        .map((name) => NodeFS.readFileSync(NodePath.join(fresh, "tasks", name), "utf8"))
        .join("\n");
      expect(homeText).not.toContain("Secret plan");
      expect(homeText).not.toContain("Hush deal");

      const here = (yield* board.workspace(projects, "acme")).tasks.find((t) => t.id === made.id);
      expect(here?.title).toBe("Secret plan");
      NodeFS.rmSync(NodePath.join(fresh, "areas"), { recursive: true });
      const elsewhere = (yield* board.workspace(projects, "acme")).tasks.find(
        (t) => t.id === made.id,
      );
      expect(elsewhere?.title).toBe("Private task in Deals");
    }),
  ),
);
