import {
  type PendingSubagentRequest,
  presentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { pendingSubagentRequestsByThread } from "@t3tools/client-runtime/state/threads";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  completeFeedEvent,
  type EnvironmentId,
  type EventsSubscribeInput,
  type FeedEvent,
  type FeedEventDraft,
  type OrchestrationV2ThreadShell,
  type ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { feedEventOpenTarget, openFeedEvent } from "../eventFeedOpen";
import { useEventFeedStore } from "../eventFeedStore";
import { popsUp } from "../notificationRules";
import { getClientSettings, useClientSettings } from "../hooks/useSettings";
import { useEnvironmentIds } from "../state/environments";
import { eventFeedLive, eventsAppend } from "../state/eventFeed";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";
import { useAtomCommand } from "../state/use-atom-command";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  isInNotificationQuietHours,
  playNotificationSound,
  setNotificationBadge,
  threadNotificationTag,
  unlockNotificationAudio,
} from "../threadNotifications";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { toastManager } from "./ui/toast";
import { useActiveAiosWorkspace } from "./workspace/useActiveAiosWorkspace";

const NO_SCOPE: EventsSubscribeInput = {};

export function ThreadNotificationCoordinator() {
  const environmentIds = useEnvironmentIds();
  const workspace = useActiveAiosWorkspace();
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  const pending = useRef(
    new Map<string, { environmentId: EnvironmentId; notification: Notification }>(),
  );
  const onNotification = (environmentId: EnvironmentId, notification: Notification) => {
    pending.current.get(notification.tag)?.notification.close();
    pending.current.set(notification.tag, { environmentId, notification });
    setNotificationBadge(pending.current.size);
  };

  useEffect(() => {
    const activeIds = new Set(environmentIds);
    const count = pending.current.size;
    for (const [tag, entry] of pending.current) {
      if (activeIds.has(entry.environmentId)) continue;
      entry.notification.close();
      pending.current.delete(tag);
    }
    if (count !== pending.current.size) setNotificationBadge(pending.current.size);
  }, [environmentIds]);

  useEffect(() => {
    const clear = () => {
      for (const { notification } of pending.current.values()) notification.close();
      pending.current.clear();
      setNotificationBadge(0);
    };
    clear();
    if (!hasDesktopNotifications(mode)) return;
    const unsubscribe = window.desktopBridge?.onNotificationBadgeClear?.(clear);
    window.addEventListener("focus", clear);
    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", clear);
      clear();
    };
  }, [mode]);

  useEffect(() => {
    if (!hasNotificationSound(mode)) return;
    document.addEventListener("pointerdown", unlockNotificationAudio);
    document.addEventListener("keydown", unlockNotificationAudio);
    return () => {
      document.removeEventListener("pointerdown", unlockNotificationAudio);
      document.removeEventListener("keydown", unlockNotificationAudio);
    };
  }, [mode]);

  if (mode === "off" && !inAppNotificationsEnabled) return null;

  return environmentIds.map((environmentId) => (
    <EnvironmentNotifications
      key={environmentId}
      environmentId={environmentId}
      // The active workspace belongs to the primary environment; others use their default.
      scope={
        environmentId === workspace.environmentId
          ? workspace.scopeReady
            ? workspace.scope
            : null
          : NO_SCOPE
      }
      onNotification={onNotification}
    />
  ));
}

interface NotificationState {
  readonly raw: OrchestrationV2ThreadShell;
  readonly subagentRequest: PendingSubagentRequest | null;
  readonly attention: string | null;
  readonly completion: number | null;
}

type ThreadNotificationKind = "input" | "completion";

function threadEventType(
  kind: ThreadNotificationKind,
  status: string,
  isDelegatedChild: boolean,
): string {
  if (kind === "completion") return isDelegatedChild ? "agent.child_finished" : "agent.finished";
  if (status === "approval") return "agent.needs_permission";
  if (status === "limited") return "agent.usage_limit";
  if (status === "failed") return "agent.failed";
  return "agent.needs_input";
}

function leadingIcon(event: FeedEvent) {
  if (event.level === "info")
    return <CircleCheckIcon aria-hidden className="size-4 text-success-foreground" />;
  if (event.level === "failed")
    return <CircleAlertIcon aria-hidden className="size-4 text-destructive-foreground" />;
  if (event.type === "agent.needs_permission")
    return <ShieldQuestionIcon aria-hidden className="size-4 text-warning-foreground" />;
  return <MessageCircleQuestionIcon aria-hidden className="size-4 text-info-foreground" />;
}

/** Shows one new feed event: a toast while the window shows, a Windows notification while hidden. */
function usePresentFeedEvent(
  environmentId: EnvironmentId,
  onNotification: (environmentId: EnvironmentId, notification: Notification) => void,
) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const active = useRef(params);
  useEffect(() => {
    active.current = params;
  }, [params]);

  return useCallback(
    (event: FeedEvent) => {
      // The type's rule (Settings in Notifications): only Toast pops up, sounds or notifies.
      if (!popsUp(event, useEventFeedStore.getState().typeRules)) return;
      const settings = getClientSettings();
      const quiet = isInNotificationQuietHours(settings);
      if (hasNotificationSound(settings.notificationMode) && !quiet) {
        void playNotificationSound(
          event.level === "info" ? "completion" : "input",
          () =>
            hasNotificationSound(getClientSettings().notificationMode) &&
            !isInNotificationQuietHours(getClientSettings()),
          settings.notificationVolume,
        );
      }
      const thread = event.target?.thread;
      const open = () => openFeedEvent(event, environmentId, navigate);
      if (document.visibilityState === "hidden") {
        if (
          !hasDesktopNotifications(settings.notificationMode) ||
          quiet ||
          typeof Notification === "undefined" ||
          Notification.permission !== "granted"
        )
          return;
        try {
          const notification = new Notification(event.title, {
            ...(event.body === undefined ? {} : { body: event.body }),
            tag: `${environmentId}:${thread ?? event.id}`,
            silent: true,
          });
          onNotification(environmentId, notification);
          notification.addEventListener("click", () => {
            notification.close();
            window.focus();
            open();
          });
        } catch {
          // Some browsers expose Notification but reject desktop presentation.
        }
        return;
      }
      if (!settings.inAppNotificationsEnabled) return;
      if (
        thread !== undefined &&
        active.current.environmentId === environmentId &&
        active.current.threadId === thread
      )
        return;
      const target = feedEventOpenTarget(event);
      const toastId = toastManager.add({
        type:
          event.level === "failed" ? "error" : event.level === "needs_you" ? "warning" : "success",
        title: event.title,
        ...(event.body === undefined ? {} : { description: event.body }),
        data: { hideCopyButton: true, leadingIcon: leadingIcon(event) },
        ...(target === null
          ? {}
          : {
              actionProps: {
                children: event.actions?.[0]?.label ?? ("thread" in target ? "Open chat" : "Open"),
                onClick: () => {
                  toastManager.close(toastId);
                  open();
                },
              },
            }),
      });
    },
    [environmentId, navigate, onNotification],
  );
}

function EnvironmentNotifications({
  environmentId,
  scope,
  onNotification,
}: {
  environmentId: EnvironmentId;
  /** null until the active workspace is known. */
  scope: EventsSubscribeInput | null;
  onNotification: (environmentId: EnvironmentId, notification: Notification) => void;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  const threads =
    shell.status === "live" && Option.isSome(shell.snapshot) ? shell.snapshot.value.threads : null;
  const previous = useRef(new Map<ThreadId, NotificationState>());
  const present = usePresentFeedEvent(environmentId, onNotification);
  const runAppend = useAtomCommand(eventsAppend, { reportFailure: false });
  const feedAtom = useMemo(
    () => (scope === null ? null : eventFeedLive({ environmentId, input: scope })),
    [environmentId, scope],
  );
  const feed = useEnvironmentQuery(feedAtom);

  useEffect(() => {
    if (feed.data) {
      useEventFeedStore.getState().setFeedIds(
        environmentId,
        feed.data.events.map((event) => event.id),
      );
    }
    return () => useEventFeedStore.getState().setFeedIds(environmentId, null);
  }, [environmentId, feed.data]);

  // Thread triggers go through the feed. With no AIOS to write to, or no feed listening yet
  // (workspace still loading), they also show directly so none is lost.
  const emit = useCallback(
    (draft: FeedEventDraft) => {
      void runAppend({ environmentId, input: { ...scope, event: draft } }).then((result) => {
        if (result._tag !== "Success" || scope === null) present(completeFeedEvent(draft));
      });
    },
    [environmentId, present, runAppend, scope],
  );

  useEffect(() => {
    for (const event of feed.data?.fresh ?? []) present(event);
  }, [feed.data, present]);

  useEffect(() => {
    if (threads === null) {
      previous.current.clear();
      return;
    }
    const next = new Map<ThreadId, NotificationState>();
    const subagentRequests = pendingSubagentRequestsByThread(threads);
    for (const rawThread of threads) {
      const isDelegatedChild = rawThread.lineage.relationshipToParent === "subagent";
      const prior = previous.current.get(rawThread.id);
      const subagentRequest = subagentRequests.get(rawThread.id) ?? null;
      if (prior?.raw === rawThread && prior.subagentRequest === subagentRequest) {
        next.set(rawThread.id, prior);
        continue;
      }
      const thread = presentThreadShell(environmentId, rawThread, subagentRequest);
      let status = resolveSidebarThreadStatus(thread);
      if (status === "ready" && thread.latestRun?.status === "failed") status = "failed";
      const attention =
        status === "input" || status === "approval" || status === "failed" || status === "limited"
          ? `${thread.latestRun?.runId ?? ""}:${status}`
          : null;
      const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
      const completion =
        status === "ready" &&
        thread.latestRun?.status === "completed" &&
        Number.isFinite(completedAt)
          ? completedAt
          : (prior?.completion ?? null);
      next.set(thread.id, { raw: rawThread, subagentRequest, attention, completion });
      if (!prior || thread.archivedAt !== null) continue;
      const kind: ThreadNotificationKind | null =
        attention && attention !== prior.attention
          ? "input"
          : completion !== null && (prior.completion === null || completion > prior.completion)
            ? "completion"
            : null;
      if (!kind) continue;
      // Children report completion; their parent owns approval and input requests.
      if (isDelegatedChild && kind !== "completion") continue;
      const startedAt = Date.parse(thread.latestRun?.startedAt ?? "");
      if (
        kind === "completion" &&
        !isDelegatedChild &&
        (!Number.isFinite(startedAt) || completedAt - startedAt < 120_000)
      )
        continue;
      const title =
        kind === "completion"
          ? isDelegatedChild
            ? "Delegated task completed"
            : "Chat completed"
          : status === "approval"
            ? "Permission needed"
            : status === "limited"
              ? "Usage limit reached"
              : status === "failed"
                ? "Chat failed"
                : "Input needed";
      emit({
        level: kind === "completion" ? "info" : status === "failed" ? "failed" : "needs_you",
        type: threadEventType(kind, status, isDelegatedChild),
        title,
        body: thread.title.slice(0, 500),
        actor: { kind: "app", name: "Leonidas" },
        target: { thread: thread.id },
        actions: [{ label: "Open chat", kind: "open_thread", ref: thread.id }],
        // Two open clients both write the trigger; the fold keeps it to one event.
        dedupe: `${environmentId}:${thread.id}:${kind === "completion" ? completion : attention}`,
      });
    }
    previous.current = next;
  }, [emit, environmentId, threads]);

  return null;
}
