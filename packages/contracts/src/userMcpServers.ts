/**
 * User MCP servers - one list, stored once, injected into every provider.
 *
 * Secrets never live here: the settings reach the web client. A server that
 * needs a token names an environment variable, and the server process reads it.
 *
 * @module UserMcpServers
 */
import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const RESERVED_IDS = new Set(["t3-code", "leonidas"]);

export const UserMcpServerId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  Schema.makeFilter((id) => !RESERVED_IDS.has(id) || "This server id is reserved."),
);

const EnvVarName = TrimmedNonEmptyString.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/));

export const UserMcpStdioServer = Schema.Struct({
  id: UserMcpServerId,
  enabled: Schema.Boolean,
  transport: Schema.Literal("stdio"),
  command: TrimmedNonEmptyString,
  args: Schema.optional(Schema.Array(Schema.String)),
  /** Names of server-process environment variables to pass to the child. */
  envVars: Schema.optional(Schema.Array(EnvVarName)),
});

export const UserMcpHttpServer = Schema.Struct({
  id: UserMcpServerId,
  enabled: Schema.Boolean,
  transport: Schema.Literal("http"),
  url: TrimmedNonEmptyString.check(Schema.isPattern(/^https?:\/\/\S+$/)),
  /** Name of the environment variable that holds the bearer token. */
  bearerTokenEnvVar: Schema.optional(EnvVarName),
});

export const UserMcpServerConfig = Schema.Union([UserMcpStdioServer, UserMcpHttpServer]);
export type UserMcpServerConfig = typeof UserMcpServerConfig.Type;

export const UserMcpServerConfigs = Schema.Array(UserMcpServerConfig).check(
  Schema.makeFilter(
    (servers) =>
      new Set(servers.map((server) => server.id)).size === servers.length ||
      "MCP server ids must be unique.",
  ),
);
export type UserMcpServerConfigs = typeof UserMcpServerConfigs.Type;
