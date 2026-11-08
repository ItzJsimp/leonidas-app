import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/http";

import { withCurrentToolNames } from "./LegacyToolNames.ts";

const body = (name: string) =>
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } });

/** Runs the wrapper and returns the body text the next handler reads. */
const seenBody = (method: string, text: string) =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(
      new Request("http://127.0.0.1/mcp", {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "GET" ? {} : { body: text }),
      }),
    );
    // The router already puts the request in context; the wrapper replaces it only when it renames.
    return yield* withCurrentToolNames(
      request,
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (seen) => seen.text),
    ).pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request));
  });

describe("withCurrentToolNames", () => {
  it.effect("gives the next handler the current name for a legacy tool call", () =>
    Effect.gen(function* () {
      const seen = yield* seenBody("POST", body("t3_thread_list"));
      expect(JSON.parse(seen).params.name).toBe("leo_thread_list");
    }),
  );

  it.effect("leaves a current name, another tool and non-JSON text as they are", () =>
    Effect.gen(function* () {
      expect(yield* seenBody("POST", body("leo_thread_list"))).toBe(body("leo_thread_list"));
      expect(yield* seenBody("POST", body("probe"))).toBe(body("probe"));
      expect(yield* seenBody("POST", "tools/call but not json")).toBe("tools/call but not json");
    }),
  );
});
