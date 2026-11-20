import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { chatQuotaLineFor } from "./chatQuotaLine.logic";

/** Wait for the server to store the reading that moved the bar before asking for it. */
const READ_DELAY_MS = 1_500;

/**
 * How much of the account's plan limit this chat used, inside the Limits section. `refreshKey`
 * changes when a limit bar moves, which is when the chat's share changed too.
 */
export function ThreadDetailsChatQuota({
  environmentId,
  threadId,
  instanceId,
  refreshKey,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly refreshKey: string;
}) {
  const query = useEnvironmentQuery(
    threadId ? serverEnvironment.chatQuota({ environmentId, input: { threadId } }) : null,
  );
  const { refresh } = query;
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    const timer = setTimeout(refresh, READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [refreshKey, refresh]);

  const view = chatQuotaLineFor(query.data, instanceId);
  if (!view) return null;
  const parts = [
    view.fiveHour === null ? null : `${view.fiveHour}% of 5-hour`,
    view.weekly === null ? null : `${view.weekly}% of weekly`,
  ].filter((part) => part !== null);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <p
            className="px-0.5 text-2xs tabular-nums text-muted-foreground"
            data-testid="chat-quota"
          />
        }
      >
        This chat used {view.shared ? "up to " : ""}
        <span className="font-medium text-foreground">{parts.join(" · ")}</span>
      </TooltipTrigger>
      <TooltipPopup side="top">
        {view.shared
          ? "Estimated from how your limit moved while this chat ran. Another chat or device may have used part of it."
          : "Estimated from how your limit moved while this chat ran."}
      </TooltipPopup>
    </Tooltip>
  );
}
