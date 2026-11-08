import { useMemo } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useEventFeedStore } from "~/eventFeedStore";
import { isShown } from "~/notificationRules";
import { eventFeedLive } from "~/state/eventFeed";
import { useEnvironmentQuery } from "~/state/query";

/** How many events in the active workspace's feed are unread and not dismissed (the bell's count). */
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
  return useMemo(
    () =>
      (feed.data?.events ?? []).filter(
        (event) => !marks[event.id]?.dismissed && !marks[event.id]?.read && isShown(event, rules),
      ).length,
    [feed.data, marks, rules],
  );
}
