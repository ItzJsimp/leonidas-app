import { TextGenerationError } from "@t3tools/contracts";
import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { make } from "./SkillPick.ts";

const settings = {
  getSettings: Effect.succeed({ textGenerationModelSelection: { instanceId: "a", model: "m" } }),
} as never;
const request = {
  cwd: "/project",
  request: "Fix the login bug",
  project: "app",
  alreadyAdded: [],
  candidates: [{ name: "tdd", description: "Test-driven development." }],
  max: 2,
};
const pick = (textGeneration: object, input = request) =>
  make(textGeneration as never, settings).pick(input);

it.effect("returns what the model picked, with the text-generation model", () =>
  Effect.gen(function* () {
    let seen: unknown;
    const result = yield* pick({
      pickSkills: (input: { modelSelection: unknown }) => {
        seen = input.modelSelection;
        return Effect.succeed({ picks: [{ name: "tdd", reason: "fix the bug test first" }] });
      },
    });
    expect(result).toEqual({
      picks: [{ name: "tdd", reason: "fix the bug test first" }],
      modelUsed: true,
    });
    expect(seen).toEqual({ instanceId: "a", model: "m" });
  }),
);

it.effect("says the model was not used when it fails, so the caller can fall back", () =>
  Effect.gen(function* () {
    const offline = new TextGenerationError({ operation: "pickSkills", detail: "offline" });
    const result = yield* pick({ pickSkills: () => Effect.fail(offline) });
    expect(result).toEqual({ picks: [], modelUsed: false });
  }),
);

it.effect("says the same when the provider cannot pick skills", () =>
  Effect.gen(function* () {
    expect(yield* pick({})).toEqual({ picks: [], modelUsed: false });
  }),
);

it.effect("does not call the model for an empty shortlist", () =>
  Effect.gen(function* () {
    let calls = 0;
    const result = yield* pick(
      {
        pickSkills: () => {
          calls += 1;
          return Effect.succeed({ picks: [] });
        },
      },
      { ...request, candidates: [] },
    );
    expect(calls).toBe(0);
    expect(result.modelUsed).toBe(false);
  }),
);
