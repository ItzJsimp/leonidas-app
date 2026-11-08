import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  MessageId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import type * as EffectAcpSchema from "effect-acp/compat";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import { AcpProviderCapabilitiesV2, makeAcpAdapterV2 } from "@t3tools/provider-acp/server/adapter";

const layerTest = Layer.mergeAll(
  NodeServices.layer,
  IdAllocator.layer,
  McpProviderSessions.layer,
  TestProviderHost.layer().pipe(Layer.provide(NodeServices.layer)),
);

describe("ACP partial turnTokenUsage accumulation", () => {
  it.effect("accumulates partial turnTokenUsage across closed segments and tool calls", () =>
    Effect.gen(function* () {
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const path = yield* Path.Path;
      const mockAgentPath = yield* path.fromFileUrl(
        new URL("../../../scripts/acp-mock-agent.ts", import.meta.url),
      );
      type Runtime = AcpSessionRuntime.AcpSessionRuntime["Service"];
      let handler: Parameters<Runtime["handleSessionUpdate"]>[0] | undefined;
      const instanceId = ProviderInstanceId.make("acp-partial-token-usage");
      const adapter = yield* makeAcpAdapterV2({
        instanceId,
        selfInvocation: yield* resolveSelfInvocation(),
        flavor: {
          driver: ProviderDriverKind.make("acp-test"),
          capabilities: AcpProviderCapabilitiesV2,
          makeRuntime: (runtimeInput) =>
            Effect.gen(function* () {
              const ctx = yield* Layer.build(
                AcpSessionRuntime.layer({
                  ...runtimeInput,
                  spawn: {
                    command: process.execPath,
                    args: [mockAgentPath],
                    cwd: runtimeInput.cwd,
                    env: { T3_ACP_SESSION_LIFECYCLE: "1" },
                  },
                  authMethodId: "test",
                }).pipe(
                  Layer.provide(
                    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
                  ),
                ),
              );
              const runtime = yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
                Effect.provide(ctx),
              );
              return {
                ...runtime,
                handleSessionUpdate: (next) =>
                  Effect.sync(() => {
                    handler = next;
                  }).pipe(Effect.andThen(runtime.handleSessionUpdate(next))),
                prompt: () =>
                  Effect.gen(function* () {
                    const updates: Array<EffectAcpSchema.SessionUpdate> = [
                      {
                        sessionUpdate: "agent_thought_chunk",
                        content: { type: "text", text: "r".repeat(380) }, // 100 reasoning tokens
                      },
                      {
                        sessionUpdate: "agent_message_chunk",
                        content: { type: "text", text: "a".repeat(380) }, // 100 assistant tokens
                      },
                      {
                        sessionUpdate: "tool_call",
                        toolCallId: "call-1",
                        title: "Read file",
                        kind: "read",
                        status: "completed",
                        rawInput: { path: "p".repeat(369) }, // 380 JSON chars = 100 tokens
                      },
                      {
                        sessionUpdate: "agent_message_chunk",
                        content: { type: "text", text: "b".repeat(38) }, // 10 assistant tokens
                      },
                    ];
                    for (const update of updates) {
                      yield* handler!({ sessionId: "mock-session-1", update });
                    }
                    return { stopReason: "end_turn" as const };
                  }),
              };
            }),
        },
      });
      const threadId = ThreadId.make("acp-partial-token-usage");
      const modelSelection = { instanceId, model: "default" } as const;
      const runtimePolicy = ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: process.cwd(),
      });
      const runtime = yield* adapter.openSession({
        threadId,
        providerSessionId: ProviderSessionId.make("acp-partial-token-usage-session"),
        modelSelection,
        runtimePolicy,
      });
      const providerThread = yield* runtime.ensureThread({
        threadId,
        modelSelection,
        runtimePolicy,
      });
      const now = yield* DateTime.now;
      yield* runtime.startTurn({
        appThread: {
          createdBy: "user",
          creationSource: "web",
          id: threadId,
          projectId: ProjectId.make("project:acp-partial-token-usage"),
          title: "ACP token test",
          providerInstanceId: instanceId,
          modelSelection,
          runtimeMode: "approval-required",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          activeProviderThreadId: providerThread.id,
          lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
          forkedFrom: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          lastVisitedAt: null,
          deletedAt: null,
        },
        threadId,
        runId: RunId.make("run:acp-partial-token-usage:1"),
        runOrdinal: 1,
        providerTurnOrdinal: 1,
        attemptId: RunAttemptId.make("attempt:acp-partial-token-usage:1"),
        rootNodeId: NodeId.make("node:acp-partial-token-usage:1"),
        providerThread,
        message: {
          createdBy: "user",
          creationSource: "web",
          messageId: MessageId.make("message:acp-partial-token-usage:1"),
          text: "test prompt",
          attachments: [],
        },
        modelSelection,
        runtimePolicy,
      });
      const turns = Array.from(
        yield* runtime.events.pipe(
          Stream.takeUntil((event) => event.type === "turn.terminal"),
          Stream.runCollect,
        ),
      ).flatMap((event) => (event.type === "provider_turn.updated" ? [event.providerTurn] : []));
      const settled = turns.at(-1);
      assert.equal(settled?.turnTokenUsage?.reasoningTokens, 100);
      assert.equal(settled?.turnTokenUsage?.outputTokens, 310);
    }).pipe(Effect.provide(layerTest), Effect.scoped),
  );
});
