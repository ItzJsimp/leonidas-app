import type { FoldedFeedEvent } from "@t3tools/contracts";

import { countOpenChats, groupCommandCenterThreads } from "~/commandCenter";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useEventFeedStore } from "~/eventFeedStore";
import { isShown } from "~/notificationRules";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "~/state/entities";
import { eventFeedLive } from "~/state/eventFeed";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardHomeQuery } from "~/state/taskBoard";

import type { StatusCounts } from "./copy";
import { isEventRead, isNeedsYou, mergeDuplicateEvents, type MergedFeedEvent } from "./railFeed";

const NO_EVENTS: ReadonlyArray<FoldedFeedEvent> = [];

/** The AIOS home read (areas, today's brief, counts) for the active workspace. */
export function useAiosHome() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  return useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardHomeQuery({ environmentId, input: scope }) : null,
  );
}

/** The feed read: merged visible events (newest first), plus raw feed and load state. */
export function useFeedStatus() {
  const { environmentId, scope, scopeReady } = useActiveAiosWorkspace();
  const feed = useEnvironmentQuery(
    environmentId && scopeReady ? eventFeedLive({ environmentId, input: scope }) : null,
  );
  const marks = useEventFeedStore((store) => store.marks);
  const rules = useEventFeedStore((store) => store.typeRules);
  const all = feed.data?.events ?? NO_EVENTS;
  const events = mergeDuplicateEvents(
    all.filter((event) => !marks[event.id]?.dismissed && isShown(event, rules)),
    marks,
  );
  return {
    events,
    /** Every event in the feed, for the rules screen: a type that is off must still be listed. */
    all,
    loaded: feed.data !== null,
    error: feed.error,
    updatedAt: feed.dataUpdatedAt,
    refresh: feed.refresh,
  };
}

/** Merged feed events the user has not dismissed, newest first. */
export function useFeedEvents(): ReadonlyArray<MergedFeedEvent> {
  return useFeedStatus().events;
}

/** One source for every count, so the status line, header stats and rails show the same number. */
export function useTwoStateCounts(): StatusCounts {
  const feed = useFeedStatus();
  const events = feed.events;
  const marks = useEventFeedStore((store) => store.marks);
  const threads = useThreadShells();
  const threadsLoaded = useAllEnvironmentShellsBootstrapped();
  const home = useAiosHome().data;
  const needsYou = feed.loaded
    ? events.filter((event) => isNeedsYou(event, isEventRead(event, marks))).length
    : null;
  const running = threadsLoaded ? groupCommandCenterThreads(threads).running.length : null;
  const openChats = threadsLoaded ? countOpenChats(threads) : null;
  const priorities = home?.brief?.priorities;
  const today = priorities
    ? { done: priorities.filter((priority) => priority.done).length, total: priorities.length }
    : null;
  return { needsYou, running, openChats, today };
}
