import { AuthGameModeControlScope, type GameModeAction } from "@t3tools/contracts";
import { Gamepad2Icon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { gameModeRun, gameModeStatusQuery } from "~/state/gameMode";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { GameModeControls, LEVELS } from "../commandCenter/GameModeControls";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuItem } from "../ui/sidebar";

const PILL_CLASS =
  "inline-flex h-7 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-control-surface pr-3 pl-2.5 text-xs text-sidebar-foreground outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset";

const LABEL = { auto: "Auto", on: "On", off: "Off" } as const;

/**
 * Game Mode in the sidebar footer, one click from any page. Each status read starts a
 * PowerShell process on the server, so it reads on mount and when opened, never on a timer.
 * Renders nothing unless the session holds `game-mode:control`.
 */
export function SidebarGameModePill() {
  const environmentId = usePrimaryEnvironmentId();
  const allowed = useEnvironmentScope(environmentId, AuthGameModeControlScope);
  const query = useEnvironmentQuery(
    allowed && environmentId ? gameModeStatusQuery({ environmentId, input: {} }) : null,
  );
  const run = useAtomCommand(gameModeRun);
  const [busy, setBusy] = useState(false);

  if (!allowed || !environmentId) return null;
  const status = query.data;
  const ready = status !== null && status.error === null;

  const act = async (action: GameModeAction) => {
    setBusy(true);
    try {
      await run({ environmentId, input: { action } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidebarMenuItem>
      <Popover onOpenChange={(open) => open && query.refresh()}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Game Mode settings"
              className={cn(PILL_CLASS, status?.mode === "on" && "border-primary text-primary")}
            />
          }
        >
          <Gamepad2Icon aria-hidden className="size-3.5" />
          <span className="whitespace-nowrap">
            Game Mode
            {ready
              ? ` · ${LABEL[status.mode]} · ${status.level === "strict" ? "Strict" : "Soft"}`
              : ""}
          </span>
        </PopoverTrigger>
        <PopoverPopup side="top" align="start" aria-label="Game Mode">
          <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3">
            <h2 className="text-sm font-semibold">Game Mode</h2>
            {status === null ? (
              <p className="text-sm text-muted-foreground">Reading Game Mode…</p>
            ) : status.error !== null ? (
              <p className="text-sm text-destructive">{status.error}</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <GameModeControls
                    status={status}
                    busy={busy}
                    onAct={(action) => void act(action)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {LEVELS.find((l) => l.level === status.level)?.hint}
                  {status.watcher ? "" : ". The Game Mode watcher is not running."}
                </p>
              </>
            )}
          </div>
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}
