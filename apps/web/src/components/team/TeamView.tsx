import type { WorkspaceOrg } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import { BotIcon, MessageSquareIcon, PencilIcon, PlusIcon, ShieldIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogPopup } from "~/components/ui/dialog";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { cn } from "~/lib/utils";
import { useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";
import { useEnvironmentQuery } from "~/state/query";
import { workspaceOrgQuery } from "~/state/taskBoard";
import { MemberEditor, type EditorTarget } from "./MemberEditor";
import { RolesEditor } from "./RolesEditor";
import { InviteCards, WelcomeCard } from "./InviteFlow";
import { ProposalCards } from "./ProposalCards";
import { LensWorkList } from "./LensWorkList";
import { agentStatusLine, agentWork, lensLabel } from "./teamLens.logic";
import { useTeamLens } from "./TeamLensContext";
import { useLensWork } from "./useLensWork";
import {
  areaInLens,
  buildTeamGroups,
  groupInLens,
  initials,
  memberInLens,
  type TeamGroup,
  type TeamLens,
} from "./teamView.logic";

// Motion values come from design/motion-language.md: entrance 240ms, ease-out, rise 12px, stagger
// 60ms capped at the sixth item, micro 150ms. Only opacity and transform move.
const STAGGER_MS = 60;
const STAGGER_CAP = 6;
const rise = (index: number) => ({
  transitionDelay: `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`,
});
const ENTER =
  "transition-[opacity,transform] duration-[240ms] ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:translate-y-0 motion-reduce:starting:opacity-100";
const NODE =
  "rounded-md border text-left outline-none transition-[opacity,background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

type Member = WorkspaceOrg["members"][number];

/** What an agent row shows: one status line, and the chat to open when its task links one. */
interface AgentRow {
  readonly line: string;
  readonly chat: ReturnType<typeof buildThreadRouteParams> | null;
}

const isLens = (lens: TeamLens, kind: NonNullable<TeamLens>["kind"], slug: string) =>
  lens?.kind === kind && lens.slug === slug;

function MemberNode(props: {
  readonly member: Member;
  readonly lens: TeamLens;
  readonly org: WorkspaceOrg;
  readonly index: number;
  readonly onLens: (lens: TeamLens) => void;
  readonly onEdit?: ((member: Member) => void) | undefined;
  readonly agent?: AgentRow | undefined;
  /** The Member who uses this computer, and whether they just joined. */
  readonly you?: { readonly slug: string; readonly lit: boolean } | null | undefined;
}) {
  const { member, lens, org, index, onLens, onEdit, agent, you } = props;
  const isYou = you?.slug === member.slug;
  const active = isLens(lens, "member", member.slug);
  const dimmed = !memberInLens(org, lens, member);
  const statusText = `${
    member.kind === "agent" ? `Agent of ${member.owner || "no one"}` : "Person"
  } · ${agent ? agent.line : member.status === "invited" ? "Invited" : "Active"}${
    Object.keys(member.roles).length > 0
      ? ` · ${Object.entries(member.roles)
          .map(([area, role]) => `${role} in ${area}`)
          .join(", ")}`
      : ""
  }`;
  return (
    <li
      className={cn(ENTER, "flex min-w-0 items-stretch gap-1", dimmed && "opacity-35")}
      style={rise(index)}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onLens(active ? null : { kind: "member", slug: member.slug })}
        className={cn(
          NODE,
          "flex min-w-0 flex-1 items-center gap-3 px-3 py-2",
          active ? "border-primary bg-primary/8" : "hover:bg-accent",
          isYou && you?.lit && "motion-safe:animate-[pulse_1.2s_ease-out_3] ring-2 ring-primary/50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center bg-muted text-xs font-medium",
            member.kind === "agent" ? "rounded-md" : "rounded-full",
          )}
        >
          {member.kind === "agent" ? <BotIcon className="size-4" /> : initials(member.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span
            title={member.name}
            className="block text-sm font-medium max-sm:break-words sm:truncate"
          >
            {member.name}
            {isYou ? <span className="ml-1.5 text-xs text-muted-foreground">You</span> : null}
          </span>
          <span
            title={statusText}
            className="block text-xs text-muted-foreground max-sm:break-words sm:truncate"
          >
            {statusText}
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            member.status === "invited" ? "bg-warning" : "bg-success",
          )}
        />
      </button>
      {agent?.chat ? (
        <Link
          to="/$environmentId/$threadId"
          params={agent.chat}
          aria-label={`Open the chat of ${member.name}`}
          className={cn(NODE, "grid w-9 shrink-0 place-items-center hover:bg-accent")}
        >
          <MessageSquareIcon aria-hidden className="size-3.5" />
        </Link>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          aria-label={`Edit ${member.name}`}
          onClick={() => onEdit(member)}
          className={cn(NODE, "grid w-9 shrink-0 place-items-center hover:bg-accent")}
        >
          <PencilIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}

function Group(props: {
  readonly group: TeamGroup;
  readonly org: WorkspaceOrg;
  readonly lens: TeamLens;
  readonly index: number;
  readonly onLens: (lens: TeamLens) => void;
  readonly onEdit?: ((member: Member) => void) | undefined;
  readonly agents: ReadonlyMap<string, AgentRow>;
  readonly you?: { readonly slug: string; readonly lit: boolean } | null | undefined;
}) {
  const { group, org, lens, index, onLens, onEdit, agents, you } = props;
  const dimmed = !groupInLens(org, lens, group);
  const heading = group.name || "Not in a Department";
  const departmentActive = group.name !== "" && isLens(lens, "department", group.key);
  return (
    <section
      aria-labelledby={`team-group-${group.key}`}
      className={cn("rounded-lg border p-4", ENTER, dimmed && "opacity-35")}
      style={rise(index)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={`team-group-${group.key}`} className="text-sm font-medium">
          {group.name ? (
            <button
              type="button"
              aria-pressed={departmentActive}
              onClick={() =>
                onLens(departmentActive ? null : { kind: "department", slug: group.key })
              }
              className={cn(
                NODE,
                "border-transparent px-1.5 py-0.5 hover:bg-accent",
                departmentActive && "border-primary bg-primary/8",
              )}
            >
              {heading}
            </button>
          ) : (
            heading
          )}
        </h4>
        {group.leads.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">Led by {group.leads.join(", ")}</p>
        ) : null}
      </div>
      {group.areas.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Areas in ${heading}`}>
          {group.areas.map((area) => {
            const active = isLens(lens, "area", area.slug);
            return (
              <li
                key={area.slug}
                className={cn(
                  !areaInLens(org, lens, area) && "opacity-35",
                  "transition-opacity duration-150 motion-reduce:transition-none",
                )}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onLens(active ? null : { kind: "area", slug: area.slug })}
                  className={cn(
                    NODE,
                    "px-2.5 py-1 text-xs",
                    active ? "border-primary bg-primary/8" : "hover:bg-accent",
                  )}
                >
                  {area.name}
                  <span className="ml-1.5 text-muted-foreground">
                    {area.status === "archived" ? "archived" : area.sensitivity}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {group.members.length > 0 ? (
        <ul className="mt-3 grid gap-2" aria-label={`Members in ${heading}`}>
          {group.members.map((member, i) => (
            <MemberNode
              key={member.slug}
              member={member}
              lens={lens}
              org={org}
              index={i + 1}
              onLens={onLens}
              onEdit={onEdit}
              agent={agents.get(member.slug)}
              you={you}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** What the lens covers, in one plain line for the live region. */
function lensSummary(org: WorkspaceOrg, lens: NonNullable<TeamLens>): string {
  const label = lensLabel(org, lens);
  const count = org.members.filter(
    (member) => member.status !== "removed" && memberInLens(org, lens, member),
  ).length;
  return `${label}: ${count} ${count === 1 ? "Member" : "Members"}`;
}

/**
 * The animated map of a business workspace: Departments, their Areas, and the Members and agents
 * who work in them (ADR-0088). A click on a node sets the lens and dims the rest. It renders
 * nothing for a personal workspace, and a friendly empty state for a business with no Member yet.
 */
export function TeamView() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady, active } = useActiveAiosWorkspace();
  const { data, refresh } = useEnvironmentQuery(
    environmentId && scopeReady ? workspaceOrgQuery({ environmentId, input: scope }) : null,
  );
  const { lens, setLens } = useTeamLens();
  const work = useLensWork({ poll: true });
  const threads = useThreadShells();
  const agents = useMemo(() => {
    const rows = new Map<string, AgentRow>();
    for (const member of work.org?.members ?? []) {
      if (member.kind !== "agent" || member.status === "removed") continue;
      const doing = agentWork(member, work.tasks, work.team);
      const threadId = doing.task?.claimedAgent?.threadId;
      const thread = threadId ? threads.find((candidate) => candidate.id === threadId) : undefined;
      rows.set(member.slug, {
        line: agentStatusLine(doing, thread ? resolveSidebarThreadStatus(thread) : null),
        chat: thread
          ? buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id))
          : null,
      });
    }
    return rows;
  }, [work.org, work.tasks, work.team, threads]);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  if (!data) return null;
  const org = data.org;
  if (!org) {
    return active?.type === "business" ? (
      <section aria-labelledby="team-view-title" className="rounded-lg border p-4">
        <h3 id="team-view-title" className="text-sm font-medium">
          Team
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No one is on this team yet. Ask the business AI to add the first Member, or send an
          invite.
        </p>
      </section>
    ) : null;
  }
  const groups = buildTeamGroups(org);
  const me = data.me;
  const scopeRef = scope as { readonly workspaceId?: string };
  // First open of an invited person: the welcome comes before the map.
  if (me?.invited && environmentId) {
    return (
      <WelcomeCard
        environmentId={environmentId}
        scope={scopeRef}
        org={org}
        slug={me.slug}
        onJoined={() => {
          setJustJoined(true);
          refresh();
        }}
      />
    );
  }
  const you = me ? { slug: me.slug, lit: justJoined } : null;
  return (
    <section aria-labelledby="team-view-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="team-view-title" className="text-sm font-medium">
          Team{org.name ? `: ${org.name}` : ""}
        </h3>
        <div className="flex items-center gap-2">
          <div
            role="status"
            className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground"
          >
            {lens ? (
              <>
                <span>{lensSummary(org, lens)}</span>
                <button
                  type="button"
                  onClick={() => setLens(null)}
                  aria-label="Clear the filter"
                  className={cn(
                    NODE,
                    "grid size-6 place-items-center border-transparent hover:bg-accent",
                  )}
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              </>
            ) : null}
          </div>
          {me?.canDecide ? (
            <Button size="sm" variant="outline" onClick={() => setRolesOpen(true)}>
              <ShieldIcon aria-hidden />
              Roles
            </Button>
          ) : null}
          {me ? (
            <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "add" })}>
              <PlusIcon aria-hidden />
              Add Member
            </Button>
          ) : null}
        </div>
      </div>
      {environmentId ? (
        <ProposalCards
          environmentId={environmentId}
          scope={scopeRef}
          proposals={data.proposals}
          canDecide={me?.canDecide ?? false}
          onDecided={refresh}
        />
      ) : null}
      {environmentId && data.invites.length > 0 ? (
        <InviteCards
          environmentId={environmentId}
          scope={scopeRef}
          invites={data.invites}
          onChanged={refresh}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group, i) => (
          <Group
            key={group.key}
            you={you}
            group={group}
            org={org}
            lens={lens}
            index={i}
            onLens={setLens}
            onEdit={me ? (member) => setEditor({ mode: "edit", member }) : undefined}
            agents={agents}
          />
        ))}
      </div>
      {work.lens ? (
        <LensWorkList label={work.lens.label} tasks={work.lens.tasks} team={work.team} />
      ) : null}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogPopup>
          {editor && environmentId ? (
            <MemberEditor
              key={editor.mode === "edit" ? editor.member.slug : "add"}
              environmentId={environmentId}
              scope={scopeRef}
              org={org}
              target={editor}
              canRemove={me?.canDecide ?? false}
              onDone={(changed) => {
                setEditor(null);
                if (changed) refresh();
              }}
            />
          ) : null}
        </DialogPopup>
      </Dialog>
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogPopup className="max-w-2xl">
          {rolesOpen && environmentId ? (
            <RolesEditor
              environmentId={environmentId}
              scope={scopeRef}
              org={org}
              onDone={(changed) => {
                setRolesOpen(false);
                if (changed) refresh();
              }}
            />
          ) : null}
        </DialogPopup>
      </Dialog>
    </section>
  );
}
