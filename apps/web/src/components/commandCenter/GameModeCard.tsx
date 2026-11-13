import {
  AuthGameModeControlScope,
  type EnvironmentId,
  type GameModeAction,
  type GameModeMode,
} from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { gameModeRun, gameModeStatusQuery } from "~/state/gameMode";
import { useEnvironmentQuery } from "~/state/query";
import { scribePatchSettings, scribeSettingsQuery } from "~/state/scribe";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { BigNumber, HomeWidget, WidgetError, WidgetSkeleton } from "./HomeWidget";

/**
 * Turns the Scribe keys and mouse button on or off. Off removes Scribe's key hooks, so it reads
 * no key at all. Scribe also leaves its keys alone while a full screen game runs.
 * Stays out of the way until Scribe answers.
 */
function ScribeToggle({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(scribeSettingsQuery({ environmentId, input: {} }));
  const patch = useAtomCommand(scribePatchSettings, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const hotkeys = query.data?.sections.hotkeys;
  if (!hotkeys) return null;
  const on = hotkeys.enabled !== false;

  const flip = async () => {
    setBusy(true);
    const result = await patch({
      environmentId,
      input: { section: "hotkeys", values: { enabled: !on } },
    });
    setBusy(false);
    if (result._tag === "Success") query.refresh();
    else if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not change Scribe. Check that Scribe is running, then try again.",
      });
    }
  };

  return (
    <Button
      size="xs"
      variant={on ? "default" : "outline"}
      aria-pressed={on}
      disabled={busy}
      onClick={() => void flip()}
    >
      {on ? "Scribe: on" : "Scribe: off"}
    </Button>
  );
}

const POLL_MS = 10_000;

const MODES: ReadonlyArray<{ readonly mode: GameModeMode; readonly label: string }> = [
  { mode: "auto", label: "Auto" },
  { mode: "on", label: "On" },
  { mode: "off", label: "Off" },
];

const NOTE: Record<GameModeMode, string> = {
  auto: "Waits for a game, then holds back background work",
  on: "Holding back background work now",
  off: "Off, even while a game runs",
};

/**
 * Game Mode: how many background processes it holds back, the mode, and the virtual display.
 * Renders nothing unless the session holds `game-mode:control`. Leonidas itself keeps running
 * on the efficiency cores while a game plays.
 */
export function GameModeCard() {
  const environmentId = usePrimaryEnvironmentId();
  const allowed = useEnvironmentScope(environmentId, AuthGameModeControlScope);
  const query = useEnvironmentQuery(
    allowed && environmentId ? gameModeStatusQuery({ environmentId, input: {} }) : null,
  );
  const run = useAtomCommand(gameModeRun);
  const [busy, setBusy] = useState(false);

  const { refresh } = query;
  useEffect(() => {
    if (!allowed) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [allowed, refresh]);

  if (!allowed || !environmentId) return null;
  const status = query.data;

  const act = async (action: GameModeAction) => {
    setBusy(true);
    try {
      await run({ environmentId, input: { action } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <HomeWidget
      title="Game Mode"
      count={status ? MODES.find((m) => m.mode === status.mode)?.label : undefined}
    >
      {status === null && query.error !== null ? (
        <WidgetError message="Game Mode could not be read." onRetry={refresh} />
      ) : status === null ? (
        <WidgetSkeleton rows={2} />
      ) : status.error !== null ? (
        <WidgetError message={status.error} onRetry={refresh} />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <BigNumber
            value={status.throttled}
            unit="held back"
            note={status.watcher ? NOTE[status.mode] : "The Game Mode watcher is not running"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Game Mode" className="flex gap-1">
              {MODES.map(({ mode, label }) => (
                <Button
                  key={mode}
                  size="xs"
                  variant={status.mode === mode ? "default" : "outline"}
                  aria-pressed={status.mode === mode}
                  disabled={busy}
                  onClick={() => void act(mode)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void act(status.virtualDisplay === "on" ? "vddOff" : "vddOn")}
            >
              {status.virtualDisplay === "on"
                ? "Turn virtual display off"
                : "Turn virtual display on"}
            </Button>
            <ScribeToggle environmentId={environmentId} />
          </div>
        </div>
      )}
    </HomeWidget>
  );
}
