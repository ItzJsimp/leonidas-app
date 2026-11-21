import {
  AuthGameModeControlScope,
  type EnvironmentId,
  type GameModeAction,
  type GameModeMode,
} from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { gameModeRun, gameModeStatusQuery } from "~/state/gameMode";
import { useEnvironmentQuery } from "~/state/query";
import { useScribeToggle } from "~/components/scribe/useScribeToggle";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { GameModeControls, MODES } from "./GameModeControls";
import { BigNumber, HomeWidget, WidgetError, WidgetSkeleton } from "./HomeWidget";

/**
 * Turns the Scribe keys and mouse button on or off. Off removes Scribe's key hooks, so it reads
 * no key at all. Scribe also leaves its keys alone while a full screen game runs.
 * Stays out of the way until Scribe answers.
 */
function ScribeToggle({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const { enabled, busy, toggle } = useScribeToggle(environmentId);
  if (enabled === null) return null;

  return (
    <Button
      size="xs"
      variant={enabled ? "default" : "outline"}
      aria-pressed={enabled}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {enabled ? "Scribe: on" : "Scribe: off"}
    </Button>
  );
}

const POLL_MS = 10_000;

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

  const act = (action: GameModeAction) => {
    setBusy(true);
    return run({ environmentId, input: { action } }).finally(() => setBusy(false));
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
            <GameModeControls status={status} busy={busy} onAct={(action) => void act(action)} />
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
