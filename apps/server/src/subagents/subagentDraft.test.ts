import { ProviderInstanceId, SubagentEditError, TextGenerationError } from "@t3tools/contracts";
import type { AgentDraftInput } from "@t3tools/provider-core/server/agentDraft";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import {
  assembleDraft,
  type DraftDeps,
  type DraftProvider,
  makeDraft,
  pickDraftInstance,
  readDraftParts,
} from "./subagentDraft.ts";
import { parseSubagentSpec } from "./subagentPersona.ts";

const parts = {
  description: "Finds files for a task.",
  instructions: "You are test-scout.\n\nReport the paths you find.",
  tools: ["Read", "Grep"],
  never: ["Commit or push."],
};

describe("assembleDraft", () => {
  it("writes a file that resolves under format v1", () => {
    const text = assembleDraft({
      name: "test-scout",
      avatar: "felt/researcher",
      model: "claude-haiku-5-5",
      parts,
    });
    const spec = parseSubagentSpec(text, "test-scout");
    expect(spec.name).toBe("test-scout");
    expect(spec.description).toBe("Finds files for a task.");
    expect(spec.model).toBe("claude-haiku-5-5");
    expect(spec.avatar).toBe("felt/researcher");
    expect(spec.tools).toEqual(["Read", "Grep"]);
    expect(spec.never).toEqual(["Commit or push."]);
    expect(spec.enabled).toBe(true);
    expect(spec.body).toBe("You are test-scout.\n\nReport the paths you find.");
  });

  it("leaves the avatar line out when there is none", () => {
    const text = assembleDraft({ name: "test-scout", model: "claude-haiku-5-5", parts });
    expect(text).not.toContain("avatar:");
  });

  it("keeps a description with a colon or quote readable and valid", () => {
    const text = assembleDraft({
      name: "test-scout",
      model: "claude-haiku-5-5",
      parts: { ...parts, description: 'Reads "docs": all of them.' },
    });
    expect(parseSubagentSpec(text, "test-scout").description).toBe('Reads "docs": all of them.');
  });
});

describe("readDraftParts", () => {
  it("reads back what assembleDraft wrote", () => {
    const text = assembleDraft({ name: "test-scout", model: "claude-haiku-5-5", parts });
    expect(readDraftParts(text, "test-scout")).toEqual({
      description: parts.description,
      instructions: parts.instructions,
      tools: parts.tools,
    });
  });

  it("returns undefined for text that is not an agent file", () => {
    expect(readDraftParts("just words", "test-scout")).toBeUndefined();
  });
});

const claude = ProviderInstanceId.make("claude");
const codex = ProviderInstanceId.make("codex");
const provider = (
  instanceId: typeof claude,
  slugs: string[],
  patch: Partial<DraftProvider> = {},
): DraftProvider => ({
  instanceId,
  models: slugs.map((slug) => ({ slug })),
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "authenticated" },
  ...patch,
});

describe("pickDraftInstance", () => {
  it("prefers the chat model's account, skips accounts that cannot run, and returns undefined when none offers the model", () => {
    const providers = [
      provider(codex, ["claude-haiku-5-5"]),
      provider(claude, ["claude-haiku-5-5"]),
    ];
    expect(pickDraftInstance(providers, "claude-haiku-5-5", claude)).toBe(claude);
    expect(
      pickDraftInstance(
        [provider(claude, ["claude-haiku-5-5"], { enabled: false }), providers[0]!],
        "claude-haiku-5-5",
        claude,
      ),
    ).toBe(codex);
    expect(pickDraftInstance(providers, "gpt-9", claude)).toBeUndefined();
  });
});

function setup(patch: Partial<DraftDeps> = {}, spend = 0) {
  const calls: AgentDraftInput[] = [];
  const deps: DraftDeps = {
    cwd: "C:/server",
    providers: Effect.succeed([provider(claude, ["claude-haiku-5-5", "claude-opus-5-5"])]),
    preferredInstanceId: Effect.succeed(claude),
    appFreeModels: Effect.succeed(["claude-haiku-5-5"]),
    dailyCapUsd: Effect.succeed(2),
    aiosTiers: Effect.succeed(null),
    spendToday: () => Effect.succeed(spend),
    rate: () =>
      Effect.succeed({
        inputCostPerToken: 0.000001,
        outputCostPerToken: 0.000005,
        cacheReadCostPerToken: 0,
        cacheCreationCostPerToken: 0,
      }),
    generate: (input) => {
      calls.push(input);
      return Effect.succeed(parts);
    },
    ...patch,
  };
  return { calls, draft: makeDraft(deps) };
}

const input = {
  name: "test-scout",
  avatar: "felt/researcher",
  model: "claude-haiku-5-5",
  request: "Finds files for a task.",
};

describe("makeDraft", () => {
  it.effect("drafts at once for a free-tier model and writes nothing", () =>
    Effect.gen(function* () {
      const { calls, draft } = setup();
      const result = yield* draft(input);
      expect(result.kind).toBe("draft");
      if (result.kind !== "draft") return;
      expect(parseSubagentSpec(result.contents, "test-scout").tools).toEqual(["Read", "Grep"]);
      expect(result.model).toBe("claude-haiku-5-5");
      expect(result.roughCost).toMatch(/\$|cent/);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.modelSelection).toEqual({ instanceId: claude, model: "claude-haiku-5-5" });
      expect(calls[0]?.cwd).toBe("C:/server");
    }),
  );

  it.effect("asks for a confirm on a frontier model and runs nothing until it is given", () =>
    Effect.gen(function* () {
      const { calls, draft } = setup();
      const first = yield* draft({ ...input, model: "claude-opus-5-5" });
      expect(first.kind).toBe("needs_confirm");
      expect(calls).toHaveLength(0);
      const second = yield* draft({ ...input, model: "claude-opus-5-5", confirmed: true });
      expect(second.kind).toBe("draft");
      expect(calls).toHaveLength(1);
    }),
  );

  it.effect("refuses when today's spend used the daily cap, with the reason", () =>
    Effect.gen(function* () {
      const { calls, draft } = setup({}, 2.5);
      const exit = yield* Effect.exit(draft(input));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(JSON.stringify(exit)).toContain("daily subagent cap");
      expect(calls).toHaveLength(0);
    }),
  );

  it.effect("warns when spend is at 80 percent of the cap", () =>
    Effect.gen(function* () {
      const { draft } = setup({}, 1.7);
      const result = yield* draft(input);
      expect(result.kind === "draft" && result.capWarning).toBe(true);
    }),
  );

  it.effect("fails when no connected account offers the model", () =>
    Effect.gen(function* () {
      const { calls, draft } = setup();
      const exit = yield* Effect.exit(draft({ ...input, model: "gpt-9" }));
      expect(JSON.stringify(exit)).toContain("No connected account");
      expect(calls).toHaveLength(0);
    }),
  );

  it.effect(
    "runs the draft on the creator model and writes the agent's own model to the file",
    () =>
      Effect.gen(function* () {
        const { calls, draft } = setup();
        const result = yield* draft({
          ...input,
          model: "claude-opus-5-5",
          creatorModel: "claude-haiku-5-5",
        });
        expect(result.kind).toBe("draft");
        if (result.kind !== "draft") return;
        expect(result.model).toBe("claude-haiku-5-5");
        expect(calls[0]?.modelSelection).toEqual({ instanceId: claude, model: "claude-haiku-5-5" });
        expect(parseSubagentSpec(result.contents, "test-scout").model).toBe("claude-opus-5-5");
      }),
  );

  it.effect("passes the current draft to the model on a revision", () =>
    Effect.gen(function* () {
      const { calls, draft } = setup();
      const first = yield* draft(input);
      if (first.kind !== "draft") return;
      yield* draft({ ...input, request: "Shorter.", currentDraft: first.contents });
      expect(calls[1]?.currentDraft?.description).toBe("Finds files for a task.");
      expect(calls[1]?.request).toBe("Shorter.");
    }),
  );

  it.effect("turns a model failure into an edit error", () =>
    Effect.gen(function* () {
      const { draft } = setup({
        generate: () =>
          Effect.fail(new TextGenerationError({ operation: "draftAgent", detail: "boom" })),
      });
      const error = yield* draft(input).pipe(Effect.flip);
      expect(error).toBeInstanceOf(SubagentEditError);
      expect(error.message).toContain("boom");
    }),
  );
});
