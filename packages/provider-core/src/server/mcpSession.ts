import type {
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  UserMcpServerConfig,
} from "@t3tools/contracts";

/** A user MCP server with its secrets read from the server environment. */
export type ResolvedUserMcpServer =
  | {
      readonly transport: "stdio";
      readonly name: string;
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly env: Readonly<Record<string, string>>;
    }
  | {
      readonly transport: "http";
      readonly name: string;
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    };

/**
 * Enabled servers only. An env var that is not set is left out, so a missing
 * token shows up as the provider's own auth error and never as a stored secret.
 */
export function resolveUserMcpServers(
  configs: ReadonlyArray<UserMcpServerConfig>,
  env: NodeJS.ProcessEnv,
): ReadonlyArray<ResolvedUserMcpServer> {
  return configs.flatMap((config): ReadonlyArray<ResolvedUserMcpServer> => {
    if (!config.enabled) return [];
    if (config.transport === "http") {
      const token = config.bearerTokenEnvVar ? env[config.bearerTokenEnvVar] : undefined;
      return [
        {
          transport: "http",
          name: config.id,
          url: config.url,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      ];
    }
    const childEnv: Record<string, string> = {};
    for (const key of config.envVars ?? []) {
      const value = env[key];
      if (value !== undefined) childEnv[key] = value;
    }
    return [
      {
        transport: "stdio",
        name: config.id,
        command: config.command,
        args: config.args ?? [],
        env: childEnv,
      },
    ];
  });
}

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /**
   * Adapters read it to keep developer instructions truthful: when the user
   * withholds agent browser access, the prompt must not advertise `preview_*`
   * tools that every call would reject.
   */
  readonly browserToolsAvailable: boolean;
  readonly capabilities?: ReadonlySet<string>;
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
  /** The user's shared MCP server list (Settings), for every adapter to attach. */
  readonly userMcpServers?: ReadonlyArray<ResolvedUserMcpServer>;
}

export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}
