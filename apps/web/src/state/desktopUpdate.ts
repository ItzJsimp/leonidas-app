import { useAtomValue } from "@effect/atom-react";
import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Atom } from "effect/reactivity";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type DesktopUpdateBridge = Pick<DesktopBridge, "getUpdateState" | "onUpdateState">;

const INITIAL_STATE_READ_ATTEMPT_COUNT = 3;

export class DesktopUpdateStateReadError extends Schema.TaggedError<DesktopUpdateStateReadError>()(
  "DesktopUpdateStateReadError",
  {
    attemptCount: Schema.Number,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read the initial desktop update state after ${this.attemptCount} attempts.`;
  }
}

function getDesktopUpdateBridge(): DesktopUpdateBridge | undefined {
  return typeof window === "undefined" ? undefined : window.desktopBridge;
}

export function createDesktopUpdateStateAtom(getBridge: () => DesktopUpdateBridge | undefined) {
  const updates = Stream.callback<DesktopUpdateState | null>((queue) =>
    Effect.gen(function* () {
      const bridge = getBridge();
      if (!bridge) {
        Queue.offerUnsafe(queue, null);
        return yield* Effect.never;
      }

      let receivedUpdate = false;
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          bridge.onUpdateState((state) => {
            receivedUpdate = true;
            Queue.offerUnsafe(queue, state);
          }),
        ),
        (unsubscribe) => Effect.sync(unsubscribe),
      );

      const initialState = yield* Effect.tryPromise({
        try: () => bridge.getUpdateState(),
        catch: (cause) =>
          new DesktopUpdateStateReadError({
            attemptCount: INITIAL_STATE_READ_ATTEMPT_COUNT,
            cause,
          }),
      }).pipe(
        Effect.retry({ times: INITIAL_STATE_READ_ATTEMPT_COUNT - 1 }),
        Effect.catchTags({
          DesktopUpdateStateReadError: (error) =>
            Effect.logError(error.message, {
              error,
              errorTag: error._tag,
              attemptCount: error.attemptCount,
            }).pipe(Effect.as(null)),
        }),
      );
      if (!receivedUpdate && initialState !== null) {
        Queue.offerUnsafe(queue, initialState);
      }

      return yield* Effect.never;
    }),
  );

  return Atom.make(updates, { initialValue: null }).pipe(
    Atom.keepAlive,
    Atom.withLabel("desktop:update-state"),
  );
}

const desktopUpdateStateAtom = createDesktopUpdateStateAtom(getDesktopUpdateBridge);

export type UpdateNoticeLevel = "notable" | "all" | "never";

/**
 * Update preferences, kept on this device. `autoUpdateWhenSafe` keeps its old key so a person who
 * turned it off before still has it off. New installs start with it on.
 */
export const useUpdatePreferencesStore = create<{
  /** Install a downloaded update when the AI is done and the user is idle, or when the app quits. */
  readonly autoUpdateWhenSafe: boolean;
  readonly setAutoUpdateWhenSafe: (enabled: boolean) => void;
  /** Which updates show the "Update ready" pill. Small fixes still install in every case. */
  readonly updateNotice: UpdateNoticeLevel;
  readonly setUpdateNotice: (level: UpdateNoticeLevel) => void;
  /** Version that was running last time, so the first run after an update can say what changed. */
  readonly lastRunVersion: string | null;
  readonly setLastRunVersion: (version: string) => void;
}>()(
  persist(
    (set) => ({
      autoUpdateWhenSafe: true,
      setAutoUpdateWhenSafe: (autoUpdateWhenSafe) => set({ autoUpdateWhenSafe }),
      updateNotice: "all",
      setUpdateNotice: (updateNotice) => set({ updateNotice }),
      lastRunVersion: null,
      setLastRunVersion: (lastRunVersion) => set({ lastRunVersion }),
    }),
    {
      name: "leonidas-safe-updates",
      // Version 0 stored "notable" as the untouched default, which hid every small update.
      version: 1,
      migrate: (stored) => ({ ...(stored as object), updateNotice: "all" }) as never,
      partialize: ({ autoUpdateWhenSafe, updateNotice, lastRunVersion }) => ({
        autoUpdateWhenSafe,
        updateNotice,
        lastRunVersion,
      }),
    },
  ),
);

/** The big "What's new" window. `since` is the version the user ran before; null shows the newest few. */
export interface UpdateDetailsRange {
  readonly since: string | null;
  readonly through: string;
}

export const useUpdateDetailsStore = create<{
  readonly range: UpdateDetailsRange | null;
  readonly show: (range: UpdateDetailsRange) => void;
  readonly close: () => void;
}>()((set) => ({
  range: null,
  show: (range) => set({ range }),
  close: () => set({ range: null }),
}));

export function useDesktopUpdateState(): DesktopUpdateState | null {
  return AsyncResult.getOrElse(useAtomValue(desktopUpdateStateAtom), () => null);
}
