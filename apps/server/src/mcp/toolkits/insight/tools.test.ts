import { describe, expect, it } from "@effect/vitest";
import { Context } from "effect";
import { Tool } from "effect/ai";

import { InsightToolkit } from "./tools.ts";

describe("InsightToolkit", () => {
  it("declares every tool read-only, so a read-only grant can call it", () => {
    for (const tool of Object.values(InsightToolkit.tools)) {
      expect(Context.get(tool.annotations, Tool.Readonly)).toBe(true);
    }
  });

  it("gives leo_release_status no parameters, so it cannot point at another repo", () => {
    const tool = InsightToolkit.tools.leo_release_status;
    expect(Tool.getJsonSchema(tool as Tool.Any).properties ?? {}).toEqual({});
  });
});
