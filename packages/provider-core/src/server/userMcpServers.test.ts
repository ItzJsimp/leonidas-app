import { expect, it } from "vite-plus/test";
import type { UserMcpServerConfig } from "@t3tools/contracts";

import { resolveUserMcpServers } from "./mcpSession.ts";

const configs: ReadonlyArray<UserMcpServerConfig> = [
  {
    id: "reui",
    enabled: true,
    transport: "http",
    url: "https://mcp.reui.io",
    bearerTokenEnvVar: "REUI_MCP_TOKEN",
  },
  { id: "off", enabled: false, transport: "http", url: "https://example.com" },
  {
    id: "local",
    enabled: true,
    transport: "stdio",
    command: "npx",
    args: ["-y", "x"],
    envVars: ["SET_ME", "MISSING"],
  },
];

it("keeps enabled servers and reads secrets from the environment", () => {
  const resolved = resolveUserMcpServers(configs, { REUI_MCP_TOKEN: "tok", SET_ME: "1" });
  expect(resolved).toEqual([
    {
      transport: "http",
      name: "reui",
      url: "https://mcp.reui.io",
      headers: { Authorization: "Bearer tok" },
    },
    { transport: "stdio", name: "local", command: "npx", args: ["-y", "x"], env: { SET_ME: "1" } },
  ]);
});

it("sends no header when the token variable is unset", () => {
  const [reui] = resolveUserMcpServers(configs, {});
  expect(reui).toMatchObject({ name: "reui", headers: {} });
});
