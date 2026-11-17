import type {
  GameModeAction,
  GameModeLevel,
  GameModeMode,
  GameModeStatus,
} from "@t3tools/contracts";

import { Button } from "~/components/ui/button";

export const MODES: ReadonlyArray<{ readonly mode: GameModeMode; readonly label: string }> = [
  { mode: "auto", label: "Auto" },
  { mode: "on", label: "On" },
  { mode: "off", label: "Off" },
];

export const LEVELS: ReadonlyArray<{
  readonly level: GameModeLevel;
  readonly label: string;
  readonly hint: string;
}> = [
  { level: "soft", label: "Soft", hint: "Leonidas keeps working, slower, while you play" },
  { level: "strict", label: "Strict", hint: "Pauses agents, git and builds until the game closes" },
];

/** The two Game Mode button groups: when it runs (Auto, On, Off) and how hard (Soft, Strict). */
export function GameModeControls({
  status,
  busy,
  onAct,
}: {
  readonly status: GameModeStatus;
  readonly busy: boolean;
  readonly onAct: (action: GameModeAction) => void;
}) {
  return (
    <>
      <div role="group" aria-label="Game Mode" className="flex gap-1">
        {MODES.map(({ mode, label }) => (
          <Button
            key={mode}
            size="xs"
            variant={status.mode === mode ? "default" : "outline"}
            aria-pressed={status.mode === mode}
            disabled={busy}
            onClick={() => onAct(mode)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div role="group" aria-label="Game Mode level" className="flex gap-1">
        {LEVELS.map(({ level, label, hint }) => (
          <Button
            key={level}
            size="xs"
            title={hint}
            variant={status.level === level ? "default" : "outline"}
            aria-pressed={status.level === level}
            disabled={busy}
            onClick={() => onAct(level)}
          >
            {label}
          </Button>
        ))}
      </div>
    </>
  );
}
