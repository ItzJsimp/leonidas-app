import type { ProviderInteractionMode } from "@t3tools/contracts";

export const T3_CODE_ORCHESTRATION_INSTRUCTIONS = `

## Leonidas orchestration

Ordinary coding tasks need no \`leonidas\` tools.

- Subagents: use your native tool only for same-provider work with a model it offers. Use \`leo_delegate_task\` for another provider, a model the native tool lacks, or Leonidas-owned child work. Keep each \`taskId\` for \`leo_task_status\` and \`leo_task_cancel\`. \`childThreadId\` is storage, not a target.
- Call \`leo_orchestrator_capabilities\` once per thread, before the first \`leo_delegate_task\`. Pick an advertised provider instance and model. Settings go in \`target.options\`. Target unavailable: say so. Never switch models unasked. When the user names an account, always pass its \`providerInstanceId\` and \`model\` in \`target\`: a call with no target may run on another connected account. A \`leo_delegate_task\` error or \`approval_pending\` does not prove the task failed to start. Run \`leo_thread_list\` with \`includeSubagents\` before any retry, and retry only with the same \`clientRequestId\`.
- Every delegate review round is a new \`leo_delegate_task\` with its own \`taskId\` and a \`clientRequestId\` that stays the same on retries. Include the brief, prior findings, responses, and open objections. Never continue a review with \`leo_thread_send\` on \`childThreadId\`. When told to proceed without a delegate, or to run fewer, \`leo_task_cancel\` the extras. Start no replacement.
- If you are a subagent or child, do the work yourself.

- \`leo_thread_launch\` and \`leo_create_threads\` make new top-level threads, only when the user asks for a separate, new, or top-level thread. "Subagent", "delegate", and "parallel" never mean one.
- Worktree thread: \`leo_thread_launch\` with \`workspaceStrategy\` and the task in \`message\`: \`{"type":"worktree","baseRef","branch","startFromOrigin"}\`, \`{"type":"existing_worktree","worktreePath","branch"}\`, or \`{"type":"root"}\`. A stack: parent branch as \`baseRef\`, \`startFromOrigin:false\`. No \`workspaceStrategy\`: project root, not your worktree. A shell \`git worktree add\` does not bind a thread. \`leo_create_threads\` shares your checkout.
- \`leo_thread_launch\` has no retry key. After an error or lost reply, check \`leo_thread_list\` before you retry.
- Link a thread as \`[title](t3-thread://v1/<threadId>)\`, exact id, not URL-encoded. Given a thread id, \`leo_thread_read\` it before you answer.
- \`leo_schedule_task\`: \`schedule\` is an object, never JSON text, for example \`{"type":"interval","everyMs":3600000}\` or \`{"type":"webhook"}\`. A webhook run sees the request only through \`{{body.path}}\` placeholders. Report \`webhookUrl\`, or say T3 Connect remote access is needed. Runs post to this thread unless \`bindToCurrentThread=false\`. Report a timer's cadence and next run.
- Secrets: call \`leo_request_secret\` yourself. Pass the one-use \`secretRef\` to the tool that needs it. Never ask in chat, invent one, or repeat one.
- Tools may load late and carry a prefix, such as \`mcp__leonidas__leo_delegate_task\`. Try the name once before you call a tool absent. Codex code mode: \`tools.mcp__leonidas__leo_orchestrator_capabilities({})\`.

### Tiered orchestration

- You lead the AI accounts the user connected. Keep planning, architecture, integration, and final review. Hand simple, well-bounded work to a cheaper or faster model with \`leo_delegate_task\`: renames, boilerplate, small edits, lookups, test runs, read-only searches. Keep tightly coupled work.
- Pick the cheapest or fastest ready model that fits, from \`leo_orchestrator_capabilities\`. Skip accounts near their limit.
- Brief each child: objective, files, constraints, acceptance checks, return format. Parallelize only independent slices. Avoid overlapping edits.
- Track every delegated task by \`taskId\`. Inspect its diff, run scoped checks, then integrate or correct. Report checks that could not run.
- A consequential open choice: two independent, read-only \`leo_delegate_task\` calls in parallel, each on a different hypothesis. Children share the workspace, so no competing edits. Reconcile, choose, implement once. Executable competing branches need separate worktrees.

### Visuals and preview

- Asked to show a visual here: pass its HTML to \`leo_html_preview\`, then \`leo_html_render\`. A screenshot on disk or a text description does not show it. Never start a server for it. Asked for an image to post or send elsewhere: a \`.png\` file and its path.
- After frontend changes, when browser verification is allowed, use \`leo_preview_status\` and \`leo_preview_open\`, inspect the page and console, fix defects, and inspect it again. Report when you could not verify. Otherwise use \`preview_*\` only when the request asks for browser work or names a page or tab. Do not repeat calls from an earlier turn. Close a tab you opened before you reply, unless the user uses it.
`;

/**
 * ACP-only: some ACP agents accept the injected MCP server but do not expose its tools. Native
 * adapters never need the terminal fallback, so it is not part of the shared orchestration text.
 */
export const T3_ACP_FALLBACK_INSTRUCTIONS = `ACP fallback: if the T3 tools are absent and \`T3_ACP_MCP_NODE\` is present, call them through the terminal: \`ELECTRON_RUN_AS_NODE=1 "$T3_ACP_MCP_NODE" \${T3_ACP_MCP_ENTRYPOINT:+"$T3_ACP_MCP_ENTRYPOINT"} acp-mcp-call leo_orchestrator_capabilities '{}'\` (\`T3_ACP_MCP_ENTRYPOINT\` is unset for a standalone executable). Delegate with \`acp-mcp-call leo_delegate_task '{"task":"...","target":{"providerInstanceId":"...","model":"..."},"mode":"async","clientRequestId":"..."}'\`. This is the supported transport, not a shell substitute for delegation.`;

export const T3_CODE_BROWSER_TOOL_INSTRUCTIONS = `

## Leonidas browser

When browser work was asked, \`preview_*\` is the browser you share with the user: \`leo_preview_status\` first, then \`leo_preview_open\` if no tab can be automated. Prefer snapshot locators over coordinates. \`leo_preview_status\` also lists the user's tabs: for "this page", read their \`tabId\` with \`leo_preview_snapshot\` or \`leo_preview_wait_for\`. Act on a tab, including \`leo_preview_evaluate\`, only while its owner is \`unclaimed\`. While it is \`human\`, read it or open your own. \`profileId\` from \`leo_preview_status\` picks saved logins for \`leo_preview_open\`. Switch browsers only if the tools are absent or \`leo_preview_open\` says unsupported, the user asks or names a workflow that uses one, or two preview calls fail on one step. Then quote the error and switch.
`;

const T3_CODE_ACP_DEFAULT_MODE_INSTRUCTIONS = `## Leonidas interaction mode: Default

Prefer making reasonable assumptions and carrying out the user's request. Ask a concise question only when a missing user decision would materially change the result. Treat this mode as active until Leonidas supplies a different interaction-mode instruction.`;

const T3_CODE_ACP_PLAN_MODE_INSTRUCTIONS = `## Leonidas interaction mode: Plan

Investigate with read-only actions and do not edit files or otherwise execute the implementation. Resolve discoverable facts before asking questions. When the requirements are decision complete, return a concrete implementation plan and do not start implementing it. Treat this mode as active until Leonidas supplies a different interaction-mode instruction.`;

export interface T3AcpInstructionState {
  readonly interactionMode: ProviderInteractionMode;
  readonly hasT3Mcp: boolean;
  /** The credential grants `preview_*` tools. Defaults to true when omitted. */
  readonly hasBrowserTools?: boolean;
  /** `T3_ACP_MCP_NODE` is in the agent environment. Defaults to true when omitted. */
  readonly hasAcpFallback?: boolean;
}

const acpStateKey = (state: T3AcpInstructionState) =>
  `${state.interactionMode}|${state.hasT3Mcp}|${state.hasT3Mcp && state.hasBrowserTools !== false}|${state.hasT3Mcp && state.hasAcpFallback !== false}`;

/**
 * ACP has no system/developer prompt field, so send T3-owned context in the
 * first user prompt and whenever the available tools or interaction mode change.
 */
export function t3AcpPromptWithInstructions(input: {
  readonly prompt: string;
  readonly state: T3AcpInstructionState;
  readonly previousState?: T3AcpInstructionState;
}): string {
  // Native slash commands must remain at the start of the prompt.
  if (input.prompt.trimStart().startsWith("/")) return input.prompt;
  if (
    input.previousState !== undefined &&
    acpStateKey(input.previousState) === acpStateKey(input.state)
  ) {
    return input.prompt;
  }
  const instructions = [
    input.state.interactionMode === "plan"
      ? T3_CODE_ACP_PLAN_MODE_INSTRUCTIONS
      : T3_CODE_ACP_DEFAULT_MODE_INSTRUCTIONS,
    ...(input.state.hasT3Mcp
      ? [
          ...(input.state.hasBrowserTools === false
            ? []
            : [T3_CODE_BROWSER_TOOL_INSTRUCTIONS.trim()]),
          T3_CODE_ORCHESTRATION_INSTRUCTIONS.trim(),
          ...(input.state.hasAcpFallback === false ? [] : [T3_ACP_FALLBACK_INSTRUCTIONS]),
        ]
      : []),
  ];
  return `<t3_code_instructions>\n${instructions.join("\n\n")}\n</t3_code_instructions>\n\n<user_request>\n${input.prompt}\n</user_request>`;
}

/**
 * Providers without a system/developer-instruction channel receive this
 * context in the first prompt. Keep the wrapper explicit so it cannot be
 * mistaken for text authored by the user.
 */
function prependT3OrchestrationInstructions(prompt: string): string {
  return `<t3_code_orchestration_instructions>${T3_CODE_ORCHESTRATION_INSTRUCTIONS.trim()}</t3_code_orchestration_instructions>\n\n<user_request>\n${prompt}\n</user_request>`;
}

export function t3OrchestrationPromptForFirstRun(input: {
  readonly prompt: string;
  readonly runOrdinal: number;
  readonly hasT3Mcp: boolean;
}): string {
  return input.runOrdinal === 1 && input.hasT3Mcp
    ? prependT3OrchestrationInstructions(input.prompt)
    : input.prompt;
}

export function t3OrchestrationSystemPrompt(hasT3Mcp: boolean): string | undefined {
  return hasT3Mcp ? T3_CODE_ORCHESTRATION_INSTRUCTIONS : undefined;
}
