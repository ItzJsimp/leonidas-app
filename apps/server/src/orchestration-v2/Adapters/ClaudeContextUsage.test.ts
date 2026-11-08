import { describe, it, assert } from "@effect/vitest";
import { claudeProviderTurnTokenUsage } from "./ClaudeContextUsage.ts";

describe("ClaudeAdapterV2 context usage", () => {
  it("projects assistant usage against the reported context window", () => {
    const usage = claudeProviderTurnTokenUsage(
      {
        input_tokens: 42_000,
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 5_000,
        output_tokens: 1_000,
      },
      "2026-08-29T00:00:00.000Z",
      200_000,
    );

    assert.deepEqual(usage, {
      usedTokens: 50_000,
      maxTokens: 200_000,
      inputTokens: 49_000,
      cachedInputTokens: 5_000,
      outputTokens: 1_000,
      reasoningOutputTokens: 0,
      promptCacheAnchorAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    });
  });

  it("leaves context size unknown without a report", () => {
    assert.strictEqual(
      claudeProviderTurnTokenUsage(
        { input_tokens: 50_000, output_tokens: 0 },
        "2026-08-29T00:00:00.000Z",
      ).maxTokens,
      null,
    );
  });

  it("reports the prompt cache TTL the response wrote", () => {
    const ttlFor = (cache_creation: {
      ephemeral_1h_input_tokens: number;
      ephemeral_5m_input_tokens: number;
    }) =>
      claudeProviderTurnTokenUsage(
        { input_tokens: 1, output_tokens: 1, cache_creation },
        "2026-08-29T00:00:00.000Z",
      ).promptCacheTtlMs;

    assert.strictEqual(
      ttlFor({ ephemeral_1h_input_tokens: 2_000, ephemeral_5m_input_tokens: 300 }),
      5 * 60_000,
    );
    assert.strictEqual(
      ttlFor({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 300 }),
      5 * 60_000,
    );
    assert.strictEqual(
      ttlFor({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }),
      undefined,
    );
  });
});

it("keeps absent cache telemetry unknown and uses the shortest mixed TTL", () => {
  assert.strictEqual(
    claudeProviderTurnTokenUsage({ input_tokens: 12, output_tokens: 1 }, "2026-10-16T12:00:00Z")
      .cachedInputTokens,
    undefined,
  );
  assert.strictEqual(
    claudeProviderTurnTokenUsage(
      {
        input_tokens: 12,
        output_tokens: 1,
        cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 50 },
      },
      "2026-10-16T12:00:00Z",
    ).promptCacheTtlMs,
    300_000,
  );
});
