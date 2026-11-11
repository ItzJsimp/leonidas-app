import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ServerSettings } from "./settings.ts";

const decode = Schema.decodeSync(ServerSettings);
const http = { id: "reui", enabled: true, transport: "http", url: "https://mcp.reui.io" } as const;
const stdio = {
  id: "boardui",
  enabled: true,
  transport: "stdio",
  command: "npx",
  args: ["-y", "boardui@latest", "mcp"],
} as const;

it("defaults to no user MCP servers", () => {
  expect(decode({}).mcpServers).toEqual([]);
});

it("accepts http and stdio servers", () => {
  expect(decode({ mcpServers: [http, stdio] }).mcpServers).toEqual([http, stdio]);
});

it("rejects duplicate ids, reserved ids and bad urls or env names", () => {
  expect(() => decode({ mcpServers: [http, http] })).toThrow();
  expect(() => decode({ mcpServers: [{ ...http, id: "leonidas" }] })).toThrow();
  expect(() => decode({ mcpServers: [{ ...http, url: "ftp://x" }] })).toThrow();
  expect(() => decode({ mcpServers: [{ ...http, bearerTokenEnvVar: "bad name" }] })).toThrow();
});
