import * as Schema from "effect/Schema";

/** `auto` detects games, `on` always throttles background work, `off` never does. */
export const GameModeMode = Schema.Literals(["auto", "on", "off"]);
export type GameModeMode = typeof GameModeMode.Type;

/**
 * How hard Game Mode holds work back while a game runs. `soft` keeps Leonidas working on the
 * efficiency cores. `strict` pauses agents, git, builds and AIOS tasks until the game closes.
 */
export const GameModeLevel = Schema.Literals(["soft", "strict"]);
export type GameModeLevel = typeof GameModeLevel.Type;

/** What the Game Mode button can ask for. The `vdd` actions turn the virtual display off or on. */
export const GameModeAction = Schema.Literals([
  "on",
  "off",
  "auto",
  "soft",
  "strict",
  "vddOff",
  "vddOn",
]);
export type GameModeAction = typeof GameModeAction.Type;

export const GameModeActionInput = Schema.Struct({ action: GameModeAction });
export type GameModeActionInput = typeof GameModeActionInput.Type;

/**
 * The Game Mode state on this machine. `error` is set when the control script could not run,
 * so a broken read never looks like "Game Mode is off".
 */
export const GameModeStatus = Schema.Struct({
  mode: GameModeMode,
  level: GameModeLevel,
  /** The watcher task that applies the mode is running. */
  watcher: Schema.Boolean,
  /** Background processes held back right now. */
  throttled: Schema.Number,
  virtualDisplay: Schema.Literals(["on", "off"]),
  /** Game Mode is holding work back now. In `auto` this is true only while a game is detected. */
  active: Schema.Boolean,
  /** The game found in `auto` mode, and how: `name`, `game folder` or `fullscreen`. */
  game: Schema.NullOr(Schema.String),
  gameSource: Schema.NullOr(Schema.String),
  /** When a forced `on` ends and Game Mode goes back to `auto`, as an ISO time. */
  forcedUntil: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type GameModeStatus = typeof GameModeStatus.Type;
