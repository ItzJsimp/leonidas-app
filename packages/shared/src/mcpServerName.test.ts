import { describe, expect, it } from "vite-plus/test";

import {
  renameLegacyToolCalls,
  toCurrentMcpToolName,
  toCurrentMcpToolRule,
} from "./mcpServerName.ts";

describe("toCurrentMcpToolName", () => {
  it("maps old t3_ names and bare names to leo_ names", () => {
    expect(toCurrentMcpToolName("t3_thread_list")).toBe("leo_thread_list");
    expect(toCurrentMcpToolName("board_task_list")).toBe("leo_board_task_list");
    expect(toCurrentMcpToolName("leo_thread_list")).toBe("leo_thread_list");
  });
});

describe("renameLegacyToolCalls", () => {
  const call = (name: string) => ({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name },
  });

  it("renames a legacy tool call and keeps the other fields", () => {
    const body = {
      ...call("t3_thread_list"),
      params: { name: "t3_thread_list", arguments: { a: 1 } },
    };
    expect(renameLegacyToolCalls(body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "leo_thread_list", arguments: { a: 1 } },
    });
  });

  it("renames each call in a batch", () => {
    const out = renameLegacyToolCalls([call("preview_open"), call("leo_preview_open")]) as Array<{
      params: { name: string };
    }>;
    expect(out.map((m) => m.params.name)).toEqual(["leo_preview_open", "leo_preview_open"]);
  });

  it("leaves names that were never Leonidas tools alone", () => {
    const probe = call("probe");
    expect(renameLegacyToolCalls(probe)).toBe(probe);
  });

  it("returns the same object when nothing changes", () => {
    const current = call("leo_thread_list");
    expect(renameLegacyToolCalls(current)).toBe(current);
    const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
    expect(renameLegacyToolCalls(list)).toBe(list);
    expect(renameLegacyToolCalls("text")).toBe("text");
    expect(renameLegacyToolCalls({ method: "tools/call", params: null })).toEqual({
      method: "tools/call",
      params: null,
    });
  });
});

describe("toCurrentMcpToolRule", () => {
  it("moves saved rules to the current server and tool names", () => {
    expect(toCurrentMcpToolRule("mcp__t3-code__preview_open")).toBe(
      "mcp__leonidas__leo_preview_open",
    );
    expect(toCurrentMcpToolRule("mcp__t3-code__t3_thread_list")).toBe(
      "mcp__leonidas__leo_thread_list",
    );
    expect(toCurrentMcpToolRule("mcp__t3-code__*")).toBe("mcp__leonidas__*");
  });

  it("leaves other rules alone", () => {
    expect(toCurrentMcpToolRule("Read")).toBe("Read");
    expect(toCurrentMcpToolRule("mcp__github__create_issue")).toBe("mcp__github__create_issue");
    expect(toCurrentMcpToolRule("mcp__leonidas__leo_preview_open")).toBe(
      "mcp__leonidas__leo_preview_open",
    );
  });
});
