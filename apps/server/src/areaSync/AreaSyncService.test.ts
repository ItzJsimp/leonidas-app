// @effect-diagnostics nodeBuiltinImport:off - tests use real files and real git in temp folders.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { afterEach, expect, it } from "@effect/vitest";
import type { Project, TaskBoardOperationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProcessRunner from "../processRunner.ts";
import * as TaskBoardService from "../taskBoard/TaskBoardService.ts";
import { AreaSyncService, make } from "./AreaSyncService.ts";
import type { Git } from "./engine/git.ts";
import { cleanTemp, makeRemote, makeWorkspace, tempDir, write } from "./engine/testRepos.ts";

afterEach(cleanTemp);

const layerWith = (git?: Git) =>
  Layer.effect(AreaSyncService, make(git)).pipe(
    Layer.provide(
      TaskBoardService.layer.pipe(
        Layer.provide(
          Layer.succeed(
            ProcessRunner.ProcessRunner,
            ProcessRunner.ProcessRunner.of({ run: () => Effect.die("unused") }),
          ),
        ),
      ),
    ),
  );

// The resolver finds a root by a project folder inside it, so one fake project is enough.
const projectsFor = (root: string) => [{ workspaceRoot: root }] as unknown as Project[];

const markWorkspace = (root: string, id: string, type: "personal" | "business") => {
  NodeFS.mkdirSync(NodePath.join(root, "tasks"), { recursive: true });
  write(root, "workspace.json", JSON.stringify({ id, name: id, type, schemaVersion: 1 }));
};

const failureOf = (effect: Effect.Effect<unknown, TaskBoardOperationError>) => Effect.flip(effect);

it.effect("fails for an id that no workspace has", () => {
  const { root } = makeWorkspace(tempDir("remotes-"), [["home", "active"]]);
  markWorkspace(root, "acme-biz", "business");
  return Effect.gen(function* () {
    const service = yield* AreaSyncService;
    for (const call of [service.join, service.sync, service.status]) {
      const error = yield* failureOf(call(projectsFor(root), { workspaceId: "nope" }));
      expect(error._tag).toBe("TaskBoardOperationError");
      expect(error.message).toContain("no workspace");
    }
  }).pipe(Effect.provide(layerWith()));
});

it.effect("refuses a personal workspace", () => {
  const root = tempDir("personal-");
  markWorkspace(root, "my-aios", "personal");
  return Effect.gen(function* () {
    const service = yield* AreaSyncService;
    for (const call of [service.join, service.sync, service.status]) {
      const error = yield* failureOf(call(projectsFor(root), { workspaceId: "my-aios" }));
      expect(error._tag).toBe("TaskBoardOperationError");
      expect(error.message).toContain("business");
    }
  }).pipe(Effect.provide(layerWith()));
});

it.effect("joins, syncs and reports status for a business workspace", () => {
  const base = tempDir("remotes-");
  const { root } = makeWorkspace(base, [
    ["home", "active"],
    ["sales", "active"],
  ]);
  makeRemote(base, "acme-sales", { "README.md": "sales\n" });
  markWorkspace(root, "acme-biz", "business");
  const input = { workspaceId: "acme-biz" };
  return Effect.gen(function* () {
    const service = yield* AreaSyncService;
    const projects = projectsFor(root);

    const joined = yield* service.join(projects, input);
    expect(joined.results).toEqual([{ slug: "sales", state: "joined", detail: "" }]);
    expect(NodeFS.existsSync(NodePath.join(root, "areas", "sales", ".git"))).toBe(true);

    write(root, "areas/sales/notes.md", "local\n");
    const synced = yield* service.sync(projects, input);
    expect(synced.joined).toEqual([{ slug: "sales", state: "present", detail: "" }]);
    expect(synced.areas.map((area) => [area.slug, area.result.state])).toEqual([
      ["home", "pushed"],
      ["sales", "pushed"],
    ]);

    const status = yield* service.status(projects, input);
    expect(status.areas.map((row) => row.slug)).toEqual(["home", "sales"]);
    for (const row of status.areas) {
      expect(row).toMatchObject({ branch: "main", ahead: 0, behind: 0, dirty: false });
    }
  }).pipe(Effect.provide(layerWith()));
});

it.effect("never runs two syncs of one workspace at the same time", () => {
  const root = tempDir("fake-");
  NodeFS.mkdirSync(NodePath.join(root, ".git"), { recursive: true });
  write(root, "org/areas.md", "# Areas\n");
  markWorkspace(root, "acme-biz", "business");
  const marks: string[] = [];
  let active = 0;
  let overlap = 0;
  const git: Git = async () => {
    marks.push("start");
    active++;
    overlap = Math.max(overlap, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    marks.push("end");
    return { code: 1, out: "" };
  };
  return Effect.gen(function* () {
    const service = yield* AreaSyncService;
    const run = service.sync(projectsFor(root), { workspaceId: "acme-biz" });
    const [first, second] = yield* Effect.all([run, run], { concurrency: 2 });
    expect(first.areas[0]?.slug).toBe("home");
    expect(second.areas[0]?.slug).toBe("home");
    expect(overlap).toBe(1);
    // Every start is followed by its own end: the two runs did not interleave.
    expect(marks.length).toBeGreaterThan(2);
    marks.forEach((mark, index) => expect(mark).toBe(index % 2 === 0 ? "start" : "end"));
  }).pipe(Effect.provide(layerWith(git)));
});
