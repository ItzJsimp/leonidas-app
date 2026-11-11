import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";

import { tradingAppend } from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";

import type { AppendFn } from "./FormParts";

const FALLBACK = "Could not save. Check the values and try again.";

/** Saves events to the active Trading workspace. The Dashboard state refreshes after a save. */
export function useTradingAppend(): AppendFn {
  const { environmentId, scope } = useActiveAiosWorkspace();
  const run = useAtomCommand(tradingAppend, { reportFailure: false });
  return useCallback(
    async (events) => {
      if (!environmentId) return FALLBACK;
      const result = await run({ environmentId, input: { ...scope, events } });
      if (result._tag === "Success") return null;
      if (isAtomCommandInterrupted(result)) return FALLBACK;
      const failure = squashAtomCommandFailure(result);
      const detail =
        failure && typeof failure === "object" && "detail" in failure ? failure.detail : null;
      return typeof detail === "string" && detail ? `Could not save: ${detail}.` : FALLBACK;
    },
    [environmentId, run, scope],
  );
}
