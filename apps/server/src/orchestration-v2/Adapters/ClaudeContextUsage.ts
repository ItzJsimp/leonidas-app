interface ClaudeCacheCreation {
  readonly ephemeral_1h_input_tokens: number;
  readonly ephemeral_5m_input_tokens: number;
}

// Claude Code writes 1h cache entries on a subscription within its limits and
// 5m entries otherwise (API key, Bedrock, Vertex, extra usage). A response
// that wrote nothing leaves the TTL unknown.
function claudePromptCacheTtlMs(
  cacheCreation: ClaudeCacheCreation | null | undefined,
): number | undefined {
  if (!cacheCreation) return undefined;
  if (cacheCreation.ephemeral_5m_input_tokens > 0) return 5 * 60_000;
  if (cacheCreation.ephemeral_1h_input_tokens > 0) return 60 * 60_000;
  return undefined;
}

export function claudeProviderTurnTokenUsage(
  usage: {
    readonly input_tokens: number;
    readonly cache_creation_input_tokens?: number | null;
    readonly cache_read_input_tokens?: number | null;
    readonly cache_creation?: ClaudeCacheCreation | null;
    readonly output_tokens: number;
  },
  updatedAt: string,
  reportedContextWindow?: number,
) {
  const inputTokens =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const outputTokens = usage.output_tokens;
  const promptCacheTtlMs = claudePromptCacheTtlMs(usage.cache_creation);
  return {
    usedTokens: inputTokens + outputTokens,
    maxTokens:
      reportedContextWindow !== undefined &&
      Number.isFinite(reportedContextWindow) &&
      reportedContextWindow > 0
        ? reportedContextWindow
        : null,
    inputTokens,
    ...(usage.cache_read_input_tokens == null
      ? {}
      : { cachedInputTokens: usage.cache_read_input_tokens }),
    outputTokens,
    reasoningOutputTokens: 0,
    ...(promptCacheTtlMs === undefined ? {} : { promptCacheTtlMs }),
    // Each model call refreshes the cache, so the latest call starts the clock, not the turn.
    promptCacheAnchorAt: updatedAt,
    updatedAt,
  };
}
