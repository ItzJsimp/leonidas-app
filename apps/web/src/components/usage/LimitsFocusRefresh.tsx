import { useAtomValue } from "@effect/atom-react";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import { useEffect, useEffectEvent } from "react";

import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

/** A device that sat in the background re-reads its limits at most once a minute on return. */
export const FOCUS_REFRESH_COOLDOWN_MS = 60_000;

/**
 * The server only polls limits for a window that is showing, so a device that was idle or
 * hidden holds old numbers. Coming back to the window asks every connected environment for
 * a fresh read instead of waiting for the next Usage page refresh.
 */
export function LimitsFocusRefresh() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const refresh = useEffectEvent(() => {
    if (document.visibilityState !== "visible") return;
    for (const [environmentId, presentation] of presentations) {
      if (presentation.connection.phase !== "connected" || presentation.serverConfig === null)
        continue;
      void refreshUsageLimits(
        environmentId,
        () => refreshProviders({ environmentId, input: {} }),
        true,
        false,
        FOCUS_REFRESH_COOLDOWN_MS,
      );
    }
  });
  useEffect(() => {
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return null;
}
