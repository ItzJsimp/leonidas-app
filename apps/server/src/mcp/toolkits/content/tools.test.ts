// @effect-diagnostics nodeBuiltinImport:off - the tool kit reads real content files in a temp folder.
import { afterEach, describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as ServerSecretStore from "#server/auth/ServerSecretStore.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { liveThreadsLayer } from "../../McpToolAccess.testkit.ts";
import * as ContentHandlers from "./handlers.ts";
import { ContentToolkit } from "./tools.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const put = (root: string, path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, path)), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, path), text);
};

/** A made-up workspace with one deal, a voice bible and one video. Not a Git repo. */
function workspace(): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "content-mcp-"));
  roots.push(root);
  put(
    root,
    "deals/acme-cases/deal.md",
    '---\nbrand: "Acme Cases"\ndo_not:\n  - "cheap"\n---\n# Acme Cases\n\nTerms: 2 videos.\n',
  );
  put(
    root,
    "deals/_lens/voice-bible.md",
    '---\nbanned_words:\n  - "game changer"\n---\nTalk plain.\n',
  );
  put(
    root,
    "deals/acme-cases/01-drop-test.md",
    '---\ntitle: "Drop test"\nstage: script_review\n---\n## Script\n\nSPOKEN: "Built to last."\n',
  );
  return root;
}

const threadId = ThreadId.make("thread:content");
const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment"),
  requestNamespace: `provider:${threadId}`,
  thread: {
    threadId,
    providerSessionId: `provider:${threadId}`,
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
};

const mcpClient = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "mcp-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const server = (root: string) =>
  McpHttpServer.toolkitRegistration(ContentToolkit, ContentHandlers.layer).pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(liveThreadsLayer),
    Layer.provideMerge(
      Layer.mock(ServerSecretStore.ServerSecretStore)({
        getOrCreateRandom: () => Effect.succeed(new Uint8Array(32).fill(7)),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(ProjectService.ProjectService)({
        snapshot: Effect.succeed({ projects: [] } as never),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(TaskBoardService.TaskBoardService)({ aiosRoot: () => Effect.succeed(root) }),
    ),
  );

/** Calls one tool as an agent would and returns its JSON answer. */
const call = (name: string, args: Record<string, unknown> = {}) =>
  McpServer.McpServer.pipe(
    Effect.flatMap((mcp) => mcp.callTool({ name, arguments: args })),
    Effect.map(({ content, isError }) => ({
      isError: isError === true,
      json: (() => {
        const t = content.map((part) => (part.type === "text" ? part.text : "")).join("");
        try {
          return JSON.parse(t);
        } catch {
          throw new Error(t);
        }
      })(),
    })),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
    Effect.provideService(McpSchema.McpServerClient, mcpClient),
  );

describe("content tool kit", () => {
  it("holds read and draft tools only", () => {
    const names = Object.keys(ContentToolkit.tools).toSorted();
    expect(names).toEqual([
      "leo_content_deal_propose",
      "leo_content_read",
      "leo_content_script_save",
      "leo_content_stage_move",
      "leo_content_video_create",
    ]);
    expect(names.filter((name) => /approve|deliver|paid|film|delete/.test(name))).toEqual([]);
  });

  it.effect("reads the deals, then one deal with its card and the voice bible", () => {
    const root = workspace();
    return Effect.gen(function* () {
      const list = yield* call("leo_content_read");
      expect(list.json.deals).toEqual([
        {
          slug: "acme-cases",
          brand: "Acme Cases",
          videos: [{ file: "01-drop-test", title: "Drop test", stage: "script_review" }],
        },
      ]);
      const one = yield* call("leo_content_read", { deal: "acme-cases" });
      expect(one.json.card).toContain("Terms: 2 videos.");
      expect(one.json.deal.doNot).toEqual(["cheap"]);
      expect(one.json.voiceBible).toContain("Talk plain.");
    }).pipe(Effect.provide(server(root)));
  });

  it.effect("drafts a new video from idea to script review", () => {
    const root = workspace();
    return Effect.gen(function* () {
      const created = yield* call("leo_content_video_create", {
        deal: "acme-cases",
        title: "Case vs. Hammer!",
        idea: "Hit the case with a hammer.",
      });
      expect(created.json.video).toMatchObject({
        file: "02-case-vs-hammer",
        stage: "idea",
        idea: "Hit the case with a hammer.",
      });
      // Not a Git repo here, so the file is saved and the history step says why it was skipped.
      expect(created.json.recorded).toBe(false);
      yield* call("leo_content_stage_move", {
        deal: "acme-cases",
        file: "02-case-vs-hammer",
        to: "scripting",
      });
      const saved = yield* call("leo_content_script_save", {
        deal: "acme-cases",
        file: "02-case-vs-hammer",
        script: 'SPOKEN: "One hammer. Zero cracks."',
        hookScore: 8,
      });
      expect(saved.json.video.scorecard).toMatchObject({ hookScore: 8, blocks: [] });
      const moved = yield* call("leo_content_stage_move", {
        deal: "acme-cases",
        file: "02-case-vs-hammer",
        to: "script_review",
      });
      expect(moved.json.video.stage).toBe("script_review");
    }).pipe(Effect.provide(server(root)));
  });

  it.effect("proposes a deal only when intake allows it, and a proposal is not a deal", () => {
    const root = workspace();
    const brand = { brand: "Lumen Lamp", source: "Email from Alex, Oct 28" };
    return Effect.gen(function* () {
      const refused = yield* call("leo_content_deal_propose", brand);
      expect(refused.isError).toBe(true);
      expect(refused.json.message).toContain("manual");
      put(root, "deals/_lens/settings.json", '{"deal_intake":"propose"}');
      const made = yield* call("leo_content_deal_propose", brand);
      expect(made.json).toMatchObject({
        intake: "propose",
        proposal: { slug: "lumen-lamp", source: "Email from Alex, Oct 28" },
      });
      expect(made.json.deal).toBeUndefined();
      const list = yield* call("leo_content_read");
      expect(list.json.deals.map((deal: { slug: string }) => deal.slug)).toEqual(["acme-cases"]);
    }).pipe(Effect.provide(server(root)));
  });

  it.effect("refuses an agent move past script review, and a banned word names the rule", () => {
    const root = workspace();
    return Effect.gen(function* () {
      // The tool's own schema refuses the stage, before any file work.
      const approve = yield* Effect.exit(
        call("leo_content_stage_move", {
          deal: "acme-cases",
          file: "01-drop-test",
          to: "ready_to_film",
        }),
      );
      expect(approve._tag).toBe("Failure");
      yield* call("leo_content_video_create", {
        deal: "acme-cases",
        title: "Hype",
        idea: "Hype it.",
      });
      yield* call("leo_content_stage_move", {
        deal: "acme-cases",
        file: "02-hype",
        to: "scripting",
      });
      yield* call("leo_content_script_save", {
        deal: "acme-cases",
        file: "02-hype",
        script: 'SPOKEN: "A total game changer."',
      });
      const blocked = yield* call("leo_content_stage_move", {
        deal: "acme-cases",
        file: "02-hype",
        to: "script_review",
      });
      expect(blocked.isError).toBe(true);
      expect(blocked.json.message).toContain('Banned word: "game changer"');
    }).pipe(Effect.provide(server(root)));
  });
});
