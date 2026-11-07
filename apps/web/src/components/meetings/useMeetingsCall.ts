import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { scribeMeetings, scribeMeetingsDiscord } from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { commandErrorMessage } from "../scribe/home.logic";

export type Call = (
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string | null }
>;

/** One engine meetings call. A failure carries the engine's plain sentence, or null when interrupted. */
export function useMeetingsCall(
  environmentId: EnvironmentId,
  scope: "meetings" | "discord" = "meetings",
): Call {
  const run = useAtomCommand(scope === "discord" ? scribeMeetingsDiscord : scribeMeetings, {
    reportFailure: false,
  });
  return useCallback<Call>(
    async (method, path, body) => {
      const result = await run({
        environmentId,
        input: body === undefined ? { method, path } : { method, path, body },
      });
      if (result._tag === "Success") return { ok: true, value: result.value };
      if (isAtomCommandInterrupted(result)) return { ok: false, message: null };
      const failure = squashAtomCommandFailure(result);
      const message =
        typeof failure === "object" && failure !== null && "message" in failure
          ? (failure as { message: unknown }).message
          : undefined;
      return {
        ok: false,
        message: typeof message === "string" ? message : commandErrorMessage(failure),
      };
    },
    [environmentId, run],
  );
}
