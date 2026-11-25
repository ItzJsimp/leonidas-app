import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useEventFeedStore } from "~/eventFeedStore";
import { isShown } from "~/notificationRules";
import { eventFeedLive } from "~/state/eventFeed";
import { useEnvironmentQuery } from "~/state/query";

import { isEventRead, isNeedsYou, mergeDuplicateEvents } from "./railFeed";

/** Distinct unread "Needs you" alerts in the active workspace's feed (matches the sidebar badge). */
export function useInboxUnread(): number {
  const workspace = useActiveAiosWorkspace();
  const environmentId = workspace.environmentId;
  const feed = useEnvironmentQuery(
    environmentId && workspace.scopeReady
      ? eventFeedLive({ environmentId, input: workspace.scope })
      : null,
  );
  const marks = useEventFeedStore((store) => store.marks);
  const rules = useEventFeedStore((store) => store.typeRules);
  const visible = (feed.data?.events ?? []).filter(
    (event) => !marks[event.id]?.dismissed && isShown(event, rules),
  );
  const merged = mergeDuplicateEvents(visible, marks);
  return merged.filter((event) => isNeedsYou(event, isEventRead(event, marks))).length;
}
