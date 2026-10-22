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
const signedIn = ProcessRunner.ProcessRunner.of({
  run: () => Effect.succeed({ code: 0, stdout: "ada-gh\n", stderr: "" } as never),
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
        if (previous !== undefined) process.env.LEONIDAS_AIOS_ROOT = previous;
        NodeFS.rmSync(temp, { recursive: true, force: true });
      }),
  );

it.effect("sets up a project folder with no tasks/ as a business and copies the template", () =>
  withFolder(({ fresh, projects }) =>
    Effect.gen(function* () {
      const board = yield* TaskBoardService.TaskBoardService;
      const ready = yield* board.workspaceInit(
        { root: fresh, id: "acme", name: "Acme", type: "business", ownerName: "Ada Owner" },
        projects,
      );
      expect(ready).toMatchObject({ status: "ready", id: "acme", type: "business" });
      expect(NodeFS.existsSync(NodePath.join(fresh, "org", "members", "ada-owner.md"))).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(fresh, "tasks", "README.md"))).toBe(true);
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
