import { describe, expect, it } from "vite-plus/test";
import {
  type ThreadPullRequestLink,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  NodeId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  applyOrchestrationV2ProjectionEvent,
  upsertVisibleTurnItem,
} from "./orchestrationV2Projection.ts";

const now = DateTime.makeUnsafe("2026-06-20T00:00:00.000Z");
const threadId = ThreadId.make("thread-reducer");
const runId = RunId.make("run-reducer");
const run = {
  id: runId,
  threadId,
  ordinal: 1,
  providerInstanceId: ProviderInstanceId.make("codex"),
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  providerThreadId: null,
  userMessageId: MessageId.make("message-reducer"),
  rootNodeId: null,
  activeAttemptId: null,
  status: "completed",
  requestedAt: now,
  startedAt: now,
  completedAt: now,
  checkpointId: null,
  contextHandoffId: null,
} satisfies OrchestrationV2Run;

function commandItem(id: string, output = "done", ordinal = 1): OrchestrationV2TurnItem {
  return {
    id: TurnItemId.make(id),
    threadId,
    runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed",
    title: null,
    startedAt: now,
    completedAt: now,
    updatedAt: now,
    type: "command_execution",
    input: "pwd",
    output,
    exitCode: 0,
  };
}
const emptyProjection = {
  thread: {
    id: threadId,
    projectId: ProjectId.make("project-reducer"),
    title: "Reducer",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  },
  runs: [],
  attempts: [],
  nodes: [],
  subagents: [],
  providerSessions: [],
  providerThreads: [],
  providerTurns: [],
  runtimeRequests: [],
  messages: [],
  plans: [],
  turnItems: [],
  checkpointScopes: [],
  checkpoints: [],
  contextHandoffs: [],
  contextTransfers: [],
  visibleTurnItems: [],
  updatedAt: now,
} as OrchestrationV2ThreadProjection;

describe("applyOrchestrationV2ProjectionEvent", () => {
  it("applies a compact PR sync without replacing other links or thread metadata", () => {
    const link = (number: number): ThreadPullRequestLink => ({
      host: "github.com",
      repository: "pingdotgg/t3code",
      number,
      url: `https://github.com/pingdotgg/t3code/pull/${number}`,
      source: "manual",
      linkedAt: DateTime.formatIso(now),
      snapshot: null,
      stack: null,
    });
    const links = [link(1), link(2)];
    const projection = {
      ...emptyProjection,
      thread: { ...emptyProjection.thread, pullRequests: links },
    };
    const updated = { ...links[1]!, source: "agent" as const };
    const next = applyOrchestrationV2ProjectionEvent(projection, {
      id: "compact-sync" as OrchestrationV2DomainEvent["id"],
      type: "thread.pull-request-link-updated",
      threadId,
      occurredAt: now,
      payload: updated,
    });
    expect(next?.thread).toEqual({ ...projection.thread, pullRequests: [links[0], updated] });
    expect(next?.thread.pullRequests?.[0]).toBe(links[0]);
  });

  it("keeps live token usage when the terminal provider turn omits it", () => {
    const providerTurnId = ProviderTurnId.make("provider-turn-reducer");
    const running = {
      id: providerTurnId,
      providerThreadId: ProviderThreadId.make("provider-thread-reducer"),
      nodeId: NodeId.make("provider-node-reducer"),
      runAttemptId: null,
      nativeTurnRef: null,
      ordinal: 1,
      status: "running" as const,
      startedAt: now,
      completedAt: null,
      turnTokenUsage: {
        usageScope: "main_agent" as const,
        usageStatus: "partial" as const,
        hasSubagents: false,
        outputTokens: 80,
      },
      tokenUsage: {
        usedTokens: 50_000,
        maxTokens: 200_000,
        updatedAt: "2026-08-29T00:00:00.000Z",
      },
    };
    const projection = { ...emptyProjection, providerTurns: [running] };
    const event = {
      id: "event-provider-turn-terminal",
      type: "provider-turn.updated",
      threadId,
      driver: "codex",
      occurredAt: now,
      payload: {
        ...running,
        status: "completed",
        completedAt: now,
        tokenUsage: undefined,
        turnTokenUsage: undefined,
      },
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(projection, event);

    expect(next?.providerTurns[0]?.status).toBe("completed");
    expect(next?.providerTurns[0]?.tokenUsage).toEqual(running.tokenUsage);
    expect(next?.providerTurns[0]?.turnTokenUsage).toEqual(running.turnTokenUsage);
  });

  it("applies thread lifecycle payloads instead of leaving stale metadata", () => {
    const archivedAt = DateTime.makeUnsafe("2026-06-20T01:00:00.000Z");
    const event = {
      id: "event-archive",
      type: "thread.archived",
      threadId,
      occurredAt: archivedAt,
      payload: { ...emptyProjection.thread, archivedAt, updatedAt: archivedAt },
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(emptyProjection, event);
    expect(next?.thread.archivedAt).toEqual(archivedAt);
    expect(next?.updatedAt).toEqual(archivedAt);
  });

  it("ignores events for another thread", () => {
    const event = {
      id: "event-other",
      type: "thread.deleted",
      threadId: ThreadId.make("thread-other"),
      occurredAt: now,
      payload: { ...emptyProjection.thread, id: ThreadId.make("thread-other"), deletedAt: now },
    } as OrchestrationV2DomainEvent;

    expect(applyOrchestrationV2ProjectionEvent(emptyProjection, event)).toBe(emptyProjection);
  });

  it("preserves visible row identity when run updates do not change membership", () => {
    const item = commandItem("item-stable");
    const visibleTurnItems = [
      {
        position: 0,
        visibility: "local" as const,
        sourceThreadId: threadId,
        sourceItemId: item.id,
        item,
      },
    ];
    const projection = {
      ...emptyProjection,
      runs: [run],
      turnItems: [item],
      visibleTurnItems,
    };
    const event = {
      id: "event-run-update",
      type: "run.updated",
      threadId,
      runId,
      occurredAt: now,
      payload: { ...run, status: "completed" },
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(projection, event);
    expect(next?.visibleTurnItems).toBe(visibleTurnItems);
    expect(next?.visibleTurnItems[0]).toBe(visibleTurnItems[0]);
  });

  it("replaces only the updated visible item when membership is unchanged", () => {
    const first = commandItem("item-first", "first");
    const second = commandItem("item-second", "second");
    const firstRow = {
      position: 0,
      visibility: "local" as const,
      sourceThreadId: threadId,
      sourceItemId: first.id,
      item: first,
    };
    const secondRow = {
      position: 1,
      visibility: "local" as const,
      sourceThreadId: threadId,
      sourceItemId: second.id,
      item: second,
    };
    const updated = commandItem("item-first", "streamed output");
    const projection = {
      ...emptyProjection,
      runs: [run],
      turnItems: [first, second],
      visibleTurnItems: [firstRow, secondRow],
    };
    const event = {
      id: "event-item-update",
      type: "turn-item.updated",
      threadId,
      runId,
      occurredAt: now,
      payload: updated,
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(projection, event);
    expect(next?.visibleTurnItems).not.toBe(projection.visibleTurnItems);
    expect(next?.visibleTurnItems[0]).not.toBe(firstRow);
    expect(next?.visibleTurnItems[0]?.item).toBe(updated);
    expect(next?.visibleTurnItems[1]).toBe(secondRow);
  });

  it("inserts live turn items by authoritative ordinal", () => {
    const queuedFuture = commandItem("item-queued-future", "queued", 300);
    const activeAssistant = commandItem("item-active-assistant", "done", 201);
    const queuedRow = {
      position: 0,
      visibility: "local" as const,
      sourceThreadId: threadId,
      sourceItemId: queuedFuture.id,
      item: queuedFuture,
    };
    const projection = {
      ...emptyProjection,
      runs: [run],
      turnItems: [queuedFuture],
      visibleTurnItems: [queuedRow],
    };
    const event = {
      id: "event-active-assistant",
      type: "turn-item.updated",
      threadId,
      runId,
      occurredAt: now,
      payload: activeAssistant,
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(projection, event);
    expect(next?.visibleTurnItems.map((row) => row.item.id)).toEqual([
      activeAssistant.id,
      queuedFuture.id,
    ]);
    expect(next?.visibleTurnItems.map((row) => row.position)).toEqual([0, 1]);
  });

  it("moves an updated item to its new ordinal and renumbers the rows it passes", () => {
    const inherited = {
      ...commandItem("item-inherited", "parent", 0),
      threadId: ThreadId.make("parent"),
    };
    const items = [
      commandItem("item-a", "a", 1),
      commandItem("item-b", "b", 2),
      commandItem("item-c", "c", 2),
    ];
    const rows = [
      {
        position: 0,
        visibility: "inherited" as const,
        sourceThreadId: inherited.threadId,
        sourceItemId: inherited.id,
        item: inherited,
      },
      ...items.map((item, index) => ({
        position: index + 1,
        visibility: "local" as const,
        sourceThreadId: threadId,
        sourceItemId: item.id,
        item,
      })),
    ];
    const moved = commandItem("item-a", "moved", 2);
    const next = applyOrchestrationV2ProjectionEvent(
      { ...emptyProjection, runs: [run], turnItems: items, visibleTurnItems: rows },
      {
        id: "event-move",
        type: "turn-item.updated",
        threadId,
        runId,
        occurredAt: now,
        payload: moved,
      } as OrchestrationV2DomainEvent,
    );

    // Equal ordinals order by id, so item-a stays ahead of item-b.
    expect(next?.visibleTurnItems.map((row) => [row.item.id, row.position])).toEqual([
      ["item-inherited", 0],
      ["item-a", 1],
      ["item-b", 2],
      ["item-c", 3],
    ]);
    expect(next?.visibleTurnItems[0]).toBe(rows[0]);
    expect(next?.visibleTurnItems[1]?.item).toBe(moved);
    expect(next?.turnItems.map((item) => item.id)).toEqual(["item-a", "item-b", "item-c"]);

    const later = commandItem("item-a", "later", 3);
    const last = applyOrchestrationV2ProjectionEvent(next, {
      id: "event-move-later",
      type: "turn-item.updated",
      threadId,
      runId,
      occurredAt: now,
      payload: later,
    } as OrchestrationV2DomainEvent);
    expect(last?.visibleTurnItems.map((row) => [row.item.id, row.position])).toEqual([
      ["item-inherited", 0],
      ["item-b", 1],
      ["item-c", 2],
      ["item-a", 3],
    ]);
    expect(last?.turnItems.at(0)).toBe(later);
  });

  describe("partial timeline", () => {
    const queuedRunId = RunId.make("run-queued");
    const steerRunId = RunId.make("run-steer");
    const queuedRun = { ...run, id: queuedRunId, ordinal: 2, status: "queued" } as const;
    const steerRun = { ...run, id: steerRunId, ordinal: 3, status: "completed" } as const;
    const runItem = (id: string, itemRunId: RunId, ordinal: number) => ({
      ...commandItem(id, id, ordinal),
      runId: itemRunId,
    });
    const windowOf = (
      runs: ReadonlyArray<OrchestrationV2Run>,
      items: ReadonlyArray<OrchestrationV2TurnItem>,
    ): OrchestrationV2ThreadProjection => ({
      ...emptyProjection,
      runs,
      turnItems: items,
      visibleTurnItems: items.map((item, position) => ({
        position,
        visibility: "local" as const,
        sourceThreadId: threadId,
        sourceItemId: item.id,
        item,
      })),
    });
    const itemEvent = (payload: OrchestrationV2TurnItem) =>
      ({
        id: `event-${payload.id}`,
        type: "turn-item.updated",
        threadId,
        occurredAt: now,
        payload,
      }) as OrchestrationV2DomainEvent;
    const runEvent = (payload: OrchestrationV2Run) =>
      ({
        id: `event-${payload.id}-${payload.status}`,
        type: "run.updated",
        threadId,
        occurredAt: now,
        payload,
      }) as OrchestrationV2DomainEvent;

    it("shows a queued run that starts after a newer steer raised the watermark", () => {
      const steerItems = [
        runItem("item-steer-user", steerRunId, 3_000_001),
        runItem("item-steer-reply", steerRunId, 3_000_002),
      ];
      let projection: OrchestrationV2ThreadProjection | null = windowOf(
        [run, queuedRun, steerRun],
        steerItems,
      );
      let latestLocalTurnOrdinal = 3_000_002;
      const queuedUser = runItem("item-queued-user", queuedRunId, 2_000_001);
      const queuedReply = runItem("item-queued-reply", queuedRunId, 2_000_002);
      for (const event of [
        itemEvent(queuedUser),
        runEvent({ ...queuedRun, status: "running" }),
        itemEvent(queuedReply),
        runEvent({ ...queuedRun, status: "completed" }),
      ]) {
        projection = applyOrchestrationV2ProjectionEvent(projection, event, {
          partialTimeline: true,
          latestLocalTurnOrdinal,
        });
        if (event.type === "turn-item.updated") {
          latestLocalTurnOrdinal = Math.max(latestLocalTurnOrdinal, event.payload.ordinal);
        }
      }

      expect(projection?.visibleTurnItems.map((row) => row.item.id)).toEqual([
        queuedUser.id,
        queuedReply.id,
        ...steerItems.map((item) => item.id),
      ]);
      expect(projection?.turnItems.map((item) => item.id)).toContain(queuedReply.id);
    });

    it("keeps a running run's item when the window starts after its earlier items", () => {
      const runningRun = { ...queuedRun, status: "running" } as const;
      const steerItems = [
        runItem("item-steer-user", steerRunId, 3_000_001),
        runItem("item-steer-reply", steerRunId, 3_000_002),
      ];
      const projection = windowOf([run, runningRun, steerRun], steerItems);
      const reply = runItem("item-running-reply", queuedRunId, 2_000_003);

      const next = applyOrchestrationV2ProjectionEvent(projection, itemEvent(reply), {
        partialTimeline: true,
        latestLocalTurnOrdinal: 3_000_002,
      });

      expect(next?.visibleTurnItems.map((row) => row.item.id)).toEqual([
        reply.id,
        ...steerItems.map((item) => item.id),
      ]);
    });

    it.each([
      { name: "keeps an item of a run already in the window", itemRunId: steerRunId, kept: true },
      { name: "drops an item of a finished run outside the window", itemRunId: runId, kept: false },
    ])("$name that arrives below the watermark", ({ itemRunId, kept }) => {
      const first = runItem("item-first", steerRunId, 3_000_001);
      const later = runItem("item-later", steerRunId, 3_000_003);
      const late = runItem("item-late", itemRunId, 3_000_002);
      const projection = windowOf([run, steerRun], [first, later]);

      const next = applyOrchestrationV2ProjectionEvent(projection, itemEvent(late), {
        partialTimeline: true,
        latestLocalTurnOrdinal: later.ordinal,
      });
      if (kept) {
        expect(next?.visibleTurnItems.map((row) => row.item.id)).toEqual([
          first.id,
          late.id,
          later.id,
        ]);
      } else {
        expect(next).toBe(projection);
      }
    });
  });

  it("removes only hidden local items while preserving inherited rows", () => {
    const inherited = commandItem("item-inherited");
    const local = commandItem("item-local");
    const inheritedRow = {
      position: 0,
      visibility: "inherited" as const,
      sourceThreadId: ThreadId.make("thread-source"),
      sourceItemId: inherited.id,
      item: inherited,
    };
    const localRow = {
      position: 1,
      visibility: "local" as const,
      sourceThreadId: threadId,
      sourceItemId: local.id,
      item: local,
    };
    const projection = {
      ...emptyProjection,
      runs: [run],
      turnItems: [local],
      visibleTurnItems: [inheritedRow, localRow],
    };
    const event = {
      id: "event-run-rollback",
      type: "run.updated",
      threadId,
      runId,
      occurredAt: now,
      payload: { ...run, status: "rolled_back" },
    } as OrchestrationV2DomainEvent;

    const next = applyOrchestrationV2ProjectionEvent(projection, event);
    expect(next?.visibleTurnItems).toEqual([inheritedRow]);
    expect(next?.visibleTurnItems[0]).toBe(inheritedRow);
  });
});

it("does not scan every row against every run for a streaming item update", () => {
  let runReads = 0;
  const runs = Array.from({ length: 100 }, (_, index) => ({
    ...run,
    get id() {
      runReads++;
      return RunId.make(`run-${index}`);
    },
  }));
  const items = Array.from({ length: 1000 }, (_, index) =>
    commandItem(`item-${index}`, "before", index),
  );
  const projection = {
    ...emptyProjection,
    runs,
    turnItems: items,
    visibleTurnItems: items.map((item, position) => ({
      item,
      position,
      visibility: "local" as const,
      sourceThreadId: threadId,
      sourceItemId: item.id,
    })),
  };
  const payload = commandItem("item-999", "after", 999);
  const next = applyOrchestrationV2ProjectionEvent(projection, {
    id: "stream-update",
    type: "turn-item.updated",
    threadId,
    occurredAt: now,
    payload,
  } as OrchestrationV2DomainEvent);
  expect(next?.visibleTurnItems.at(-1)?.item).toBe(payload);
  expect(next?.visibleTurnItems[0]).toBe(projection.visibleTurnItems[0]);
  expect(runReads).toBeLessThanOrEqual(100);
});

type VisibleRows = OrchestrationV2ThreadProjection["visibleTurnItems"];

function visibleRowsProjection(rows: VisibleRows) {
  return { visibleTurnItems: rows, runs: [] } as unknown as OrchestrationV2ThreadProjection;
}

// The insert/replace path before the in-place fast path, kept as the reference.
function referenceUpsertVisibleTurnItem(
  rows: VisibleRows,
  item: OrchestrationV2TurnItem,
  partialTimeline: boolean,
  latestLocalTurnOrdinal: number | null,
): VisibleRows {
  const index = rows.findIndex((row) => row.sourceItemId === item.id);
  const next = {
    position: 0,
    visibility: "local" as const,
    sourceThreadId: item.threadId,
    sourceItemId: item.id,
    item,
  };
  const previous = index === -1 ? undefined : rows[index]!;
  if (
    previous !== undefined &&
    previous.visibility === next.visibility &&
    previous.sourceThreadId === next.sourceThreadId &&
    previous.sourceItemId === next.sourceItemId &&
    previous.item === item
  ) {
    return rows;
  }
  if (index === -1 && partialTimeline) {
    const localOrdinals = rows
      .filter((row) => row.visibility === "local")
      .map((row) => row.item.ordinal);
    const oldest = localOrdinals.length === 0 ? null : Math.min(...localOrdinals);
    if (
      (latestLocalTurnOrdinal !== null && item.ordinal <= latestLocalTurnOrdinal) ||
      (oldest !== null && item.ordinal < oldest)
    ) {
      return rows;
    }
  }
  const updated = index === -1 ? [...rows] : [...rows.slice(0, index), ...rows.slice(index + 1)];
  const insertionIndex = updated.findIndex(
    (row) =>
      row.visibility === "local" &&
      (row.item.ordinal > item.ordinal ||
        (row.item.ordinal === item.ordinal &&
          String(row.item.id).localeCompare(String(item.id)) > 0)),
  );
  updated.splice(insertionIndex === -1 ? updated.length : insertionIndex, 0, next);
  return updated.map((row, position) => (row.position === position ? row : { ...row, position }));
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("upsertVisibleTurnItem", () => {
  it("matches the reference insert, reorder and replace path over randomized upserts", () => {
    const inheritedRow = (sourceItemId: string, ordinal: number, position: number) =>
      ({
        position,
        visibility: "inherited" as const,
        sourceThreadId: ThreadId.make("thread-parent"),
        sourceItemId: TurnItemId.make(sourceItemId),
        item: {
          ...commandItem(sourceItemId, "inherited", ordinal),
          threadId: ThreadId.make("thread-parent"),
        },
      }) satisfies VisibleRows[number];
    const ids = ["item-0", "item-1", "item-2", "item-3", "item-4", "inherited-0"];

    for (let seed = 1; seed <= 200; seed += 1) {
      const random = mulberry32(seed);
      const initial: VisibleRows = [
        inheritedRow("inherited-1", 2, 0),
        inheritedRow("inherited-2", 3, 1),
      ];
      const latestItems = new Map<string, OrchestrationV2TurnItem>();
      let expected = initial;
      let actual = initial;

      for (let step = 0; step < 40; step += 1) {
        const id = ids[Math.floor(random() * ids.length)]!;
        const ordinal = 1 + Math.floor(random() * 4);
        const previous = latestItems.get(id);
        const item =
          previous !== undefined && previous.ordinal === ordinal && random() < 0.5
            ? previous
            : // No run: the reference models only the ordinal window, not the run-aware keep rules.
              { ...commandItem(id, `output-${seed}-${step}`, ordinal), runId: null };
        latestItems.set(id, item);
        const partialTimeline = random() < 0.3;
        const latestLocalTurnOrdinal = random() < 0.5 ? null : Math.floor(random() * 4);

        expected = referenceUpsertVisibleTurnItem(
          expected,
          item,
          partialTimeline,
          latestLocalTurnOrdinal,
        );
        actual = upsertVisibleTurnItem(
          visibleRowsProjection(actual),
          item,
          partialTimeline,
          latestLocalTurnOrdinal,
        );
        expect(actual).toEqual(expected);
      }
    }
  });

  it("replaces an in-place row without copying the other row objects", () => {
    const rows = [
      commandItem("item-a", "one", 1),
      commandItem("item-b", "two", 2),
      commandItem("item-c", "three", 3),
    ].reduce<VisibleRows>(
      (current, item) => upsertVisibleTurnItem(visibleRowsProjection(current), item, false, null),
      [],
    );
    const updated = commandItem("item-b", "two, streamed", 2);

    const next = upsertVisibleTurnItem(visibleRowsProjection(rows), updated, false, null);

    expect(next).not.toBe(rows);
    expect(next[0]).toBe(rows[0]);
    expect(next[2]).toBe(rows[2]);
    expect(next[1]?.item).toBe(updated);
    expect(next[1]?.position).toBe(1);
  });
});

it("restores deduped bodies from the records it already holds, also in a partial timeline", () => {
  const messageId = MessageId.make("message-deduped");
  const subagentId = NodeId.make("node-deduped");
  const reply = {
    ...commandItem("item-reply", "", 400),
    type: "assistant_message",
    messageId,
    text: "the full reply",
    streaming: false,
  } as unknown as OrchestrationV2TurnItem;
  const subagent = {
    id: subagentId,
    threadId,
    runId,
    parentNodeId: NodeId.make("node-root"),
    origin: "app_owned",
    createdBy: "agent",
    driver: "codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerThreadId: null,
    childThreadId: null,
    nativeTaskRef: null,
    prompt: "the task brief",
    title: null,
    model: null,
    status: "running",
    result: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  } as OrchestrationV2ThreadProjection["subagents"][number];
  const projection = {
    ...emptyProjection,
    runs: [run],
    messages: [
      {
        id: messageId,
        threadId,
        runId,
        nodeId: null,
        role: "assistant",
        text: "the full reply",
        attachments: [],
        streaming: false,
        createdBy: "agent",
        creationSource: "provider",
        createdAt: now,
        updatedAt: now,
      },
    ],
    subagents: [subagent],
  } as OrchestrationV2ThreadProjection;
  const event = (type: string, payload: unknown) =>
    ({
      id: `event-${type}`,
      type,
      threadId,
      runId,
      occurredAt: now,
      payload,
    }) as OrchestrationV2DomainEvent;

  for (const options of [undefined, { partialTimeline: true, latestLocalTurnOrdinal: 300 }]) {
    const withReply = applyOrchestrationV2ProjectionEvent(
      projection,
      event("turn-item.updated", { ...reply, text: "", textOmitted: true }),
      options,
    );
    expect(withReply?.turnItems).toEqual([reply]);
    expect(withReply?.visibleTurnItems.map((row) => row.item)).toEqual([reply]);
  }
  const progressed = applyOrchestrationV2ProjectionEvent(
    projection,
    event("subagent.updated", { ...subagent, prompt: "", promptOmitted: true, progress: "step 2" }),
  );
  expect(progressed?.subagents).toEqual([{ ...subagent, progress: "step 2" }]);
});
