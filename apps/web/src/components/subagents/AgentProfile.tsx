import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useState } from "react";

import ChatView from "~/components/ChatView";
import { useHomeThread } from "~/components/home/HomeChat";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { subagentsCatalogQuery } from "~/state/subagents";

import { AgentAvatar } from "./Avatar";
import { entryAvatar, groupStudioEntries } from "./subagentStudio.logic";

const LEAD_AVATAR = "felt/team-lead";

/**
 * The agent profile: a chats sidebar (the lead first, then the team) next to the lead's chat. The
 * sidebar folds to an avatar strip. The Activity panel joins on the right in the next slice.
 */
export function AgentProfile() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const catalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsCatalogQuery({ environmentId, input: scope }) : null,
  );
  const home = useHomeThread();
  const [collapsed, setCollapsed] = useState(false);
  const groups = groupStudioEntries(catalog.data?.entries ?? [], "");
  const lead = groups.find((group) => group.key === "lead")?.entries[0];
  const team = groups.find((group) => group.key === "on")?.entries ?? [];
  const rows = [
    { id: "lead", name: lead?.name ?? "Leo", avatar: lead ? entryAvatar(lead) : LEAD_AVATAR },
    ...team.map((entry) => ({ id: entry.specPath, name: entry.name, avatar: entryAvatar(entry) })),
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <nav
        aria-label="Agent chats"
        className={cn(
          "flex shrink-0 flex-col gap-1 border-r border-border p-2",
          collapsed ? "w-14 items-center" : "w-60",
        )}
      >
        <Button
          size="icon-sm"
          variant="ghost"
          className={collapsed ? undefined : "self-end"}
          aria-label={collapsed ? "Show chats" : "Hide chats"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {rows.map((row, index) => (
            <li
              key={row.id}
              aria-current={index === 0 ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                index === 0 ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    <AgentAvatar avatar={row.avatar} name={row.name} size={36} />
                    <span className="sr-only">{row.name}</span>
                  </TooltipTrigger>
                  <TooltipPopup>{row.name}</TooltipPopup>
                </Tooltip>
              ) : (
                <>
                  <AgentAvatar avatar={row.avatar} name={row.name} size={36} />
                  <span>{row.name}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {home.environmentId !== null && home.threadId !== null ? (
          <ChatView
            key={home.threadId}
            environmentId={home.environmentId}
            threadId={home.threadId}
            routeKind="server"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {home.message === null ? <Spinner /> : home.message}
          </div>
        )}
      </section>
    </div>
  );
}
