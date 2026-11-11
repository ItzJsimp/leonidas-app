import type { DesktopUpdateState } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { INSTALLER_URL, resolveCrashRecoveryStep } from "../desktopUpdate.logic";
import { Button } from "../ui/button";

/**
 * Shown on the crash screen in the desktop app. A broken release cannot fix itself through the
 * page, but the main process still downloads updates, so this offers that fix and the installer.
 * It uses the desktop bridge directly so it keeps working when app state is the thing that broke.
 */
export function CrashRecoveryUpdate() {
  const bridge = window.desktopBridge;
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge
      .getUpdateState()
      .then((next) => live && setState(next))
      .catch(() => {});
    const unsubscribe = bridge.onUpdateState(setState);
    void bridge.checkForUpdate().catch(() => {});
    return () => {
      live = false;
      unsubscribe();
    };
  }, [bridge]);

  if (!bridge) return null;
  const step = resolveCrashRecoveryStep(state);

  return (
    <div className="mt-5 grid gap-2 rounded-lg border border-border/70 bg-background/55 p-3">
      {step === "restart" ? (
        <>
          <p className="text-sm">A newer version is ready. It may fix this.</p>
          <Button size="sm" onClick={() => void bridge.installUpdate().catch(() => {})}>
            Restart and update
          </Button>
        </>
      ) : step === "download" ? (
        <>
          <p className="text-sm">A newer version is available. It may fix this.</p>
          <Button size="sm" onClick={() => void bridge.downloadUpdate().catch(() => {})}>
            Download update
          </Button>
        </>
      ) : step === "working" ? (
        <p className="text-sm">Looking for a fix. Keep this window open.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Still stuck? Download the newest installer and run it.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() => void bridge.openExternal(INSTALLER_URL).catch(() => {})}
      >
        Download installer
      </Button>
    </div>
  );
}
