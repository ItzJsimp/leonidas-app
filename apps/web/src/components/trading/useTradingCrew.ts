import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { TradingSettingsSaveInput } from "@t3tools/contracts";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { tradingCrewSync, tradingSettingsSave } from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";

const FALLBACK = "Could not save. Try again.";

type Patch = Omit<TradingSettingsSaveInput, "workspaceId">;

/** Crew settings and the Sync now action for the active Trading workspace. Each returns an error line, or null. */
export function useTradingCrewActions() {
  const { environmentId, scope } = useActiveAiosWorkspace();
  const save = useAtomCommand(tradingSettingsSave, { reportFailure: false });
  const sync = useAtomCommand(tradingCrewSync, { reportFailure: false });
  return {
    async saveSettings(patch: Patch): Promise<string | null> {
      if (!environmentId) return FALLBACK;
      const result = await save({ environmentId, input: { ...scope, ...patch } });
      if (result._tag === "Success") return null;
      if (isAtomCommandInterrupted(result)) return FALLBACK;
      const failure = squashAtomCommandFailure(result);
      const reason =
        failure && typeof failure === "object" && "reason" in failure ? failure.reason : null;
      return reason === "read_failed"
        ? "The settings file cannot be read. Fix it, then try again."
        : FALLBACK;
    },
    async syncNow(): Promise<string | null> {
      if (!environmentId) return "Not connected.";
      const result = await sync({ environmentId, input: scope });
      return result._tag === "Success" ? null : "Could not reach the sync. Try again.";
    },
  };
}
