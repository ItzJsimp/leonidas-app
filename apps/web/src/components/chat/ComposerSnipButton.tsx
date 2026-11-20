import type { DesktopRecentSnip } from "@t3tools/contracts";
import { ScissorsIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { getDesktopSnipBridge, snipResultToFile } from "~/lib/desktopSnip";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Two frames let the pressed button and its tooltip leave the screen before the capture. */
async function afterTwoFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Taking a snip and listing the recent ones. Shared by the snip button and the plus menu. */
export function useDesktopSnips(
  /** Receives the snip as an image file for the current draft. */
  onSnip: (file: File) => void,
) {
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<ReadonlyArray<DesktopRecentSnip> | null>(null);
  const bridge = getDesktopSnipBridge();

  const reportError = useCallback((title: string, error: unknown) => {
    toastManager.add({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "Try again.",
    });
  }, []);

  const loadRecent = useCallback(
    (open: boolean) => {
      const current = getDesktopSnipBridge();
      if (!open || !current) return;
      current
        .listRecentSnips()
        .then(setRecent)
        .catch((error: unknown) => reportError("Could not list your recent snips", error));
    },
    [reportError],
  );

  const attachRecent = useCallback(
    async (path: string) => {
      try {
        const file = snipResultToFile(await getDesktopSnipBridge()!.readSnip(path));
        if (file) onSnip(file);
      } catch (error) {
        reportError("Could not open that snip", error);
      }
    },
    [onSnip, reportError],
  );

  const openFolder = useCallback(() => {
    getDesktopSnipBridge()
      ?.openSnipsFolder()
      .catch((error: unknown) => reportError("Could not open the snips folder", error));
  }, [reportError]);

  const snip = useCallback(async () => {
    const current = getDesktopSnipBridge();
    if (!current || busy) return;
    setBusy(true);
    try {
      await afterTwoFrames();
      const file = snipResultToFile(await current.startSnip());
      if (file) onSnip(file);
    } catch (error) {
      reportError("Could not take the snip", error);
    } finally {
      setBusy(false);
    }
  }, [busy, onSnip, reportError]);

  return {
    available: bridge !== undefined,
    busy,
    recent,
    loadRecent,
    attachRecent,
    openFolder,
    snip,
  };
}

export function ComposerSnipButton({
  onSnip,
  shortcutLabel,
}: {
  readonly onSnip: (file: File) => void;
  readonly shortcutLabel?: string | null;
}) {
  const { available, busy, snip } = useDesktopSnips(onSnip);
  if (!available) return null;

  const label = shortcutLabel ? `Snip the screen (${shortcutLabel})` : "Snip the screen";
  return (
    <Tooltip open={busy ? false : undefined}>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void snip()}
            aria-label="Snip the screen"
          />
        }
      >
        <ScissorsIcon />
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
