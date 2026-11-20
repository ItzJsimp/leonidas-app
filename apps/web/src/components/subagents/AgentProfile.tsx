import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useState } from "react";

import ChatView from "~/components/ChatView";
import { useProfileThread } from "~/components/home/HomeChat";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { subagentsCatalogQuery } from "~/state/subagents";

import { AgentActivity } from "./AgentActivity";
import { AgentAvatar } from "./Avatar";
import { entryAvatar, groupStudioEntries } from "./subagentStudio.logic";

const LEAD_AVATAR = "felt/team-lead";
const LEAD_ID = "lead";

interface ChatRowData {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
}

function ChatRow(props: {
  readonly row: ChatRowData;
  readonly active: boolean;
  readonly collapsed: boolean;
  readonly onSelect: () => void;
}) {
  const { row, active, collapsed } = props;
  const className = cn(
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
  );
  const body = (
    <>
      <AgentAvatar avatar={row.avatar} name={row.name} size={36} />
      {collapsed ? (
        <span className="sr-only">{row.name}</span>
      ) : (
        <span className="truncate">{row.name}</span>
      )}
    </>
  );
  const button = (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      className={className}
      onClick={props.onSelect}
    >
      {body}
    </button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{row.name}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The agent profile: a chats sidebar (the lead first, then the team) next to the chosen chat. The
 * lead's chat is the Home chat. Each team agent has its own chat. The sidebar folds to an avatar
 * strip. The Activity panel sits on the right.
 */
export function AgentProfile() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const catalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsCatalogQuery({ environmentId, input: scope }) : null,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState(LEAD_ID);
  const groups = groupStudioEntries(catalog.data?.entries ?? [], "");
  const lead = groups.find((group) => group.key === "lead")?.entries[0];
  const team = groups.find((group) => group.key === "on")?.entries ?? [];
  const rows: ReadonlyArray<ChatRowData> = [
    { id: LEAD_ID, name: lead?.name ?? "Leo", avatar: lead ? entryAvatar(lead) : LEAD_AVATAR },
    ...team.map((entry) => ({ id: entry.specPath, name: entry.name, avatar: entryAvatar(entry) })),
  ];
  // An agent that was turned off or deleted while selected falls back to the lead.
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]!;
  const chat = useProfileThread(selected.id === LEAD_ID ? null : selected.name);

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
        <ul className="flex min-h-0 w-full flex-col gap-1 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id}>
              <ChatRow
                row={row}
                active={row.id === selected.id}
                collapsed={collapsed}
                onSelect={() => setSelectedId(row.id)}
              />
            </li>
          ))}
        </ul>
      </nav>
      <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {chat.environmentId !== null && chat.threadId !== null ? (
          <ChatView
            key={chat.threadId}
            environmentId={chat.environmentId}
            threadId={chat.threadId}
            routeKind="server"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {chat.message === null ? <Spinner /> : chat.message}
          </div>
        )}
      </section>
      <AgentActivity />
    </div>
  );
}
