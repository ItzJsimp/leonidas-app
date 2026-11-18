import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { useEnvironmentQuery } from "~/state/query";
import { scribePatchSettings, scribeSettingsQuery } from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Reads whether Leonidas Scribe listening shortcuts are enabled and provides an immediate toggle.
 * Off removes Scribe key/mouse hooks while keeping Scribe status, settings, and history live.
 */
export function useScribeToggle(environmentId: EnvironmentId | null) {
  const query = useEnvironmentQuery(
    environmentId ? scribeSettingsQuery({ environmentId, input: {} }) : null,
  );
  const patch = useAtomCommand(scribePatchSettings, { reportFailure: false });
  const [busy, setBusy] = useState(false);

  const settings = query.data;
  const enabled = settings ? settings.sections.hotkeys.enabled !== false : null;

  const toggle = async () => {
    if (!environmentId || enabled === null || busy) return;
    setBusy(true);
    const result = await patch({
      environmentId,
      input: { section: "hotkeys", values: { enabled: !enabled } },
    });
    setBusy(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not change Scribe. Check that Scribe is running, then try again.",
      });
    }
  };

  return {
    settings,
    settingsError: query.error,
    refreshSettings: query.refresh,
    enabled,
    busy,
    toggle,
  };
}
