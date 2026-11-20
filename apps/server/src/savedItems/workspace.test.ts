// @effect-diagnostics nodeBuiltinImport:off - temp folders are plain Node fixtures.
import { assert, it } from "@effect/vitest";
import { CommandId, ProjectId, SavedItemId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as SqlClient from "effect/sql/SqlClient";
import * as SavedItems from "./SavedItemService.ts";

it.effect("isolates same-named folder prompts and their edits across workspaces", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const temp = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "saved workspace 雪-"));
      const roots = ["personal", "business"].map((id) => {
        const root = NodePath.join(temp, id);
        NodeFS.mkdirSync(NodePath.join(root, "prompts"), { recursive: true });
        NodeFS.mkdirSync(NodePath.join(root, "tasks"));
        NodeFS.writeFileSync(
          NodePath.join(root, "workspace.json"),
          JSON.stringify({ id, name: id, type: id, schemaVersion: 1 }),
        );
        NodeFS.writeFileSync(
          NodePath.join(root, "prompts", "same.md"),
          `---\r\ntype: prompt\r\ntitle: ${id}\r\n---\r\n${id}`,
        );
        return root;
      });
      const previous = [process.env.LEONIDAS_AIOS_ROOT, process.env.AIOS_ROOT];
      process.env.LEONIDAS_AIOS_ROOT = roots[0];
      process.env.AIOS_ROOT = roots[1];
      return { temp, roots, previous };
    }),
    ({ roots }) =>
      Effect.gen(function* () {
        const service = yield* SavedItems.SavedItemService;
        const business = yield* service.list({ workspaceId: "business" });
        assert.deepEqual(
          business.items.map((item) => item.body),
          ["business"],
        );
        const forged = yield* service
          .create({
            commandId: CommandId.make("forged-folder-id"),
            id: SavedItemId.make("folder:../../victim"),
            workspaceId: "business",
            projectId: null,
            kind: "prompt",
            title: "Forged file",
            body: "foreign",
            tags: [],
          })
          .pipe(Effect.flip);
        assert.equal(forged.reason, "invalid_input");
        const foreignProject = ProjectId.make("foreign-project");
        const foreignCreate = yield* service
          .create({
            commandId: CommandId.make("foreign-project-create"),
            workspaceId: "business",
            projectId: foreignProject,
            kind: "prompt",
            title: "Wrong project",
            body: "foreign",
            tags: [],
          })
          .pipe(Effect.flip);
        assert.equal(foreignCreate.reason, "invalid_input");
        const foreignUpdate = yield* service
          .update({
            commandId: CommandId.make("foreign-project-update"),
            id: business.items[0]!.id,
            workspaceId: "business",
            projectId: foreignProject,
          })
          .pipe(Effect.flip);
        assert.equal(foreignUpdate.reason, "invalid_input");
        const sql = yield* SqlClient.SqlClient;
        const legacyId = SavedItemId.make("folder:business:../victim.md");
        const legacy = { ...business.items[0]!, id: legacyId };
        yield* sql`INSERT INTO projection_saved_items
          (item_id, project_id, status, kind, moved_to_board, item_json, updated_at)
          VALUES (${legacyId}, NULL, 'queued', 'prompt', 0, ${JSON.stringify(legacy)}, ${legacy.updatedAt})`;
        const victim = NodePath.join(roots[1]!, "victim.md");
        NodeFS.writeFileSync(victim, "keep");
        yield* service.update({
          commandId: CommandId.make("legacy-edit"),
          id: legacyId,
          body: "replace",
        });
        assert.equal(NodeFS.readFileSync(victim, "utf8"), "keep");
        yield* service.transition({
          commandId: CommandId.make("legacy-delete"),
          id: legacyId,
          action: "delete",
        });
        assert.equal(NodeFS.readFileSync(victim, "utf8"), "keep");
        assert.deepEqual(
          (yield* service.list({})).items.map((item) => item.body),
          ["personal"],
        );
        assert.deepEqual(
          (yield* service.list({ workspaceId: "business" })).items.map((item) => item.id),
          business.items.map((item) => item.id),
        );
        const denied = yield* service
          .update({
            commandId: CommandId.make("foreign-edit"),
            id: business.items[0]!.id,
            workspaceId: "personal",
            body: "foreign",
          })
          .pipe(Effect.flip);
        assert.equal(denied.reason, "not_found");
        assert.equal(
          (yield* service.get(business.items[0]!.id, "personal").pipe(Effect.flip)).reason,
          "not_found",
        );
        assert.equal(
          (yield* service.get(business.items[0]!.id, "missing").pipe(Effect.flip)).reason,
          "not_found",
        );
        const deniedDelete = yield* service
          .transition({
            commandId: CommandId.make("foreign-delete"),
            id: business.items[0]!.id,
            workspaceId: "personal",
            action: "delete",
          })
          .pipe(Effect.flip);
        assert.equal(deniedDelete.reason, "not_found");
        yield* service.update({
          commandId: CommandId.make("edit-business"),
          id: business.items[0]!.id,
          body: "changed",
        });
        assert.ok(
          NodeFS.readFileSync(NodePath.join(roots[1]!, "prompts", "same.md"), "utf8").endsWith(
            "changed\n",
          ),
        );
        assert.ok(
          NodeFS.readFileSync(NodePath.join(roots[0]!, "prompts", "same.md"), "utf8").endsWith(
            "personal",
          ),
        );
        const created = yield* service.create({
          commandId: CommandId.make("create-business"),
          workspaceId: "business",
          kind: "prompt",
          title: "Rank my tasks",
          body: "Rank them.",
          tags: [],
          projectId: null,
        });
        assert.ok(created.id.endsWith(":saved-prompt-rank-my-tasks.md"));
        assert.ok(
          NodeFS.existsSync(NodePath.join(roots[1]!, "prompts", "saved-prompt-rank-my-tasks.md")),
        );
        assert.deepEqual((yield* service.list({ workspaceId: "missing" })).items, []);
        yield* service.transition({
          commandId: CommandId.make("delete-business"),
          id: business.items[0]!.id,
          action: "delete",
        });
        assert.equal(NodeFS.existsSync(NodePath.join(roots[1]!, "prompts", "same.md")), false);
        assert.equal((yield* service.list({})).items.length, 1);
      }).pipe(Effect.provide(SavedItems.layer.pipe(Layer.provideMerge(Sqlite.layerMemory)))),
    ({ temp, previous }) =>
      Effect.sync(() => {
        for (const [i, key] of ["LEONIDAS_AIOS_ROOT", "AIOS_ROOT"].entries()) {
          if (previous[i] === undefined) delete process.env[key];
          else process.env[key] = previous[i];
        }
        NodeFS.rmSync(temp, { recursive: true, force: true });
      }),
  ),
);
