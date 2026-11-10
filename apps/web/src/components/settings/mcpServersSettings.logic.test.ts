import { expect, it } from "vite-plus/test";
import type { UserMcpServerConfig } from "@t3tools/contracts";

import {
  EMPTY_MCP_SERVER_DRAFT,
  buildMcpServer,
  draftFromMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  upsertMcpServer,
} from "./mcpServersSettings.logic";

const reui: UserMcpServerConfig = {
  id: "reui",
  enabled: true,
  transport: "http",
  url: "https://mcp.reui.io",
};

it("builds an http server and trims the input", () => {
  const result = buildMcpServer(
    { ...EMPTY_MCP_SERVER_DRAFT, id: " reui ", url: " https://mcp.reui.io " },
    [],
    null,
  );
  expect(result).toEqual({ server: reui });
});

it("builds a stdio server with arguments and variable names", () => {
  const result = buildMcpServer(
    {
      ...EMPTY_MCP_SERVER_DRAFT,
      id: "boardui",
      transport: "stdio",
      command: "npx",
      args: "-y boardui@latest mcp",
      envVars: "A, B",
    },
    [],
    null,
  );
  expect(result).toEqual({
    server: {
      id: "boardui",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: ["-y", "boardui@latest", "mcp"],
      envVars: ["A", "B"],
    },
  });
});

it("rejects a duplicate name, a reserved name and a bad address", () => {
  const draft = { ...EMPTY_MCP_SERVER_DRAFT, id: "reui", url: "https://mcp.reui.io" };
  expect(buildMcpServer(draft, [reui], null)).toHaveProperty("error");
  expect(buildMcpServer({ ...draft, id: "leonidas" }, [], null)).toHaveProperty("error");
  expect(buildMcpServer({ ...draft, url: "mcp.reui.io" }, [], null)).toHaveProperty("error");
  expect(buildMcpServer(draft, [reui], "reui")).toHaveProperty("server");
});

it("keeps the on or off state when a server is edited", () => {
  const off = setMcpServerEnabled([reui], "reui", false);
  const edited = { ...reui, url: "https://mcp.reui.io/v2" };
  expect(upsertMcpServer(off, edited, "reui")).toEqual([{ ...edited, enabled: false }]);
});

it("adds, removes and round-trips a draft", () => {
  expect(upsertMcpServer([], reui, null)).toEqual([reui]);
  expect(removeMcpServer([reui], "reui")).toEqual([]);
  expect(draftFromMcpServer(reui)).toMatchObject({ id: "reui", transport: "http" });
});
