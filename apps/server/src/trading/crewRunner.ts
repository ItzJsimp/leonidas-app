// @effect-diagnostics nodeBuiltinImport:off - synchronous node and global APIs are used on purpose in this file.
// @effect-diagnostics globalDate:off - the card and the sync state carry an ISO time.
// Runs Crew sync in the background: every 3 minutes for each Trading workspace the app has seen,
// and a moment after each change. Nothing leaves the PC until the trader turns on Crew sync.
import type { TradingCrewResult } from "@t3tools/contracts";
import {
  buildCrewCard,
  deriveTradingState,
  parseLedger,
  parseTrades,
  traderSlug,
} from "@t3tools/trading";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import { readCrewView, syncCrew, type RunGit } from "./crewSync.ts";
import { readTradingSettings } from "./tradingSettings.ts";
import { readLinkedPack } from "./tradingPack.ts";

export const SYNC_EVERY = Duration.minutes(3);
/** A change starts a sync after this wait, so a burst of entries makes one sync. */
const POKE_DELAY = Duration.seconds(5);

type Services = FileSystem.FileSystem | Path.Path;

/** The Crew state the tab shows. Reads the clone only. */
export const crewResult = Effect.fn("trading.crewResult")(function* (root: string) {
  const [{ settings }, linked] = yield* Effect.all([
    readTradingSettings(root),
    readLinkedPack(root),
  ]);
  const view = readCrewView(root);
  const setup =
    linked.status === "none"
      ? "no_pack"
      : !settings.crewSync
        ? "off"
        : settings.traderName === null
          ? "needs_name"
          : "on";
  return {
    setup,
    self: settings.traderName === null ? null : traderSlug(settings.traderName),
    cards: view.cards,
    skippedCards: view.skippedCards,
    lastSyncAt: view.lastSyncAt,
    status: view.status,
    detail: view.detail,
  } satisfies TradingCrewResult;
});

export function makeCrewRunner(input: {
  readonly run: RunGit;
  readonly scope: Scope.Scope;
  /** Gives a background effect the file services the request handlers have. */
  readonly provide: <A, E>(effect: Effect.Effect<A, E, Services>) => Effect.Effect<A, E>;
  readonly now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const locks = new Map<string, Semaphore.Semaphore>();
  const loops = new Set<string>();
  const pending = new Set<string>();
  const lockOf = (root: string) => {
    const found = locks.get(root) ?? Semaphore.makeUnsafe(1);
    locks.set(root, found);
    return found;
  };

  /** One sync, now. Does nothing before the trader turned Crew sync on and set a name. */
  const cycle = (root: string) => cycleOnce(root).pipe(lockOf(root).withPermits(1));
  const cycleOnce = Effect.fn("trading.crewCycle")(function* (root: string) {
    const { settings } = yield* readTradingSettings(root);
    const linked = yield* readLinkedPack(root);
    if (!settings.crewSync || settings.traderName === null || linked.status === "none") return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const read = (name: string) =>
      fs.readFileString(path.join(root, "trading", name)).pipe(Effect.orElseSucceed(() => ""));
    const [ledger, trades] = yield* Effect.all([read("ledger.jsonl"), read("trades.jsonl")]).pipe(
      Effect.map(([a, b]) => [parseLedger(a), parseTrades(b)] as const),
    );
    const state = deriveTradingState({ events: ledger.events, trades: trades.trades });
    const card = buildCrewCard({
      state,
      trades: trades.trades,
      name: settings.traderName,
      share: settings.share,
      now: now(),
    });
    yield* syncCrew(input.run, { root, packFolder: linked.folder, card, now: now() });
  });

  const fork = <E>(effect: Effect.Effect<void, E, Services>) =>
    Effect.forkIn(input.provide(effect.pipe(Effect.ignore)), input.scope);

  return {
    /** Sync once and return the new state. The Retry action calls this. */
    syncNow: (root: string) => cycle(root).pipe(Effect.andThen(crewResult(root))),
    /** Starts the 3 minute loop for a workspace, once. The first read of a Trading tab calls this. */
    watch: (root: string) =>
      Effect.suspend(() => {
        if (loops.has(root)) return Effect.void;
        loops.add(root);
        return fork(
          Effect.forever(cycle(root).pipe(Effect.ignore, Effect.andThen(Effect.sleep(SYNC_EVERY)))),
        ).pipe(Effect.asVoid);
      }),
    /** A change happened. One sync follows in a few seconds, however many changes come. */
    poke: (root: string) =>
      Effect.suspend(() => {
        if (pending.has(root)) return Effect.void;
        pending.add(root);
        return fork(
          Effect.sleep(POKE_DELAY).pipe(
            Effect.andThen(Effect.sync(() => pending.delete(root))),
            Effect.andThen(cycle(root)),
          ),
        ).pipe(Effect.asVoid);
      }),
  };
}
