import type { WorkspaceOrg, WorkspaceOrgChange } from "@t3tools/contracts";

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

type RoleRow = WorkspaceOrg["roles"][number];
type RoleChangeDef = Extract<WorkspaceOrgChange, { kind: "setRoleDef" | "removeRoleDef" }>;

/** The four Roles that ship. Owner is locked and none of the four can be removed. */
export const SHIPPED_ROLES = ["Viewer", "Member", "Admin", "Owner"] as const;

/** The Roles a Member may hold. An agent never holds a Role that manages the org (ADR-0088). */
export const rolesFor = (
  kind: "person" | "agent",
  roles: ReadonlyArray<RoleRow>,
): ReadonlyArray<string> =>
  roles.filter((role) => kind === "person" || role.manage !== "org").map((role) => role.name);

/** A new custom Role copied from `source`. A copy never gets `wall` or `org`. */
export const copyRole = (source: RoleRow, name: string): RoleRow => ({
  name: name.trim(),
  basedOn: source.name,
  write: source.write,
  approve: source.approve === "wall" ? "area" : source.approve,
  manage: source.manage === "org" ? "area" : source.manage,
});

const sameRole = (a: RoleRow, b: RoleRow) =>
  a.write === b.write &&
  a.approve === b.approve &&
  a.manage === b.manage &&
  a.basedOn === b.basedOn;

/**
 * One change for each Role the table editor added or edited, then one for each custom Role it
 * dropped. Owner never changes. The server decides which apply now and which wait for an Owner.
 */
export function diffRoleTable(
  before: ReadonlyArray<RoleRow>,
  after: ReadonlyArray<RoleRow>,
): ReadonlyArray<RoleChangeDef> {
  const changes: RoleChangeDef[] = [];
  for (const row of after) {
    if (row.name === "Owner" || row.approve === "wall" || row.manage === "org") continue;
    const old = before.find((candidate) => candidate.name === row.name);
    if (old && sameRole(old, row)) continue;
    changes.push({
      kind: "setRoleDef",
      role: {
        name: row.name,
        basedOn: row.basedOn,
        write: row.write,
        approve: row.approve,
        manage: row.manage,
      },
    });
  }
  for (const old of before) {
    const shipped = (SHIPPED_ROLES as ReadonlyArray<string>).includes(old.name);
    if (!shipped && !after.some((row) => row.name === old.name))
      changes.push({ kind: "removeRoleDef", role: old.name });
  }
  return changes;
}

export type RoleChange = {
  readonly kind: "setRole";
  readonly member: string;
  readonly area: string;
  readonly role: string | null;
};

/** One change for each Area whose Role the form changed. `""` in the form means no Role. */
export function diffRoles(
  member: Member,
  areas: ReadonlyArray<Area>,
  edited: Readonly<Record<string, string>>,
): ReadonlyArray<RoleChange> {
  const changes: RoleChange[] = [];
  for (const area of areas) {
    const before = member.roles[area.slug] ?? "";
    const after = edited[area.slug] ?? before;
    if (after !== before) {
      changes.push({
        kind: "setRole",
        member: member.slug,
        area: area.slug,
        role: after === "" ? null : after,
      });
    }
  }
  return changes;
}

/** A short name for a new Member: lowercase letters, digits and hyphens, at most 40 characters. */
export const suggestSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

type ActionResult = { readonly result: string; readonly message: string };

/** One plain line for the results of a save: how many applied, how many wait, what was refused. */
export function summarizeResults(results: ReadonlyArray<ActionResult>): string {
  const count = (kind: string) => results.filter((entry) => entry.result === kind).length;
  const parts: string[] = [];
  if (count("applied") > 0) parts.push(`${count("applied")} applied`);
  if (count("proposed") > 0) parts.push(`${count("proposed")} waiting for an Owner`);
  const refused = results.filter(
    (entry) => !["applied", "proposed", "rejected"].includes(entry.result),
  );
  if (refused.length > 0) {
    parts.push(
      refused.length > 1
        ? `${refused.length} refused: ${refused[0]!.message}`
        : refused[0]!.message,
    );
  }
  return parts.join(", ") || "Nothing changed.";
}
