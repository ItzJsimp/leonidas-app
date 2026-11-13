import * as Schema from "effect/Schema";

/** `auto` detects games, `on` always throttles background work, `off` never does. */
export const GameModeMode = Schema.Literals(["auto", "on", "off"]);
export type GameModeMode = typeof GameModeMode.Type;

/** What the Game Mode button can ask for. The `vdd` actions turn the virtual display off or on. */
export const GameModeAction = Schema.Literals(["on", "off", "auto", "vddOff", "vddOn"]);
export type GameModeAction = typeof GameModeAction.Type;

export const GameModeActionInput = Schema.Struct({ action: GameModeAction });
export type GameModeActionInput = typeof GameModeActionInput.Type;

/**
 * The Game Mode state on this machine. `error` is set when the control script could not run,
 * so a broken read never looks like "Game Mode is off".
 */
export const GameModeStatus = Schema.Struct({
  mode: GameModeMode,
  /** The watcher task that applies the mode is running. */
  watcher: Schema.Boolean,
  /** Background processes held back right now. */
  throttled: Schema.Number,
  virtualDisplay: Schema.Literals(["on", "off"]),
  error: Schema.NullOr(Schema.String),
});
export type GameModeStatus = typeof GameModeStatus.Type;
