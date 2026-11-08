/** The name agents see for the app MCP server, and the prefix of every tool on it. */
export const MCP_SERVER_NAME = "leonidas";
export const MCP_TOOL_PREFIX = "leo_";

/** The names before the rename. Saved threads and saved permission rules may still use them. */
export const LEGACY_MCP_SERVER_NAMES = ["t3-code", "t3_code", "t3code"] as const;
/** Every tool name from before the rename. Only these are rewritten; other names pass through. */
export const LEGACY_MCP_TOOL_NAMES: ReadonlySet<string> = new Set([
  "board_task_create",
  "board_task_get",
  "board_task_list",
  "board_task_update",
  "canvas",
  "content_deal_propose",
  "content_read",
  "content_script_save",
  "content_stage_move",
  "content_video_create",
  "create_threads",
  "delegate_task",
  "delete_scheduled_task",
  "device_close",
  "device_list",
  "device_open",
  "device_screenshot",
  "event_emit",
  "focus_check",
  "focus_list",
  "html_preview",
  "html_render",
  "link_pull_request",
  "list_scheduled_tasks",
  "list_thread_pull_requests",
  "local_vm_input",
  "local_vm_list",
  "local_vm_screenshot",
  "marketing_approval_request",
  "marketing_brands",
  "marketing_draft_save",
  "marketing_metrics",
  "marketing_metrics_sync",
  "marketing_posts",
  "model_benchmarks",
  "orchestrator_capabilities",
  "preview_act",
  "preview_dialog",
  "preview_evaluate",
  "preview_navigate",
  "preview_open",
  "preview_recording_start",
  "preview_recording_stop",
  "preview_resize",
  "preview_set_appearance",
  "preview_snapshot",
  "preview_status",
  "preview_wait_for",
  "request_secret",
  "run_scheduled_task_now",
  "saved_item_create",
  "saved_item_get",
  "saved_item_import",
  "saved_item_launch",
  "saved_item_list",
  "saved_item_save_task",
  "saved_item_schedule",
  "saved_item_transition",
  "saved_item_update",
  "schedule_task",
  "t3_attachment_discard",
  "t3_attachment_prepare_upload",
  "t3_environment_preferences_update",
  "t3_environment_read",
  "t3_pending_request",
  "t3_preview_close",
  "t3_preview_list",
  "t3_project_clone",
  "t3_project_create",
  "t3_project_delete",
  "t3_project_list",
  "t3_project_read",
  "t3_project_update",
  "t3_queue",
  "t3_thread_configure",
  "t3_thread_interrupt",
  "t3_thread_launch",
  "t3_thread_list",
  "t3_thread_organize",
  "t3_thread_read",
  "t3_thread_search",
  "t3_thread_send",
  "t3_thread_send_attachments",
  "t3_thread_transfer",
  "t3_thread_update",
  "t3_thread_wait",
  "t3_workflow_stop",
  "t3_worktree_handoff",
  "t3_worktree_list",
  "t3_worktree_status",
  "task_cancel",
  "task_status",
  "unlink_pull_request",
  "unwatch_pull_request",
  "watch_pull_request",
]);

/** Any old or new spelling of a tool name becomes its current `leo_` name. */
export function toCurrentMcpToolName(name: string): string {
  if (name.startsWith(MCP_TOOL_PREFIX)) return name;
  return `${MCP_TOOL_PREFIX}${name.startsWith("t3_") ? name.slice(3) : name}`;
}

/**
 * Rewrites the tool name of every `tools/call` message in a JSON-RPC body to its current name.
 * Saved threads and rules still use the names from before the rename. Returns the same value
 * when nothing needs to change, so a caller can skip rebuilding the request.
 * Remove this after two releases (task: rename-the-t3-code-mcp-server-and-tools-to-leonidas-names).
 */
export function renameLegacyToolCalls(body: unknown): unknown {
  if (Array.isArray(body)) {
    const next = body.map(renameLegacyToolCalls);
    return next.some((item, i) => item !== body[i]) ? next : body;
  }
  if (typeof body !== "object" || body === null) return body;
  const message = body as { method?: unknown; params?: unknown };
  if (message.method !== "tools/call") return body;
  const params = message.params;
  if (typeof params !== "object" || params === null) return body;
  const name = (params as { name?: unknown }).name;
  if (typeof name !== "string") return body;
  if (!LEGACY_MCP_TOOL_NAMES.has(name)) return body;
  return { ...message, params: { ...params, name: toCurrentMcpToolName(name) } };
}

/**
 * Saved subagent tool lists and permission rules name tools as `mcp__t3-code__<tool>`.
 * This returns the same rule for the current server. Other rules pass through.
 */
export function toCurrentMcpToolRule(rule: string): string {
  const match = /^mcp__(?:t3-code|t3_code|t3code)__(?<tool>.+)$/i.exec(rule);
  const tool = match?.groups?.tool;
  if (tool === undefined) return rule;
  const current = LEGACY_MCP_TOOL_NAMES.has(tool) ? toCurrentMcpToolName(tool) : tool;
  return `mcp__${MCP_SERVER_NAME}__${current}`;
}
