// @effect-diagnostics nodeBuiltinImport:off - synchronous node and global APIs are used on purpose in this file.
import {
  CommandId,
  SavedItem,
  SavedItemCreateInput,
  SavedItemError,
  SavedItemId,
  SavedItemImportInput,
  SavedItemLaunchInput,
  SavedItemListInput,
  SavedItemScheduleInput,
  SavedItemTaskInput,
  SavedItemTransitionInput,
  SavedItemUpdateInput,
  type SavedItemCreator,
  type SavedItemListResult,
  SAVED_ITEM_BODY_MAX_LENGTH,
  ThreadId,
} from "@t3tools/contracts";
import { parseSavedItemMarkdown } from "@t3tools/shared/savedItemMarkdown";
import { isValidOnceRunAt } from "../scheduledTasks/Schedule.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import {
  listAiosWorkspaces,
  resolveWorkspaceRoot,
  workspaceForPath,
} from "../taskBoard/aiosWorkspaces.ts";
import { ProjectService } from "../project/ProjectService.ts";
import {
  deleteFolderPrompt,
  FOLDER_ID_PREFIX,
  freeFileName,
  promptsDirFor,
  readFolderPrompts,
  writeFolderPrompt,
} from "./promptFolder.ts";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

/** Set only by authenticated agent transports; user RPCs use the default. */
export class SavedItemCaller extends Context.Reference<{
  readonly actor: SavedItemCreator;
  readonly threadId: ThreadId | null;
}>("t3/savedItems/Caller", { defaultValue: () => ({ actor: "user", threadId: null }) }) {}

export const SavedItemEffect = Schema.Union([
  Schema.Struct({ action: Schema.Literal("launch"), input: SavedItemLaunchInput }),
  Schema.Struct({ action: Schema.Literal("schedule"), input: SavedItemScheduleInput }),
  Schema.Struct({ action: Schema.Literal("task"), input: SavedItemTaskInput }),
]);
export type SavedItemEffect = typeof SavedItemEffect.Type;
export interface PendingSavedItemEffect {
  readonly request: SavedItemEffect;
  readonly item: SavedItem;
  readonly actor: SavedItemCreator;
}

export class SavedItemService extends Context.Service<
  SavedItemService,
  {
    readonly create: (input: SavedItemCreateInput) => Effect.Effect<SavedItem, SavedItemError>;
    readonly update: (input: SavedItemUpdateInput) => Effect.Effect<SavedItem, SavedItemError>;
    readonly transition: (
      input: SavedItemTransitionInput,
    ) => Effect.Effect<SavedItem, SavedItemError>;
    readonly importMarkdown: (
      input: SavedItemImportInput,
    ) => Effect.Effect<SavedItem, SavedItemError>;
    readonly get: (
      id: SavedItemId,
      workspaceId?: string,
    ) => Effect.Effect<SavedItem, SavedItemError>;
    readonly list: (
      input: SavedItemListInput,
    ) => Effect.Effect<SavedItemListResult, SavedItemError>;
    readonly request: (request: SavedItemEffect) => Effect.Effect<SavedItem, SavedItemError>;
    readonly pending: Effect.Effect<ReadonlyArray<PendingSavedItemEffect>, SavedItemError>;
    readonly complete: (
      commandId: CommandId,
      patch: Pick<SavedItem, "launchedThreadId"> & {
        readonly scheduledTaskId?: Exclude<SavedItem["scheduledTaskId"], undefined>;
        readonly boardTaskId?: Exclude<SavedItem["boardTaskId"], undefined>;
      },
    ) => Effect.Effect<SavedItem, SavedItemError>;
    readonly rebuild: Effect.Effect<void, SavedItemError>;
    readonly reconcileScheduledRuns: Effect.Effect<void, SavedItemError>;
  }
>()("t3/savedItems/SavedItemService") {}

const ItemJson = Schema.fromJsonString(SavedItem);
const encode = Schema.encodeEffect(ItemJson);
const decode = Schema.decodeUnknownEffect(ItemJson);
const RequestJson = Schema.fromJsonString(SavedItemEffect);
const encodeRequest = Schema.encodeEffect(RequestJson);
const decodeRequest = Schema.decodeUnknownEffect(RequestJson);
const encodeCommand = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeCreate = Schema.decodeUnknownEffect(SavedItemCreateInput);
const decodeUpdate = Schema.decodeUnknownEffect(SavedItemUpdateInput);
const isSavedItemError = Schema.is(SavedItemError);
/** Permanent removal: the event stays in the log so a rebuild replays it, but the item leaves the projection. */
const DELETE_EVENT = "saved_item.delete";
/** Field order can change across transports and reconnects without changing a retried command. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}
const storage = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((cause) =>
      isSavedItemError(cause) ? cause : new SavedItemError({ reason: "storage", cause }),
    ),
  );

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = yield* Effect.serviceOption(ServerSettingsService);
  /** The AIOS prompts folder, resolved on each use so a newly confirmed AIOS folder applies at once. */
  const projects = yield* Effect.serviceOption(ProjectService);
  const workspaceScope = (workspaceId?: string, projectId?: string | null) =>
    Effect.gen(function* () {
      let confirmed: string | undefined;
      if (Option.isSome(settings)) {
        const current = yield* settings.value.getSettings.pipe(Effect.option);
        confirmed = Option.isSome(current) ? current.value.aiosRoot || undefined : undefined;
      }
      const snapshot = Option.isSome(projects)
        ? yield* projects.value.snapshot.pipe(Effect.map((s) => s.projects))
        : [];
      const workspaces = listAiosWorkspaces([
        confirmed,
        process.env.LEONIDAS_AIOS_ROOT,
        process.env.AIOS_ROOT,
        ...snapshot.map((p) => p.workspaceRoot),
      ]);
      const project = snapshot.find((p) => p.id === projectId);
      const owner = project ? workspaceForPath(workspaces, project.workspaceRoot) : undefined;
      const root = workspaceId
        ? resolveWorkspaceRoot(workspaces, workspaceId)
        : (owner?.root ?? resolveWorkspaceRoot(workspaces, undefined));
      const state = workspaces.find((w) => w.root === root);
      const id = state?.status === "ready" ? state.file.id : undefined;
      const isDefault = root === workspaces[0]?.root;
      return {
        root,
        ...(id === undefined ? {} : { id }),
        isDefault,
        projectIds: new Set(
          snapshot
            .filter((p) => workspaceForPath(workspaces, p.workspaceRoot)?.root === root)
            .map((p) => p.id),
        ),
      };
    });
  const promptsDir = (workspaceId?: string) =>
    workspaceScope(workspaceId).pipe(
      Effect.map((scope) => (scope.root === null ? null : promptsDirFor(scope.root))),
    );
  const folderPrefix = (scope: { id?: string; isDefault: boolean }) =>
    scope.isDefault
      ? FOLDER_ID_PREFIX
      : `${FOLDER_ID_PREFIX}${encodeURIComponent(scope.id ?? "")}:`;
  const folderFile = (id: SavedItemId) => {
    if (!id.startsWith(FOLDER_ID_PREFIX)) return null;
    const file = id.slice(id.lastIndexOf(":") + 1);
    return file.endsWith(".md") && !/[\\/:]/.test(file) ? file : null;
  };
  const belongs = (
    item: SavedItem,
    scope: { id?: string; isDefault: boolean; projectIds: ReadonlySet<string> },
  ) =>
    item.workspaceId !== undefined
      ? item.workspaceId === scope.id
      : item.projectId !== null
        ? scope.projectIds.has(item.projectId)
        : scope.isDefault;
  const fsError = (cause: unknown) => new SavedItemError({ reason: "storage", cause });
  const project = (item: SavedItem) =>
    encode(item).pipe(
      Effect.flatMap(
        (json) => sql`INSERT INTO projection_saved_items
    (item_id, project_id, status, kind, moved_to_board, item_json, updated_at)
    VALUES (${item.id}, ${item.projectId}, ${item.status}, ${item.kind}, ${item.boardTaskId ? 1 : 0}, ${json}, ${item.updatedAt})
    ON CONFLICT(item_id) DO UPDATE SET project_id = excluded.project_id, status = excluded.status,
    kind = excluded.kind, moved_to_board = excluded.moved_to_board, item_json = excluded.item_json, updated_at = excluded.updated_at`,
      ),
    );
  const get = (id: SavedItemId, workspaceId?: string) =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        item_json: string;
      }>`SELECT item_json FROM projection_saved_items WHERE item_id = ${id}`;
      if (!rows[0]) return yield* new SavedItemError({ reason: "not_found" });
      const item = yield* decode(rows[0].item_json);
      if (workspaceId !== undefined) {
        const scope = yield* workspaceScope(workspaceId);
        if (scope.root === null || !belongs(item, scope))
          return yield* new SavedItemError({ reason: "not_found" });
      }
      return item;
    }).pipe(storage);
  const record = (commandId: CommandId, eventType: string, item: SavedItem) =>
    Effect.gen(function* () {
      const json = yield* encode(item);
      yield* sql`INSERT INTO saved_item_events (command_id, item_id, event_type, item_json, occurred_at)
      VALUES (${commandId}, ${item.id}, ${eventType}, ${json}, ${item.updatedAt})`;
      if (eventType === DELETE_EVENT)
        yield* sql`DELETE FROM projection_saved_items WHERE item_id = ${item.id}`;
      else yield* project(item);
    });
  const command = <I extends { readonly commandId: CommandId }, E>(
    input: I,
    type: string,
    decide: Effect.Effect<SavedItem, E>,
  ) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const caller = yield* SavedItemCaller;
          const requestJson = yield* encodeCommand(
            canonicalize({
              type,
              input,
              caller,
            }),
          );
          const rows = yield* sql<{
            request_json: string;
            result_json: string;
          }>`SELECT request_json, result_json FROM saved_item_commands WHERE command_id = ${input.commandId}`;
          if (rows[0]) {
            if (rows[0].request_json !== requestJson)
              return yield* new SavedItemError({ reason: "conflict" });
            return yield* decode(rows[0].result_json);
          }
          const item = yield* decide;
          yield* record(input.commandId, type, item);
          const json = yield* encode(item);
          yield* sql`INSERT INTO saved_item_commands (command_id, request_json, result_json) VALUES (${input.commandId}, ${requestJson}, ${json})`;
          return item;
        }),
      )
      .pipe(storage);
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  /** Mirrors the prompts folder into the projection: the files win, the app copy follows them. */
  const syncFolder = (scope: {
    root: string | null;
    id?: string;
    isDefault: boolean;
    projectIds: ReadonlySet<string>;
  }) =>
    Effect.gen(function* () {
      const dir = scope.root === null ? null : promptsDirFor(scope.root);
      const prompts = dir === null ? null : readFolderPrompts(dir);
      if (dir === null || prompts === null) return { path: dir, present: false };
      yield* sql.withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<{
            item_json: string;
          }>`SELECT item_json FROM projection_saved_items WHERE item_id LIKE ${`${FOLDER_ID_PREFIX}%`}`;
          const known = new Map<string, SavedItem>();
          for (const row of rows) {
            const item = yield* decode(row.item_json);
            if (belongs(item, scope)) known.set(item.id, item);
          }
          const syncId = (type: string) =>
            CommandId.make(`folder-sync:${type}:${NodeCrypto.randomUUID()}`);
          const timestamp = yield* now;
          for (const prompt of prompts) {
            if (prompt.body.length > SAVED_ITEM_BODY_MAX_LENGTH) continue;
            const id = SavedItemId.make(`${folderPrefix(scope)}${prompt.file}`);
            const current = known.get(id);
            known.delete(id);
            if (!current) {
              yield* record(syncId("created"), "saved_item.created", {
                id,
                ...(scope.id === undefined ? {} : { workspaceId: scope.id }),
                kind: "prompt",
                title: prompt.title,
                body: prompt.body,
                tags: [...prompt.tags],
                projectId: null,
                status: "queued",
                launchedThreadId: null,
                createdBy: "user",
                createdAt: timestamp,
                updatedAt: timestamp,
                launchedBy: null,
                scheduledTaskId: null,
                boardTaskId: null,
                pendingCommandId: null,
              });
            } else if (current.title !== prompt.title || current.body !== prompt.body) {
              yield* record(syncId("updated"), "saved_item.updated", {
                ...current,
                title: prompt.title,
                body: prompt.body,
                updatedAt: timestamp,
              });
            }
          }
          // A file removed outside the app removes its prompt, unless work still points at it.
          for (const item of known.values()) {
            if (item.pendingCommandId || item.scheduledTaskId) continue;
            yield* record(syncId("deleted"), DELETE_EVENT, { ...item, updatedAt: timestamp });
          }
        }),
      );
      return { path: dir, present: true };
    }).pipe(storage);
  const editable = (item: SavedItem) =>
    item.pendingCommandId || item.boardTaskId
      ? Effect.fail(new SavedItemError({ reason: "conflict" }))
      : Effect.void;
  const create: SavedItemService["Service"]["create"] = (raw) =>
    Effect.gen(function* () {
      const input = yield* decodeCreate(raw).pipe(
        Effect.mapError((cause) => new SavedItemError({ reason: "invalid_input", cause })),
      );
      if (input.id?.startsWith(FOLDER_ID_PREFIX))
        return yield* new SavedItemError({ reason: "invalid_input" });
      return yield* command(
        input,
        "saved_item.created",
        Effect.gen(function* () {
          const scope = yield* workspaceScope(input.workspaceId, input.projectId);
          if (
            input.workspaceId &&
            (scope.root === null ||
              (input.projectId !== null && !scope.projectIds.has(input.projectId)))
          )
            return yield* new SavedItemError({ reason: "invalid_input" });
          const dir =
            input.id === undefined && input.kind === "prompt" && input.projectId === null
              ? scope.root === null
                ? null
                : promptsDirFor(scope.root)
              : null;
          let id = input.id ?? SavedItemId.make(`saved:${input.commandId}`);
          // With an AIOS prompts folder, a new prompt is a file there; the projection follows it.
          if (dir !== null && NodeFS.existsSync(dir)) {
            // The prefix is what puts a prompt saved in the app under Saved in the library.
            const file = freeFileName(dir, `saved-prompt-${input.title}`);
            yield* Effect.try({
              try: () => writeFolderPrompt(dir, { file, title: input.title, body: input.body }),
              catch: fsError,
            });
            id = SavedItemId.make(`${folderPrefix(scope)}${file}`);
          }
          const existing =
            yield* sql`SELECT item_id FROM projection_saved_items WHERE item_id = ${id}`;
          if (existing.length) return yield* new SavedItemError({ reason: "conflict" });
          const timestamp = yield* now;
          const caller = yield* SavedItemCaller;
          return {
            id,
            ...(scope.id === undefined ? {} : { workspaceId: scope.id }),
            kind: input.kind,
            title: input.title,
            body: input.body,
            tags: input.tags,
            projectId: input.projectId,
            status: "queued",
            launchedThreadId: null,
            createdBy: caller.actor,
            createdAt: timestamp,
            updatedAt: timestamp,
            launchedBy: null,
            scheduledTaskId: null,
            boardTaskId: null,
            pendingCommandId: null,
          } satisfies SavedItem;
        }),
      );
    });
  const update: SavedItemService["Service"]["update"] = (raw) =>
    Effect.gen(function* () {
      const input = yield* decodeUpdate(raw).pipe(
        Effect.mapError((cause) => new SavedItemError({ reason: "invalid_input", cause })),
      );
      return yield* command(
        input,
        "saved_item.updated",
        Effect.gen(function* () {
          const item = yield* get(input.id, input.workspaceId);
          yield* editable(item);
          if (input.projectId !== undefined && input.projectId !== null) {
            const scope = yield* workspaceScope(item.workspaceId);
            if (!scope.projectIds.has(input.projectId))
              return yield* new SavedItemError({ reason: "invalid_input" });
          }
          const file = folderFile(item.id);
          const dir = file === null ? null : yield* promptsDir(item.workspaceId);
          if (file !== null && dir !== null) {
            const title = input.title ?? item.title;
            const body = input.body ?? item.body;
            yield* Effect.try({
              try: () => writeFolderPrompt(dir, { file, title, body }),
              catch: fsError,
            });
          }
          return {
            ...item,
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.body === undefined ? {} : { body: input.body }),
            ...(input.tags === undefined ? {} : { tags: input.tags }),
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            updatedAt: yield* now,
          };
        }),
      );
    });
  const transition: SavedItemService["Service"]["transition"] = (input) =>
    command(
      input,
      `saved_item.${input.action}`,
      Effect.gen(function* () {
        const item = yield* get(input.id, input.workspaceId);
        yield* editable(item);
        const caller = yield* SavedItemCaller;
        // A pending schedule keeps running without its item, so it blocks deletion; agents never delete.
        const deletable =
          caller.actor === "user" &&
          (!item.scheduledTaskId || item.status === "launched" || item.status === "done");
        const valid =
          input.action === "delete"
            ? deletable
            : input.action === "archive"
              ? item.status !== "archived"
              : input.action === "restore"
                ? item.status === "archived"
                : input.action === "done"
                  ? item.status === "launched" || item.status === "queued"
                  : item.status === "done" || item.status === "launched";
        if (!valid) return yield* new SavedItemError({ reason: "invalid_transition" });
        if (input.action === "delete") {
          const file = folderFile(item.id);
          const dir = file === null ? null : yield* promptsDir(item.workspaceId);
          if (file !== null && dir !== null)
            yield* Effect.try({ try: () => deleteFolderPrompt(dir, file), catch: fsError });
          return { ...item, updatedAt: yield* now };
        }
        return {
          ...item,
          status:
            input.action === "archive"
              ? "archived"
              : input.action === "done"
                ? "done"
                : input.action === "restore"
                  ? (item.archivedFromStatus ?? "queued")
                  : "queued",
          archivedFromStatus:
            input.action === "archive" && item.status !== "archived" ? item.status : null,
          updatedAt: yield* now,
        };
      }),
    );
  const request: SavedItemService["Service"]["request"] = (request) =>
    command(
      request.input,
      `saved_item.${request.action}_requested`,
      Effect.gen(function* () {
        const item = yield* get(request.input.id);
        yield* editable(item);
        if (item.status !== "queued" || (request.action !== "task" && item.kind !== "prompt"))
          return yield* new SavedItemError({ reason: "invalid_transition" });
        if (
          request.action !== "task" &&
          (!(request.input.projectId ?? item.projectId) || !item.body.trim())
        )
          return yield* new SavedItemError({ reason: "invalid_input" });
        if (request.action === "task" && (item.body.length > 20_000 || item.title.length > 256))
          return yield* new SavedItemError({ reason: "invalid_input" });
        const timestamp = yield* now;
        if (
          request.action === "schedule" &&
          (!isValidOnceRunAt(request.input.runAt) ||
            Date.parse(request.input.runAt) <= Date.parse(timestamp))
        )
          return yield* new SavedItemError({ reason: "invalid_input" });
        const caller = yield* SavedItemCaller;
        if (caller.actor === "agent" && request.action !== "task") {
          const cutoff = DateTime.formatIso(
            DateTime.subtract(DateTime.makeUnsafe(timestamp), { hours: 1 }),
          );
          const count = yield* sql<{
            count: number;
          }>`SELECT COUNT(*) AS count FROM saved_item_effects WHERE actor = 'agent' AND action != 'task' AND created_at >= ${cutoff}`;
          const parents =
            caller.threadId === null
              ? []
              : yield* sql`SELECT item_id FROM projection_saved_items WHERE json_extract(item_json, '$.launchedThreadId') = ${caller.threadId} AND json_extract(item_json, '$.launchedBy') = 'agent'`;
          const scheduledParents =
            caller.threadId === null
              ? []
              : yield* sql`
            SELECT effect.item_id FROM orchestration_v2_projection_messages AS message
            JOIN saved_item_effects AS effect ON json_extract(message.payload_json, '$.scheduledTaskId') = 'saved-item:' || effect.command_id
            WHERE message.thread_id = ${caller.threadId} AND effect.actor = 'agent' AND effect.action = 'schedule'
            LIMIT 1`;
          if ((count[0]?.count ?? 0) >= 10 || parents.length > 0 || scheduledParents.length > 0)
            return yield* new SavedItemError({ reason: "agent_limit" });
        }
        const requestJson = yield* encodeRequest(request);
        yield* sql`INSERT INTO saved_item_effects (command_id, item_id, action, request_json, actor, caller_thread_id, created_at)
      VALUES (${request.input.commandId}, ${item.id}, ${request.action}, ${requestJson}, ${caller.actor}, ${caller.threadId}, ${timestamp})`;
        return { ...item, pendingCommandId: request.input.commandId, updatedAt: timestamp };
      }),
    );
  const pending = Effect.gen(function* () {
    const rows = yield* sql<{
      request_json: string;
      actor: SavedItemCreator;
      item_id: string;
    }>`SELECT request_json, actor, item_id FROM saved_item_effects WHERE completed = 0 ORDER BY created_at, command_id`;
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        return {
          request: yield* decodeRequest(row.request_json),
          actor: row.actor,
          item: yield* get(SavedItemId.make(row.item_id)),
        };
      }),
    );
  }).pipe(storage);
  const complete: SavedItemService["Service"]["complete"] = (commandId, patch) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<{
            item_id: string;
            action: string;
            actor: SavedItemCreator;
            completed: number;
          }>`SELECT item_id, action, actor, completed FROM saved_item_effects WHERE command_id = ${commandId}`;
          const row = rows[0];
          if (!row) return yield* new SavedItemError({ reason: "not_found" });
          const item = yield* get(SavedItemId.make(row.item_id));
          if (row.completed) return item;
          const next: SavedItem = {
            ...item,
            ...patch,
            status: row.action === "launch" ? "launched" : item.status,
            ...(row.action === "launch" ? { launchedBy: row.actor } : {}),
            pendingCommandId: null,
            updatedAt: yield* now,
          };
          yield* record(
            CommandId.make(`${commandId}:complete`),
            `saved_item.${row.action}_completed`,
            next,
          );
          yield* sql`UPDATE saved_item_effects SET completed = 1 WHERE command_id = ${commandId}`;
          const json = yield* encode(next);
          yield* sql`UPDATE saved_item_commands SET result_json = ${json} WHERE command_id = ${commandId}`;
          return next;
        }),
      )
      .pipe(storage);
  return SavedItemService.of({
    create,
    update,
    transition,
    get,
    request,
    pending,
    complete,
    reconcileScheduledRuns: sql
      .withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<{
            item_id: string;
            command_id: string;
            actor: SavedItemCreator;
            thread_id: string;
            last_run_at: string;
          }>`
        SELECT effect.item_id, effect.command_id, effect.actor, message.thread_id, task.last_run_at
        FROM saved_item_effects AS effect
        JOIN scheduled_tasks AS task ON task.task_id = 'saved-item:' || effect.command_id
        JOIN orchestration_v2_projection_messages AS message ON json_extract(message.payload_json, '$.scheduledTaskId') = task.task_id
        WHERE effect.action = 'schedule' AND effect.completed = 1 AND task.last_run_status = 'succeeded'
        AND NOT EXISTS (SELECT 1 FROM saved_item_events WHERE command_id = 'scheduled-item:' || effect.command_id)
        ORDER BY message.created_at DESC`;
          for (const row of rows) {
            // A deleted item has nothing left to mark launched.
            const found = yield* Effect.option(get(SavedItemId.make(row.item_id)));
            if (found._tag === "None") continue;
            const item = found.value;
            const eventId = CommandId.make(`scheduled-item:${row.command_id}`);
            const exists =
              yield* sql`SELECT sequence FROM saved_item_events WHERE command_id = ${eventId}`;
            if (exists.length) continue;
            yield* record(eventId, "saved_item.scheduled_run_launched", {
              ...item,
              launchedThreadId: ThreadId.make(row.thread_id),
              launchedBy: row.actor,
              status: item.status === "queued" ? "launched" : item.status,
              updatedAt: row.last_run_at,
            });
          }
        }),
      )
      .pipe(storage),
    importMarkdown: (input) =>
      Effect.gen(function* () {
        const parsed = parseSavedItemMarkdown(input.markdown);
        if (!parsed.ok) return yield* new SavedItemError({ reason: "invalid_input" });
        return yield* create({
          commandId: input.commandId,
          ...parsed.item,
          projectId: input.projectId,
          ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
        });
      }),
    list: (input) =>
      Effect.gen(function* () {
        const scope = yield* workspaceScope(input.workspaceId, input.projectId);
        if (input.workspaceId && scope.root === null) return { items: [] };
        const promptsFolder =
          input.kind === "note" || (input.projectId !== undefined && input.projectId !== null)
            ? undefined
            : yield* syncFolder(scope);
        const rows = yield* sql<{
          item_json: string;
        }>`SELECT item_json FROM projection_saved_items WHERE ${sql.and([
          sql`moved_to_board = 0`,
          ...(input.projectId === undefined
            ? []
            : input.projectId === null
              ? [sql`project_id IS NULL`]
              : [sql`project_id = ${input.projectId}`]),
          input.status === undefined ? sql`status != 'archived'` : sql`status = ${input.status}`,
          ...(input.kind === undefined ? [] : [sql`kind = ${input.kind}`]),
        ])} ORDER BY updated_at DESC, item_id`;
        const items = yield* Effect.forEach(rows, (row) => decode(row.item_json));
        const scoped =
          scope.root === null && !input.workspaceId
            ? items
            : items.filter((item) => belongs(item, scope));
        return promptsFolder === undefined ? { items: scoped } : { items: scoped, promptsFolder };
      }).pipe(storage),
    rebuild: sql
      .withTransaction(
        Effect.gen(function* () {
          const rows = yield* sql<{
            item_json: string;
            event_type: string;
          }>`SELECT item_json, event_type FROM saved_item_events ORDER BY sequence`;
          yield* sql`DELETE FROM projection_saved_items`;
          for (const row of rows) {
            const item = yield* decode(row.item_json);
            if (row.event_type === DELETE_EVENT)
              yield* sql`DELETE FROM projection_saved_items WHERE item_id = ${item.id}`;
            else yield* project(item);
          }
        }),
      )
      .pipe(storage),
  });
});
export const layer = Layer.effect(SavedItemService, make);
