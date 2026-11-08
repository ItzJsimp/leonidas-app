import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/http";
import { renameLegacyToolCalls } from "@t3tools/shared/mcpServerName";

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const encodeJsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * Saved threads and saved permission rules call tools by their names from before the rename.
 * This rewrites those `tools/call` names to the current ones before the request reaches the
 * MCP server. Only a request that holds a legacy name is rebuilt.
 * Remove it two releases after the rename.
 */
export const withCurrentToolNames = <A, E, R>(
  request: HttpServerRequest.HttpServerRequest,
  httpEffect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    if (request.method !== "POST") return yield* httpEffect;
    const text = yield* request.text.pipe(Effect.option);
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(text) || Option.isNone(url)) return yield* httpEffect;
    // Most requests are not tool calls: skip the JSON parse for them.
    if (!text.value.includes("tools/call")) return yield* httpEffect;
    let renamed: unknown;
    try {
      const parsed = decodeJsonText(text.value);
      renamed = renameLegacyToolCalls(parsed);
      if (renamed === parsed) return yield* httpEffect;
    } catch {
      // Not JSON: the MCP server reports the error.
      return yield* httpEffect;
    }
    const headers = new Headers(request.headers as Record<string, string>);
    headers.delete("content-length");
    const rebuilt = HttpServerRequest.fromWeb(
      new Request(url.value, { method: "POST", headers, body: encodeJsonText(renamed) }),
    );
    return yield* httpEffect.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, rebuilt),
    );
  });
