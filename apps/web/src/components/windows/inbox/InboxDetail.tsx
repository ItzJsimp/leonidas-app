import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import type { Ref } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useEventFeedStore } from "~/eventFeedStore";
import { ruleFor, typeLabel } from "~/notificationRules";
import { buildThreadRouteParams } from "~/threadRoutes";

import { changedLabel } from "../../twoState/areaRows";
import { plainEventCause, plainEventTitle } from "../../twoState/eventText";
import { actionLabel, type MergedFeedEvent } from "../../twoState/railFeed";
import { Tip } from "../../twoState/Tip";
import { eventKind, linkedThreadId, type InboxSourceMeta } from "./inbox.logic";
import { RuleControl } from "./NotificationRules";

/** On-demand inspector for one notification: repeat summary, primary action, cause, and rule. */
export function InboxDetail({
  event,
  source,
  read,
  now,
  environmentId,
  narrow,
  onClose,
  onOpen,
  onMarkRead,
  onDismiss,
  headingRef,
}: {
  readonly event: MergedFeedEvent;
  readonly source: InboxSourceMeta;
  readonly read: boolean;
  readonly now: number;
  readonly environmentId?: EnvironmentId | null;
  readonly narrow: boolean;
  readonly onClose: () => void;
  readonly onOpen: () => void;
  readonly onMarkRead: () => void;
  readonly onDismiss: () => void;
  readonly headingRef: Ref<HTMLHeadingElement>;
}) {
  const label = actionLabel(event);
  const files = event.target?.files ?? [];
  const title = plainEventTitle(event.title);
  const cause = plainEventCause(event);
  const threadId = linkedThreadId(event);
  const rule = useEventFeedStore((store) => ruleFor(event, store.typeRules));
  const setTypeRule = useEventFeedStore((store) => store.setTypeRule);
  const kind = typeLabel(event.type);
  const failed = eventKind(event) === "failed";
  const latestLabel = changedLabel(Date.parse(event.ts), now);
  const firstLabel = changedLabel(Date.parse(event.firstTs), now);
  const sourceText = source.threadTitle
    ? `${source.project} · ${source.threadTitle}`
    : source.project;

  return (
    <article
      aria-label={title}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {narrow ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button size="xs" variant="ghost-muted" onClick={onClose}>
                <ArrowLeftIcon aria-hidden />
                Back
              </Button>
              {event.count > 1 ? (
                <Badge size="sm" variant={failed ? "error" : "secondary"}>
                  x{event.count}
                </Badge>
              ) : null}
            </div>
          ) : null}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold leading-snug text-foreground outline-hidden"
          >
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {sourceText} · {latestLabel}
          </p>
        </div>
        {narrow ? null : (
          <div className="flex shrink-0 items-center gap-1.5">
            {event.count > 1 ? (
              <Badge size="sm" variant={failed ? "error" : "secondary"}>
                x{event.count}
              </Badge>
            ) : null}
            <Tip text="Close inspector (Esc)">
              <Button size="icon-xs" variant="ghost" aria-label="Close inspector" onClick={onClose}>
                <XIcon aria-hidden />
              </Button>
            </Tip>
          </div>
        )}
      </div>

      {event.count > 1 ? (
        <p
          className={
            failed
              ? "mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground tabular-nums"
              : "mt-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-muted-foreground tabular-nums"
          }
        >
          Merged {event.count} duplicate alerts · First {firstLabel} · Latest {latestLabel}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {label !== null ? (
          <Button size="sm" variant="default" onClick={onOpen}>
            {label}
          </Button>
        ) : null}
        {read ? null : (
          <Button size="sm" variant="outline" onClick={onMarkRead}>
            Mark read
          </Button>
        )}
        <Button size="sm" variant="ghost-muted" onClick={onDismiss}>
          {event.count > 1 ? `Dismiss all ${event.count}` : "Dismiss"}
        </Button>
      </div>

      {cause ? (
        <p className="mt-4 rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed break-words text-foreground">
          {cause}
        </p>
      ) : null}

      {threadId && environmentId && label !== "Open chat" ? (
        <Link
          to="/$environmentId/$threadId"
          params={buildThreadRouteParams(scopeThreadRef(environmentId, threadId as ThreadId))}
          className="mt-3 w-fit rounded-sm text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Open linked chat
        </Link>
      ) : null}

      {files.length > 0 ? (
        <p className="mt-3 text-xs break-words text-muted-foreground">{files.join(", ")}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <div className="min-w-0 flex-1 basis-36">
          <p className="text-xs font-medium text-foreground">{kind}</p>
          <p className="truncate text-xs text-muted-foreground">{event.actor.name}</p>
        </div>
        <RuleControl
          type={event.type}
          label={kind}
          rule={rule}
          onPick={(next, before) => {
            if (next !== "off") return;
            const toastId = toastManager.add({
              type: "info",
              title: `${kind} is off`,
              description: "Turn it back on in Rules.",
              actionProps: {
                children: "Undo",
                onClick: () => {
                  setTypeRule(event.type, before);
                  toastManager.close(toastId);
                },
              },
            });
          }}
        />
      </div>
    </article>
  );
}
