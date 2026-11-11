import { UserMcpServerConfig } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export interface McpServerDraft {
  readonly id: string;
  readonly transport: "http" | "stdio";
  readonly url: string;
  readonly bearerTokenEnvVar: string;
  readonly command: string;
  readonly args: string;
  readonly envVars: string;
}

export const EMPTY_MCP_SERVER_DRAFT: McpServerDraft = {
  id: "",
  transport: "http",
  url: "",
  bearerTokenEnvVar: "",
  command: "",
  args: "",
  envVars: "",
};

// shortcut: arguments split on whitespace, so a quoted argument with spaces is not
// supported, upgrade when a server needs one.
const words = (text: string): string[] => text.split(/[\s,]+/).filter(Boolean);

const decode = Schema.decodeUnknownSync(UserMcpServerConfig);

/** Validate a draft with the same schema the server uses. */
export function buildMcpServer(
  draft: McpServerDraft,
  existing: ReadonlyArray<UserMcpServerConfig>,
  editingId: string | null,
): { readonly server: UserMcpServerConfig } | { readonly error: string } {
  const id = draft.id.trim();
  if (id !== editingId && existing.some((server) => server.id === id)) {
    return { error: "A server with this name already exists." };
  }
  const candidate =
    draft.transport === "http"
      ? {
          id,
          enabled: true,
          transport: "http",
          url: draft.url.trim(),
          ...(draft.bearerTokenEnvVar.trim()
            ? { bearerTokenEnvVar: draft.bearerTokenEnvVar.trim() }
            : {}),
        }
      : {
          id,
          enabled: true,
          transport: "stdio",
          command: draft.command.trim(),
          args: draft.args.trim() ? draft.args.trim().split(/\s+/) : [],
          envVars: words(draft.envVars),
        };
  try {
    return { server: decode(candidate) };
  } catch {
    return {
      error:
        "Check the name (letters, numbers, - and _), the address or command, and the variable names.",
    };
  }
}

export function draftFromMcpServer(server: UserMcpServerConfig): McpServerDraft {
  return server.transport === "http"
    ? {
        ...EMPTY_MCP_SERVER_DRAFT,
        id: server.id,
        url: server.url,
        bearerTokenEnvVar: server.bearerTokenEnvVar ?? "",
      }
    : {
        ...EMPTY_MCP_SERVER_DRAFT,
        id: server.id,
        transport: "stdio",
        command: server.command,
        args: (server.args ?? []).join(" "),
        envVars: (server.envVars ?? []).join(", "),
      };
}

/** Add a new server, or replace the one being edited and keep its on or off state. */
export function upsertMcpServer(
  servers: ReadonlyArray<UserMcpServerConfig>,
  server: UserMcpServerConfig,
  editingId: string | null,
): ReadonlyArray<UserMcpServerConfig> {
  const current = servers.find((candidate) => candidate.id === editingId);
  if (!current) return [...servers, server];
  return servers.map((candidate) =>
    candidate.id === editingId ? { ...server, enabled: current.enabled } : candidate,
  );
}

export const removeMcpServer = (servers: ReadonlyArray<UserMcpServerConfig>, id: string) =>
  servers.filter((server) => server.id !== id);

export const setMcpServerEnabled = (
  servers: ReadonlyArray<UserMcpServerConfig>,
  id: string,
  enabled: boolean,
) => servers.map((server) => (server.id === id ? { ...server, enabled } : server));
