import type { WorkspaceOrg } from "@t3tools/contracts";

type Member = WorkspaceOrg["members"][number];
type Area = WorkspaceOrg["areas"][number];

/** What the Team view is filtered on: one Department, Area or Member (ADR-0088 "lens"). */
export type TeamLens = {
  readonly kind: "department" | "area" | "member";
  readonly slug: string;
} | null;

export interface TeamGroup {
  readonly key: string;
  /** Empty for the group of Areas and Members that name no known Department. */
  readonly name: string;
  readonly leads: ReadonlyArray<string>;
  readonly areas: ReadonlyArray<Area>;
  readonly members: ReadonlyArray<Member>;
}

const UNASSIGNED = "__none__";

/**
 * One group for each Department, plus one for whatever names no known Department, so no Area and
 * no Member falls out of the map. A removed Member is not drawn.
 */
export function buildTeamGroups(org: WorkspaceOrg): ReadonlyArray<TeamGroup> {
  const known = new Set(org.departments.map((department) => department.slug));
  const keyOf = (department: string) => (known.has(department) ? department : UNASSIGNED);
  const members = org.members.filter((member) => member.status !== "removed");
  const groups: TeamGroup[] = org.departments.map((department) => ({
    key: department.slug,
    name: department.name,
    leads: department.leads.map((lead) => org.members.find((m) => m.slug === lead)?.name ?? lead),
    areas: org.areas.filter((area) => keyOf(area.department) === department.slug),
    members: members.filter((member) => keyOf(member.department) === department.slug),
  }));
  const areas = org.areas.filter((area) => keyOf(area.department) === UNASSIGNED);
  const rest = members.filter((member) => keyOf(member.department) === UNASSIGNED);
  if (areas.length > 0 || rest.length > 0) {
    groups.push({ key: UNASSIGNED, name: "", leads: [], areas, members: rest });
  }
  return groups;
}

const areasOfDepartment = (org: WorkspaceOrg, slug: string) =>
  org.areas.filter((area) => area.department === slug).map((area) => area.slug);

/** True when the Member belongs in the lens. No lens keeps everyone. */
export function memberInLens(org: WorkspaceOrg, lens: TeamLens, member: Member): boolean {
  if (!lens) return true;
  if (lens.kind === "member") return member.slug === lens.slug || member.owner === lens.slug;
  if (lens.kind === "area") return lens.slug in member.roles;
  return (
    member.department === lens.slug ||
    areasOfDepartment(org, lens.slug).some((area) => area in member.roles)
  );
}

/** True when the Area belongs in the lens. */
export function areaInLens(org: WorkspaceOrg, lens: TeamLens, area: Area): boolean {
  if (!lens) return true;
  if (lens.kind === "area") return area.slug === lens.slug;
  if (lens.kind === "department") return area.department === lens.slug;
  const member = org.members.find((candidate) => candidate.slug === lens.slug);
  return member ? area.slug in member.roles : false;
}

/** True when the Department group belongs in the lens. */
export function groupInLens(org: WorkspaceOrg, lens: TeamLens, group: TeamGroup): boolean {
  if (!lens) return true;
  return (
    group.areas.some((area) => areaInLens(org, lens, area)) ||
    group.members.some((member) => memberInLens(org, lens, member)) ||
    (lens.kind === "department" && group.key === lens.slug)
  );
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
