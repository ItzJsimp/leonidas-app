import type { EnvironmentId, FeedEvent, ThreadId } from "@t3tools/contracts";
import type { useNavigate } from "@tanstack/react-router";

import { ensureLocalApi } from "./localApi";

/** What a click on an event opens: its first button, else its target. Never runs a command. */
export function feedEventOpenTarget(
  event: FeedEvent,
): { readonly thread: string } | { readonly task: string } | { readonly url: string } | null {
  const action = event.actions?.[0];
  if (action?.kind === "open_thread") return { thread: action.ref };
  if (action?.kind === "open_task") return { task: action.ref };
  if (action?.kind === "open_url") return { url: action.ref };
  if (event.target?.thread !== undefined) return { thread: event.target.thread };
  if (event.target?.url !== undefined) return { url: event.target.url };
  return null;
}

export function openFeedEvent(
  event: FeedEvent,
  environmentId: EnvironmentId,
  navigate: ReturnType<typeof useNavigate>,
): void {
  const target = feedEventOpenTarget(event);
  if (target === null) return;
  if ("thread" in target) {
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId: target.thread as ThreadId },
    });
    return;
  }
  if ("task" in target) {
    void navigate({ to: "/tasks", search: { task: target.task } });
    return;
  }
  void ensureLocalApi().shell.openExternal(target.url);
}
