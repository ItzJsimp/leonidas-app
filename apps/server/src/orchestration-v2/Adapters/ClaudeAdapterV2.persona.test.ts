import { type ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import * as ClaudeAdapterV2 from "./ClaudeAdapterV2.ts";

const selection = {
  instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
  model: "claude-haiku-5-5",
} satisfies ModelSelection;

const appServer = { leonidas: { type: "http", url: "http://127.0.0.1/mcp" } } as const;

describe("ClaudeAdapterV2 persona start (ADR-0082)", () => {
  it("replaces the preset prompt and loads no setting sources", () => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: selection,
      nativeThreadId: "persona-thread",
      resume: false,
      cwd: "/workspace",
      persona: { systemPrompt: "You design front-end UI." },
    });
    assert.equal(options.systemPrompt, "You design front-end UI.");
    assert.deepEqual(options.settingSources, []);
  });

  it("keeps the preset prompt and default setting sources without a persona", () => {
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: selection,
      nativeThreadId: "plain-thread",
      resume: false,
      cwd: "/workspace",
    });
    assert.include(options.systemPrompt as object, { type: "preset" });
    assert.isUndefined(options.settingSources);
  });

  it("drops the app MCP server when the persona lists none of its tools", () => {
    const shape = ClaudeAdapterV2.claudePersonaToolShape({
      persona: { tools: ["Read", "Grep"] },
      policyTools: undefined,
      mcpServers: appServer,
    });
    assert.deepEqual(shape, { tools: ["Read", "Grep"] });
  });

  it("keeps the app MCP server and allows only the listed MCP tools", () => {
    const shape = ClaudeAdapterV2.claudePersonaToolShape({
      persona: { tools: ["Read", "Edit", "mcp__leonidas__leo_preview_open"] },
      policyTools: undefined,
      mcpServers: appServer,
    });
    assert.deepEqual(shape.tools, ["Read", "Edit"]);
    assert.deepEqual(shape.allowedTools, ["mcp__leonidas__leo_preview_open"]);
    assert.equal(shape.mcpServers, appServer);
    // Every other app tool is hidden so its definition does not load into the child.
    assert.notInclude(shape.disallowedTools ?? [], "mcp__leonidas__leo_preview_open");
    assert.include(shape.disallowedTools ?? [], "mcp__leonidas__leo_delegate_task");
    assert.include(shape.disallowedTools ?? [], "mcp__leonidas__leo_preview_act");
  });

  it("narrows persona tools to a read-only policy", () => {
    const shape = ClaudeAdapterV2.claudePersonaToolShape({
      persona: { tools: ["Read", "Edit", "Grep"] },
      policyTools: ClaudeAdapterV2.CLAUDE_READ_ONLY_ALLOWED_TOOLS,
      mcpServers: undefined,
    });
    assert.deepEqual(shape.tools, ["Read", "Grep"]);
  });
});
