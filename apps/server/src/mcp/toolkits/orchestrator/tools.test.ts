import { assert, describe, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import {
  CreateThreadsTool,
  DelegateTaskTool,
  EventEmitTool,
  OrchestratorToolkit,
  ScheduleTaskTool,
  ThreadUpdateTool,
} from "./tools.ts";

describe("orchestrator MCP tool guidance", () => {
  it("directs subagent requests to delegation instead of ordinary threads", () => {
    assert.include(DelegateTaskTool.description ?? "", "Start one child agent");
    assert.include(CreateThreadsTool.description ?? "", "Not delegation");
    assert.include(CreateThreadsTool.description ?? "", "leo_thread_launch");
    assert.include(DelegateTaskTool.description ?? "", "Keep `taskId`");
    assert.include(
      OrchestratorToolkit.tools.leo_thread_send.description ?? "",
      "starts a fresh task",
    );
    assert.include(
      OrchestratorToolkit.tools.leo_task_cancel.description ?? "",
      "including later runs in its child thread",
    );
  });

  it("documents wait timeout as a parent budget, not a child failure", () => {
    const schema = Tool.getJsonSchema(DelegateTaskTool) as {
      readonly properties?: Readonly<
        Record<
          string,
          {
            readonly description?: unknown;
            readonly anyOf?: ReadonlyArray<{ readonly description?: unknown }>;
          }
        >
      >;
    };
    const mode = schema.properties?.mode;
    const timeoutMs = schema.properties?.timeoutMs;
    const modeText = [mode?.description, ...(mode?.anyOf ?? []).map((entry) => entry.description)]
      .filter((value) => typeof value === "string")
      .join(" ");
    const timeoutText = [
      timeoutMs?.description,
      ...(timeoutMs?.anyOf ?? []).map((entry) => entry.description),
    ]
      .filter((value) => typeof value === "string")
      .join(" ");
    assert.include(modeText, "Default 'async'");
    assert.include(timeoutText, "does not cancel the child");
  });

  it("publishes an actionable schedule schema and compatibility string branch", () => {
    const schema = Tool.getJsonSchema(ScheduleTaskTool) as {
      readonly type?: unknown;
      readonly properties?: Readonly<
        Record<string, { readonly description?: unknown; readonly anyOf?: ReadonlyArray<unknown> }>
      >;
    };

    assert.equal(schema.type, "object");
    assert.isDefined(schema.properties?.schedule);
    assert.isDefined(schema.properties?.scheduledTaskId);
    assert.include(ScheduleTaskTool.description ?? "", "`schedule` is an object, not text");
    assert.include(ScheduleTaskTool.description ?? "", "next run time");
  });

  it("publishes thread metadata actions from an object-root schema", () => {
    const schema = Tool.getJsonSchema(ThreadUpdateTool) as {
      readonly type?: unknown;
      readonly properties?: Readonly<Record<string, unknown>>;
    };

    assert.equal(schema.type, "object");
    assert.hasAllKeys(schema.properties ?? {}, [
      "threadId",
      "action",
      "goalControl",
      "title",
      "clientRequestId",
    ]);
    assert.include(ThreadUpdateTool.description ?? "", "Workspace and branch cannot change");
  });
});

describe("leo_event_emit", () => {
  const decode = Schema.decodeUnknownExit(EventEmitTool.parametersSchema);
  const draft = {
    level: "failed",
    type: "script.failed",
    title: "Nightly backup failed",
    actor: { kind: "agent", name: "Leonidas" },
  };

  it("accepts a valid draft", () => {
    assert.isTrue(Exit.isSuccess(decode(draft)));
  });

  it("rejects a bad level and a button that is not open-only", () => {
    assert.isTrue(Exit.isFailure(decode({ ...draft, level: "urgent" })));
    assert.isTrue(
      Exit.isFailure(decode({ ...draft, actions: [{ label: "Run", kind: "run", ref: "rm" }] })),
    );
  });
});
