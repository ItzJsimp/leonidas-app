import type { T3McpToolSummaryAction } from "@t3tools/shared/t3McpToolPresentation";

export interface T3ToolSummaryCall {
  readonly input: unknown;
  readonly output: unknown;
  readonly outcome: "completed" | "failed" | "unfinished";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface ToolResult {
  readonly data?: Record<string, unknown>;
  readonly failed: boolean;
}

/** Reads the structured/JSON MCP result envelopes retained by the provider adapters. */
function readResult(value: unknown, depth = 0): ToolResult {
  if (depth > 4) return { failed: false };
  if (typeof value === "string") {
    try {
      return readResult(JSON.parse(value), depth + 1);
    } catch {
      return { failed: false };
    }
  }
  if (Array.isArray(value)) {
    let data: ToolResult["data"];
    let failed = false;
    for (const block of value) {
      const record = asRecord(block);
      const text = record?.text ?? asRecord(record?.content)?.text;
      const result = readResult(asRecord(text)?.text ?? text, depth + 1);
      data ??= result.data;
      failed ||= result.failed;
    }
    return { ...(data ? { data } : {}), failed };
  }
  const record = asRecord(value);
  if (!record) return { failed: false };
  const failed =
    record.isError === true ||
    record.is_error === true ||
    (typeof record._tag === "string" && /(?:Error|Failure)$/.test(record._tag)) ||
    record.error != null;
  const content = record.structuredContent ?? record.content;
  if (content !== undefined) {
    const result = readResult(content, depth + 1);
    return { ...(result.data ? { data: result.data } : {}), failed: failed || result.failed };
  }
  return { data: record, failed };
}

function readInput(value: unknown): Record<string, unknown> | undefined {
  const input = readResult(value).data;
  // Cursor retains its MCP args envelope; other adapters retain the arguments directly.
  return input && typeof input.toolName === "string" ? asRecord(input.args) : input;
}

/** MCP errors can be returned as data even when the provider completed the tool call. */
export function t3ToolResultIndicatesFailure(output: unknown): boolean {
  return readResult(output).failed;
}

function countEntities(ids: ReadonlyArray<string | undefined>): number {
  return (
    new Set(ids.filter((value) => value !== undefined)).size +
    ids.filter((value) => value === undefined).length
  );
}

function quantity(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** Counts successful effects separately from failed or unfinished tool calls. */
export function summarizeT3ToolCalls(
  action: T3McpToolSummaryAction,
  calls: ReadonlyArray<T3ToolSummaryCall>,
): { label: string; failedCount: number } {
  const results = calls.map((call) => {
    const result = readResult(call.output);
    return {
      input: readInput(call.input),
      output: result.data,
      outcome: result.failed ? ("failed" as const) : call.outcome,
    };
  });
  const completed = results.filter((call) => call.outcome === "completed");
  const failedCount = results.filter((call) => call.outcome === "failed").length;
  const selected = completed.length > 0 ? completed : results;
  const times = quantity(selected.length, "time");
  const phrase = (past: string, infinitive: string, object: string) =>
    `${completed.length > 0 ? past : `Tried to ${infinitive}`} ${object}`;
  const entityIds = (key: string) =>
    selected.map((call) => id(call.output?.[key]) ?? id(call.input?.[key]));
  const projectIds = selected.map(
    (call) => id(call.output?.id) ?? id(call.output?.projectId) ?? id(call.input?.projectId),
  );
  const threadIds = selected.map(
    (call) =>
      id(call.output?.threadId) ??
      id(asRecord(call.output?.thread)?.threadId) ??
      id(call.input?.threadId),
  );
  let label: string;
  switch (action) {
    case "thread-send": {
      const messages = countEntities(selected.map((call) => id(call.output?.messageId)));
      const targetsKnown = threadIds.every((value) => value !== undefined);
      const threads = new Set(threadIds).size;
      const object = targetsKnown
        ? messages === threads && messages > 1
          ? `messages to ${quantity(threads, "chat")}`
          : `${quantity(messages, "message")} to ${quantity(threads, "chat")}`
        : quantity(messages, "message");
      label = phrase("Sent", "send", object);
      break;
    }
    case "thread-create": {
      const createdIds: string[] = [];
      const resultsKnown =
        completed.length > 0 &&
        completed.every((call) => {
          const threads = Array.isArray(call.output?.threads) ? call.output.threads : [call.output];
          return threads.every((thread) => {
            const record = asRecord(thread);
            if (record?.status === "rolled_back") return true;
            const threadId = id(record?.threadId);
            if (!threadId) return false;
            createdIds.push(threadId);
            return true;
          });
        });
      label = resultsKnown
        ? `Created ${quantity(new Set(createdIds).size, "chat")}`
        : `Requested chat creation ${times}`;
      break;
    }
    case "delegate": {
      // A subagent call names who started, so the work log shows `@designer`, not "1 helper".
      const subagents = selected.map((call) => id(call.input?.subagent));
      label = subagents.every((name) => name !== undefined)
        ? phrase("Started", "start", [...new Set(subagents)].map((name) => `@${name}`).join(", "))
        : phrase("Started", "start", quantity(countEntities(entityIds("taskId")), "helper"));
      break;
    }
    case "thread-read":
    case "thread-wait": {
      const targets = threadIds.every((value) => value !== undefined)
        ? quantity(new Set(threadIds).size, "chat")
        : `chats ${times}`;
      label =
        action === "thread-read"
          ? phrase("Read", "read", targets)
          : phrase("Waited on", "wait on", targets);
      break;
    }
    case "thread-list":
      label = phrase("Listed", "list", `chats ${times}`);
      break;
    case "thread-interrupt":
      label = phrase("Requested stop for", "stop", quantity(countEntities(threadIds), "chat"));
      break;
    case "workflow-stop":
      label = phrase(
        "Requested stop for",
        "stop",
        quantity(countEntities(entityIds("subagentId")), "helper group"),
      );
      break;
    case "task-status":
      label = phrase("Checked", "check", `task status ${times}`);
      break;
    case "task-cancel":
      label = phrase(
        "Requested cancellation of",
        "cancel",
        quantity(countEntities(entityIds("taskId")), "task"),
      );
      break;
    case "schedule-create":
      label = phrase(
        "Scheduled",
        "schedule",
        quantity(countEntities(entityIds("scheduledTaskId")), "task"),
      );
      break;
    case "schedule-list":
      label = phrase("Listed", "list", `scheduled tasks ${times}`);
      break;
    case "schedule-update":
      label = phrase(
        "Updated",
        "update",
        quantity(countEntities(entityIds("scheduledTaskId")), "scheduled task"),
      );
      break;
    case "schedule-delete":
      // A successful delete can report deleted:false; it still represents a deletion request.
      label = phrase(
        "Requested deletion of",
        "delete",
        quantity(countEntities(entityIds("scheduledTaskId")), "scheduled task"),
      );
      break;
    case "schedule-run":
      label = phrase("Requested", "request", quantity(selected.length, "scheduled task run"));
      break;
    case "thread-configuration":
      label = phrase("Checked", "check", `chat settings ${times}`);
      break;
    case "thread-configure":
      label = phrase("Set", "set", `chat model ${times}`);
      break;
    case "thread-fork":
      label = phrase("Requested", "request", quantity(selected.length, "copied chat"));
      break;
    case "thread-merge":
      label = phrase(
        "Requested",
        "request",
        quantity(selected.length, "merge of a copied chat", "merges of a copied chat"),
      );
      break;
    case "thread-search":
      label = phrase("Searched", "search", `chats ${times}`);
      break;
    case "thread-transfers":
      label = phrase("Checked", "check", `chat transfers ${times}`);
      break;
    case "thread-organize":
      label = phrase("Organized", "organize", `chats ${times}`);
      break;
    case "thread-update":
      label = phrase("Updated", "update", quantity(countEntities(threadIds), "chat"));
      break;
    case "queue-list":
      label = phrase("Listed", "list", `waiting messages ${times}`);
      break;
    case "queue-read":
      label = phrase(
        "Read",
        "read",
        quantity(countEntities(entityIds("queuedRunId")), "waiting message"),
      );
      break;
    case "queue-edit":
      label = phrase(
        "Edited",
        "edit",
        quantity(countEntities(entityIds("queuedRunId")), "waiting message"),
      );
      break;
    case "queue-cancel":
      label = phrase(
        "Requested cancellation of",
        "cancel",
        quantity(countEntities(entityIds("queuedRunId")), "waiting message"),
      );
      break;
    case "queue-reorder":
      label = phrase(
        "Reordered",
        "reorder",
        quantity(countEntities(entityIds("queuedRunId")), "waiting message"),
      );
      break;
    case "queue-steer":
      label = phrase(
        "Requested send now for",
        "send now for",
        quantity(countEntities(entityIds("queuedRunId")), "waiting message"),
      );
      break;
    case "question-list":
      label = phrase("Listed", "list", `questions ${times}`);
      break;
    case "question-read":
      label = phrase("Read", "read", quantity(countEntities(entityIds("requestId")), "question"));
      break;
    case "question-respond":
      label = phrase(
        "Answered",
        "answer",
        quantity(countEntities(entityIds("requestId")), "question"),
      );
      break;
    case "event-emit":
      label = phrase("Posted", "post", quantity(selected.length, "feed event"));
      break;
    case "secret-request":
      label = phrase("Asked for", "ask for", quantity(selected.length, "secret"));
      break;
    case "worktree-handoff":
      label = phrase(
        "Handed off to",
        "hand off to",
        quantity(countEntities(entityIds("worktreePath")), "separate copy", "separate copies"),
      );
      break;
    case "worktree-list":
      label = phrase("Listed", "list", `separate copies ${times}`);
      break;
    case "worktree-status":
      label = phrase("Checked", "check", `separate copy status ${times}`);
      break;
    case "project-list":
      label = phrase("Listed", "list", `projects ${times}`);
      break;
    case "project-read":
      label = phrase("Read", "read", quantity(countEntities(projectIds), "project"));
      break;
    case "project-create":
      label = phrase("Added", "add", quantity(countEntities(projectIds), "project"));
      break;
    case "project-update":
      label = phrase("Updated", "update", quantity(countEntities(projectIds), "project"));
      break;
    case "project-delete":
      label = phrase("Deleted", "delete", quantity(countEntities(projectIds), "project"));
      break;
    case "project-clone":
      label = phrase("Cloned", "clone", quantity(countEntities(entityIds("cwd")), "project"));
      break;
    case "memory-search":
      label = phrase("Looked up", "look up", `your memory ${times}`);
      break;
    case "usage-status":
      label = phrase("Checked", "check", `account usage ${times}`);
      break;
    case "hardware-status":
      label = phrase("Checked", "check", `computer health ${times}`);
      break;
    case "review-diff":
      label = phrase("Read", "read", `code changes ${times}`);
      break;
    case "perf-report":
      label = phrase("Read", "read", `run speed ${times}`);
      break;
    case "release-status":
      label = phrase("Checked", "check", `the release ${times}`);
      break;
    case "environment-read":
      label = phrase("Checked", "check", `computer settings ${times}`);
      break;
    case "environment-update":
      label = phrase("Updated", "update", `computer settings ${times}`);
      break;
    case "attachment-prepare":
      label = phrase(
        "Prepared",
        "prepare",
        quantity(countEntities(entityIds("attachmentId")), "attachment upload"),
      );
      break;
    case "attachment-discard":
      label = phrase(
        "Discarded",
        "discard",
        quantity(countEntities(entityIds("attachmentId")), "unsent attachment"),
      );
      break;
    case "attachment-send": {
      // A message can contain several attachments. Count retries by message identity.
      const messages = new Map<string, (typeof selected)[number]>();
      selected.forEach((call, index) =>
        messages.set(id(call.output?.messageId) ?? `call-${index}`, call),
      );
      const attachmentCount = [...messages.values()].reduce(
        (count, call) =>
          count + (Array.isArray(call.input?.attachments) ? call.input.attachments.length : 0),
        0,
      );
      const countsKnown = [...messages.values()].every(
        (call) => Array.isArray(call.input?.attachments) && call.input.attachments.length > 0,
      );
      const targets = threadIds.every((value) => value !== undefined)
        ? ` to ${quantity(new Set(threadIds).size, "chat")}`
        : "";
      label = phrase(
        "Sent",
        "send",
        countsKnown
          ? `${quantity(attachmentCount, "attachment")}${targets}`
          : `attachments${targets} ${times}`,
      );
      break;
    }
    case "link-pr":
      label = phrase("Linked", "link", quantity(selected.length, "pull request"));
      break;
    case "unlink-pr":
      label = phrase("Unlinked", "unlink", quantity(selected.length, "pull request"));
      break;
    case "watch-pr":
      label = phrase("Watching", "watch", quantity(selected.length, "pull request"));
      break;
    case "unwatch-pr":
      label = phrase(
        "Stopped watching",
        "stop watching",
        quantity(selected.length, "pull request"),
      );
      break;
    case "list-prs":
      label = phrase(
        "Checked",
        "check",
        `linked pull requests${selected.length === 1 ? "" : ` ${times}`}`,
      );
      break;
    case "browser":
      label = phrase("Used", "use", `browser ${times}`);
      break;
    case "device":
      label = phrase("Used", "use", `device controls ${times}`);
      break;
    case "html-preview":
      label = phrase("Previewed", "preview", quantity(selected.length, "HTML page"));
      break;
    case "html-render":
      label = phrase("Rendered", "render", quantity(selected.length, "HTML page"));
      break;
    case "capabilities":
      label = phrase("Checked", "check", `teamwork options ${times}`);
      break;
    case "model-benchmarks":
      label = phrase("Compared", "compare", `model scores ${times}`);
      break;
    case "board-task-list":
      label = phrase("Listed", "list", `board tasks ${times}`);
      break;
    case "board-task-get":
      label = phrase("Read", "read", quantity(countEntities(entityIds("taskId")), "board task"));
      break;
    case "board-task-update":
      label = phrase(
        "Updated",
        "update",
        quantity(countEntities(entityIds("taskId")), "board task"),
      );
      break;
    case "board-task-create":
      label = phrase("Created", "create", quantity(selected.length, "board task"));
      break;
    case "saved-item-list":
      label = phrase("Listed", "list", "saved messages and notes");
      break;
    case "saved-item-get":
      label = phrase("Read", "read", quantity(selected.length, "saved message"));
      break;
    case "saved-item-create":
      label = phrase("Saved", "save", quantity(selected.length, "message or note"));
      break;
    case "saved-item-update":
      label = phrase("Edited", "edit", quantity(selected.length, "saved message"));
      break;
    case "saved-item-transition":
      label = phrase("Updated", "update", "saved message status");
      break;
    case "saved-item-import":
      label = phrase("Imported", "import", quantity(selected.length, "saved message"));
      break;
    case "saved-item-launch":
      label = phrase("Started", "start", quantity(selected.length, "saved message"));
      break;
    case "saved-item-schedule":
      label = phrase("Scheduled", "schedule", quantity(selected.length, "saved message"));
      break;
    case "saved-item-task":
      label = phrase("Moved", "move", "saved messages to Tasks");
      break;
  }
  return { label, failedCount };
}
