import {
  TaskBoardOperationError,
  type AreaSyncJoinResult,
  type AreaSyncScopeInput,
  type AreaSyncStatusResult,
  type AreaSyncSyncResult,
  type Project,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import { TaskBoardService } from "../taskBoard/TaskBoardService.ts";
import { realGit, type Git } from "./engine/git.ts";
import { joinWorkspace } from "./engine/join.ts";
import { statusAll, syncWorkspace } from "./engine/sync.ts";

type AreaSyncError = TaskBoardOperationError;

export class AreaSyncService extends Context.Service<
  AreaSyncService,
  {
    /** Clones the Area repos of a business workspace that are not on disk yet. */
    readonly join: (
      projects: ReadonlyArray<Project>,
      input: AreaSyncScopeInput,
    ) => Effect.Effect<AreaSyncJoinResult, AreaSyncError>;
    /** Syncs Home, joins new Areas, then syncs each Area. One run at a time per workspace. */
    readonly sync: (
      projects: ReadonlyArray<Project>,
      input: AreaSyncScopeInput,
    ) => Effect.Effect<AreaSyncSyncResult, AreaSyncError>;
    /** Branch, ahead, behind and dirty state of Home and each Area. No network. */
    readonly status: (
      projects: ReadonlyArray<Project>,
      input: AreaSyncScopeInput,
    ) => Effect.Effect<AreaSyncStatusResult, AreaSyncError>;
  }
>()("t3/areaSync/AreaSyncService") {}

const operationError = (reason: TaskBoardOperationError["reason"], message: string) =>
  new TaskBoardOperationError({ reason, message });

/** `git` is injectable so tests can record calls; the default is the computer's own git. */
export const make = (git: Git = realGit) =>
  Effect.gen(function* () {
    const taskBoard = yield* TaskBoardService;
    // One lock per workspace root. A second call waits for the first; it does not share its result.
    const locks = new Map<string, Semaphore.Semaphore>();
    const lockFor = (root: string) =>
      Effect.sync(() => {
        const found = locks.get(root) ?? Semaphore.makeUnsafe(1);
        locks.set(root, found);
        return found;
      });

    const businessRoot = (projects: ReadonlyArray<Project>, input: AreaSyncScopeInput) =>
      Effect.gen(function* () {
        const found = yield* taskBoard.workspaceRoot(projects, input.workspaceId);
        if (found === null) {
          return yield* operationError("invalid_data", "The app has no workspace with that id.");
        }
        if (found.type !== "business") {
          return yield* operationError("invalid_data", "Only a business workspace can sync Areas.");
        }
        return found.root;
      });

    const run = <A>(what: string, work: () => Promise<A>) =>
      Effect.tryPromise({
        try: work,
        catch: (cause) =>
          operationError(
            "storage_error",
            `${what} failed. ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      });

    // Join and sync both write to disk, so they share the root lock. Status only reads.
    const locked = <A>(root: string, effect: Effect.Effect<A, AreaSyncError>) =>
      lockFor(root).pipe(Effect.flatMap((lock) => lock.withPermits(1)(effect)));

    return AreaSyncService.of({
      join: (projects, input) =>
        Effect.gen(function* () {
          const root = yield* businessRoot(projects, input);
          return yield* locked(
            root,
            run("Joining the Areas", () => joinWorkspace({ root, git })),
          );
        }),
      sync: (projects, input) =>
        Effect.gen(function* () {
          const root = yield* businessRoot(projects, input);
          return yield* locked(
            root,
            run("Syncing", () => syncWorkspace({ root, git })),
          );
        }),
      status: (projects, input) =>
        Effect.gen(function* () {
          const root = yield* businessRoot(projects, input);
          const areas = yield* run("Reading the Area status", () => statusAll({ root, git }));
          return { areas };
        }),
    });
  });

export const layer = Layer.effect(AreaSyncService, make());
