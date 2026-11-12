import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { tradingSettingsSave } from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";

const FALLBACK = "Could not save the cap. Try again.";

/** Saves the monthly fee cap to the active Trading workspace. Returns an error line, or null on success. */
export function useTradingSettingsSave(): (monthlyFeeCap: number | null) => Promise<string | null> {
  const { environmentId, scope } = useActiveAiosWorkspace();
  const run = useAtomCommand(tradingSettingsSave, { reportFailure: false });
  return async (monthlyFeeCap) => {
    if (!environmentId) return FALLBACK;
    const result = await run({ environmentId, input: { ...scope, monthlyFeeCap } });
    if (result._tag === "Success") return null;
    if (isAtomCommandInterrupted(result)) return FALLBACK;
    const failure = squashAtomCommandFailure(result);
    const reason =
      failure && typeof failure === "object" && "reason" in failure ? failure.reason : null;
    return reason === "read_failed"
      ? "The settings file cannot be read. Fix it, then try again."
      : FALLBACK;
  };
}
