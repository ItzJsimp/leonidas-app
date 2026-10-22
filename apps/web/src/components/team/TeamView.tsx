import type { WorkspaceOrg } from "@t3tools/contracts";
import { BotIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { workspaceOrgQuery } from "~/state/taskBoard";
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

const isLens = (lens: TeamLens, kind: NonNullable<TeamLens>["kind"], slug: string) =>
  lens?.kind === kind && lens.slug === slug;

function MemberNode(props: {
  readonly member: Member;
  readonly lens: TeamLens;
  readonly org: WorkspaceOrg;
  readonly index: number;
  readonly onLens: (lens: TeamLens) => void;
}) {
  const { member, lens, org, index, onLens } = props;
  const active = isLens(lens, "member", member.slug);
  const dimmed = !memberInLens(org, lens, member);
  return (
    <li className={cn(ENTER, dimmed && "opacity-35")} style={rise(index)}>
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onLens(active ? null : { kind: "member", slug: member.slug })}
        className={cn(
          NODE,
          "flex w-full items-center gap-3 px-3 py-2",
          active ? "border-primary bg-primary/8" : "hover:bg-accent",
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
          <span className="block truncate text-sm font-medium">{member.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {member.kind === "agent" ? `Agent of ${member.owner || "no one"}` : "Person"}
            {" · "}
            {member.status === "invited" ? "Invited" : "Active"}
            {Object.keys(member.roles).length > 0
              ? ` · ${Object.entries(member.roles)
                  .map(([area, role]) => `${role} in ${area}`)
                  .join(", ")}`
              : ""}
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
    </li>
  );
}

function Group(props: {
  readonly group: TeamGroup;
  readonly org: WorkspaceOrg;
  readonly lens: TeamLens;
  readonly index: number;
  readonly onLens: (lens: TeamLens) => void;
}) {
  const { group, org, lens, index, onLens } = props;
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
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** What the lens covers, in one plain line for the live region. */
function lensSummary(org: WorkspaceOrg, lens: NonNullable<TeamLens>): string {
  const label =
    lens.kind === "department"
      ? (org.departments.find((d) => d.slug === lens.slug)?.name ?? lens.slug)
      : lens.kind === "area"
        ? (org.areas.find((a) => a.slug === lens.slug)?.name ?? lens.slug)
        : (org.members.find((m) => m.slug === lens.slug)?.name ?? lens.slug);
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
  const { data } = useEnvironmentQuery(
    environmentId && scopeReady ? workspaceOrgQuery({ environmentId, input: scope }) : null,
  );
  const [lens, setLens] = useState<TeamLens>(null);
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
  return (
    <section aria-labelledby="team-view-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="team-view-title" className="text-sm font-medium">
          Team{org.name ? `: ${org.name}` : ""}
        </h3>
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
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group, i) => (
          <Group key={group.key} group={group} org={org} lens={lens} index={i} onLens={setLens} />
        ))}
      </div>
    </section>
  );
}
