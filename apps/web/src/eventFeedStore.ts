import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import type { NotificationRule, NotificationRules } from "./notificationRules";

/** Old absent ids drop first; marks for events still in a feed always stay. */
const MAX_MARKS = 2_000;

export interface EventMark {
  readonly read?: true;
  readonly dismissed?: true;
}

interface EventFeedStoreState {
  readonly setFeedIds: (environmentId: string, ids: ReadonlyArray<string> | null) => void;
  /** Read and dismissed state, keyed by event id. Never written to the AIOS. */
  readonly marks: Readonly<Record<string, EventMark>>;
  /** The user's rule per event type. A type without one follows `defaultRule`. */
  readonly typeRules: NotificationRules;
  readonly markRead: (ids: ReadonlyArray<string>) => void;
  readonly dismiss: (id: string) => void;
  /** Mark all done: read and dismissed in one write. */
  readonly dismissAll: (ids: ReadonlyArray<string>) => void;
  /** Puts marks back as they were, for Undo. An id missing from `before` loses its mark. */
  readonly restoreMarks: (before: Readonly<Record<string, EventMark | undefined>>) => void;
  /** Null clears the user's rule, so the default applies again. */
  readonly setTypeRule: (type: string, rule: NotificationRule | null) => void;
}

function withMarks(
  marks: Readonly<Record<string, EventMark>>,
  ids: ReadonlyArray<string>,
  mark: EventMark,
  feedIds: ReadonlyMap<string, ReadonlyArray<string>>,
): Record<string, EventMark> {
  const next: Record<string, EventMark> = { ...marks };
  for (const id of ids) next[id] = { ...next[id], ...mark };
  const keys = Object.keys(next);
  if (keys.length > MAX_MARKS) {
    const retained = new Set([...feedIds.values()].flat());
    const absent = keys.filter((id) => !retained.has(id)).sort();
    for (const id of absent.slice(0, keys.length - MAX_MARKS)) delete next[id];
  }
  return next;
}

export const useEventFeedStore = create<EventFeedStoreState>()(
  persist(
    (set) => {
      const feedIds = new Map<string, ReadonlyArray<string>>();
      return {
        marks: {},
        typeRules: {},
        setFeedIds: (environmentId, ids) => {
          if (ids === null) feedIds.delete(environmentId);
          else feedIds.set(environmentId, ids);
        },
        markRead: (ids) =>
          set((state) => ({ marks: withMarks(state.marks, ids, { read: true }, feedIds) })),
        dismiss: (id) =>
          set((state) => ({
            marks: withMarks(state.marks, [id], { read: true, dismissed: true }, feedIds),
          })),
        dismissAll: (ids) =>
          set((state) => ({
            marks: withMarks(state.marks, ids, { read: true, dismissed: true }, feedIds),
          })),
        restoreMarks: (before) =>
          set((state) => {
            const marks: Record<string, EventMark> = { ...state.marks };
            for (const [id, mark] of Object.entries(before)) {
              if (mark) marks[id] = mark;
              else delete marks[id];
            }
            return { marks };
          }),
        setTypeRule: (type, rule) =>
          set((state) => {
            const { [type]: _old, ...rest } = state.typeRules;
            return { typeRules: rule === null ? rest : { ...rest, [type]: rule } };
          }),
      };
    },
    {
      name: "leonidas:event-feed:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 2,
      // Version 1 kept `mutedTypes`: types that never popped up but stayed in the inbox.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as {
          marks?: Record<string, EventMark>;
          mutedTypes?: ReadonlyArray<string>;
          typeRules?: NotificationRules;
        };
        if (version >= 2) return state;
        return {
          marks: state.marks ?? {},
          typeRules: Object.fromEntries(
            (state.mutedTypes ?? []).map((type) => [type, "inbox" as const]),
          ),
        };
      },
      partialize: ({ marks, typeRules }) => ({ marks, typeRules }),
    },
  ),
);
