import { expect, it } from "vite-plus/test";
import type { ResolvedUserMcpServer } from "@t3tools/provider-core/server/mcpSession";
import { acpUserMcpServers } from "@t3tools/provider-acp/server/adapter";

import { claudeUserMcpServers } from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { codexUserMcpServers } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";

const servers: ReadonlyArray<ResolvedUserMcpServer> = [
  {
    transport: "http",
    name: "reui",
    url: "https://mcp.reui.io",
    headers: { Authorization: "Bearer t" },
  },
  { transport: "stdio", name: "local", command: "npx", args: ["-y", "x"], env: { A: "1" } },
];

it("gives Claude, Codex and ACP the same server names", () => {
  const names = servers.map((server) => server.name).toSorted();
  expect(Object.keys(claudeUserMcpServers(servers)).toSorted()).toEqual(names);
  expect(Object.keys(codexUserMcpServers(servers)).toSorted()).toEqual(names);
  expect(
    acpUserMcpServers(servers)
      .map((server) => server.name)
      .toSorted(),
  ).toEqual(names);
});

it("maps each transport to the provider shape", () => {
  expect(claudeUserMcpServers(servers).reui).toEqual({
    type: "http",
    url: "https://mcp.reui.io",
    headers: { Authorization: "Bearer t" },
  });
  expect(codexUserMcpServers(servers).reui).toEqual({
    url: "https://mcp.reui.io",
    http_headers: { Authorization: "Bearer t" },
  });
  expect(acpUserMcpServers(servers)[1]).toEqual({
    name: "local",
    command: "npx",
    args: ["-y", "x"],
    env: [{ name: "A", value: "1" }],
  });
});

it("returns nothing when no servers are set", () => {
  expect(claudeUserMcpServers(undefined)).toEqual({});
  expect(codexUserMcpServers(undefined)).toEqual({});
  expect(acpUserMcpServers(undefined)).toEqual([]);
});
