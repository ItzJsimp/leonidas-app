import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type {
  CalendarActionResult,
  CalendarAddLinkInput,
  CalendarGoogleCalendar,
  CalendarGoogleClientInput,
  CalendarGoogleConnectResult,
} from "@t3tools/contracts";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

import { useNowMs } from "../commandCenter/useHomeReads";
import { addDays, startOfDay, todayCountLabel } from "./calendar.logic";

let version = 0;
const listeners = new Set<() => void>();

/** Call after a calendar is added or removed, so every open agenda reads again. */
export function bumpCalendars(): void {
  version += 1;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Events between two times, plus the connected calendars. Re-reads after `bumpCalendars`. */
function useCalendarEvents(fromMs: number, toMs: number) {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.calendarEvents({
          environmentId,
          input: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
        }),
  );
  const seen = useSyncExternalStore(subscribe, () => version);
  const last = useRef(seen);
  const { refresh } = query;
  useEffect(() => {
    if (last.current === seen) return;
    last.current = seen;
    refresh();
  }, [seen, refresh]);
  return query;
}

const OFFLINE = "Could not reach the app. Try again.";

function settle<A, E>(result: AtomCommandResult<A, E>, fallback: A): A {
  return result._tag === "Success" ? result.value : fallback;
}

/** Calendar actions. A failed call becomes a plain `ok: false` answer, so the screen shows words. */
export function useCalendarCommands() {
  const environmentId = usePrimaryEnvironmentId();
  const testLink = useAtomCommand(serverEnvironment.calendarTestLink, { reportFailure: false });
  const addLink = useAtomCommand(serverEnvironment.calendarAddLink, { reportFailure: false });
  const remove = useAtomCommand(serverEnvironment.calendarRemove, { reportFailure: false });
  const setClient = useAtomCommand(serverEnvironment.calendarGoogleSetClient, {
    reportFailure: false,
  });
  const connect = useAtomCommand(serverEnvironment.calendarGoogleConnect, { reportFailure: false });
  const select = useAtomCommand(serverEnvironment.calendarGoogleSelect, { reportFailure: false });
  const failed: CalendarActionResult = { ok: false, message: OFFLINE };

  return {
    testLink: async (url: string) =>
      environmentId === null
        ? failed
        : settle(await testLink({ environmentId, input: { url } }), failed),
    addLink: async (input: CalendarAddLinkInput) =>
      environmentId === null ? failed : settle(await addLink({ environmentId, input }), failed),
    remove: async (id: string) =>
      environmentId === null
        ? failed
        : settle(await remove({ environmentId, input: { id } }), failed),
    setClient: async (input: CalendarGoogleClientInput) =>
      environmentId === null ? failed : settle(await setClient({ environmentId, input }), failed),
    connectGoogle: async (): Promise<CalendarGoogleConnectResult> => {
      const none = { ok: false, message: OFFLINE, calendars: [] };
      return environmentId === null
        ? none
        : settle(await connect({ environmentId, input: {} }), none);
    },
    selectGoogle: async (calendars: ReadonlyArray<CalendarGoogleCalendar>) =>
      environmentId === null
        ? failed
        : settle(await select({ environmentId, input: { calendars } }), failed),
  };
}

/** Today (1 day) or the next week (7 days). The window moves only at midnight, so cards share one read. */
export function useAgendaEvents(days: 1 | 7) {
  const now = useNowMs();
  const today = startOfDay(now);
  const query = useCalendarEvents(today, addDays(now, days));
  return { ...query, now };
}

/** "3 today" for the Up next card, or nothing. */
export function useUpNextCount(): string | undefined {
  const { data, now } = useAgendaEvents(7);
  return data ? todayCountLabel(data.events, now) : undefined;
}
