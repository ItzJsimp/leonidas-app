import {
  APPROVE_LEVELS,
  DEFAULT_ROLES,
  MANAGE_LEVELS,
  WRITE_LEVELS,
  type Org,
  type OrgMember,
  type OrgRole,
} from "./org.ts";

/** A Role as an Owner sends it. `wall` and `org` stay with Owner, so the type leaves them out. */
export type RoleInput = {
  readonly name: string;
  readonly basedOn: string;
  readonly write: "none" | "files" | "all";
  readonly approve: "none" | "area";
  readonly manage: "none" | "area";
};

export type NewMember = {
  readonly slug: string;
  readonly name: string;
  readonly kind: "person" | "agent";
  readonly department: string;
  /** The person who answers for an agent. */
  readonly owner?: string;
  /** The GitHub login of a person. */
  readonly github?: string;
  /** Area slug to Role. Must include `home`. */
  readonly roles: Readonly<Record<string, string>>;
};

export type OrgChange =
  | {
      readonly kind: "setRole";
      readonly member: string;
      readonly area: string;
      readonly role: string | null;
    }
  | { readonly kind: "addMember"; readonly member: NewMember }
  | { readonly kind: "removeMember"; readonly member: string }
  | { readonly kind: "setRoleDef"; readonly role: RoleInput }
  | { readonly kind: "removeRoleDef"; readonly role: string };

export const HOME_AREA = "home";
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const NAME = /^[A-Za-z][A-Za-z0-9 -]{0,23}$/;
const SHIPPED = new Set(DEFAULT_ROLES.map((role) => role.name));
const level = (levels: ReadonlyArray<string>, value: string) => levels.indexOf(value);

const roleOf = (org: Org, name: string | undefined): OrgRole | undefined =>
  org.roles.find((role) => role.name === name);

/** `widen` when any column grows, `narrow` when none grows and one shrinks, else `none`. */
function comparePerms(before: OrgRole, after: OrgRole): "narrow" | "widen" | "none" {
  const deltas = [
    level(WRITE_LEVELS, after.write) - level(WRITE_LEVELS, before.write),
    level(APPROVE_LEVELS, after.approve) - level(APPROVE_LEVELS, before.approve),
    level(MANAGE_LEVELS, after.manage) - level(MANAGE_LEVELS, before.manage),
  ];
  return deltas.some((d) => d > 0) ? "widen" : deltas.some((d) => d < 0) ? "narrow" : "none";
}

const live = (org: Org) => org.members.filter((member) => member.status !== "removed");

/** `narrow` lowers or removes access, `widen` adds or raises it, `none` changes nothing. */
export function classify(org: Org, change: OrgChange): "narrow" | "widen" | "none" {
  if (change.kind === "addMember") return "widen";
  if (change.kind === "removeMember" || change.kind === "removeRoleDef") return "narrow";
  if (change.kind === "setRoleDef") {
    const before = roleOf(org, change.role.name);
    // A new Role adds to the vocabulary of access, so an Owner taps it in.
    return before ? comparePerms(before, { ...change.role }) : "widen";
  }
  const old = org.members.find((member) => member.slug === change.member)?.roles[change.area];
  if (change.role === null) return old === undefined ? "none" : "narrow";
  const next = roleOf(org, change.role);
  const was = roleOf(org, old);
  if (old === undefined || !was || !next) return "widen";
  return comparePerms(was, next);
}

/** The org after the change. Pure. Removing a person also removes the agents they answer for. */
export function simulate(org: Org, change: OrgChange): Org {
  if (change.kind === "addMember") {
    const added: OrgMember = {
      slug: change.member.slug,
      name: change.member.name,
      kind: change.member.kind,
      status: initialStatus(change.member),
      department: change.member.department,
      owner: change.member.owner ?? "",
      github: change.member.github ?? "",
      roles: change.member.roles,
    };
    return { ...org, members: [...org.members, added] };
  }
  if (change.kind === "setRoleDef") {
    const next: OrgRole = { ...change.role };
    const exists = org.roles.some((role) => role.name === next.name);
    return {
      ...org,
      roles: exists
        ? org.roles.map((role) => (role.name === next.name ? next : role))
        : [...org.roles, next],
    };
  }
  if (change.kind === "removeRoleDef") {
    return { ...org, roles: org.roles.filter((role) => role.name !== change.role) };
  }
  if (change.kind === "removeMember") {
    return {
      ...org,
      members: org.members.map((member) =>
        member.slug === change.member || member.owner === change.member
          ? { ...member, status: "removed" }
          : member,
      ),
    };
  }
  return {
    ...org,
    members: org.members.map((member) => {
      if (member.slug !== change.member) return member;
      const roles = { ...member.roles };
      if (change.role === null) delete roles[change.area];
      else roles[change.area] = change.role;
      return { ...member, roles };
    }),
  };
}

/** A plain reason the change is not allowed, or null when it is valid. */
export function validate(org: Org, change: OrgChange): string | null {
  const area = (slug: string) => org.areas.find((candidate) => candidate.slug === slug);
  const target = (slug: string) => live(org).find((member) => member.slug === slug);
  if (change.kind === "setRole") {
    const member = target(change.member);
    if (!member) return "That Member does not exist or was removed.";
    const found = area(change.area);
    if (!found || found.status === "archived") return "That Area does not exist or is archived.";
    if (change.role !== null && !roleOf(org, change.role)) return `${change.role} is not a Role.`;
    if (member.kind === "agent" && roleOf(org, change.role ?? "")?.manage === "org")
      return "An agent cannot be an Owner.";
    if (change.role === null && change.area === HOME_AREA)
      return "Every Member needs at least Viewer in the Home area.";
  } else if (change.kind === "addMember") {
    const next = change.member;
    if (!SLUG.test(next.slug)) return "The short name uses lowercase letters, digits and hyphens.";
    if (org.members.some((member) => member.slug === next.slug)) return "That short name is taken.";
    // One line of plain text: a newline would add fields to the member file.
    if (!/^[^\r\n"\\]{1,80}$/.test(next.name.trim()))
      return "Use a name of 1 to 80 characters on one line.";
    if (!org.departments.some((department) => department.slug === next.department))
      return "That Department does not exist.";
    if (next.kind === "person" && !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(next.github ?? ""))
      return "A person needs a GitHub login.";
    if (next.kind === "agent") {
      const owner = target(next.owner ?? "");
      if (!owner || owner.kind !== "person") return "An agent needs a person who answers for it.";
    }
    if (!roleOf(org, next.roles[HOME_AREA]))
      return "Give the Member a Role in the Home area, at least Viewer.";
    for (const [slug, role] of Object.entries(next.roles)) {
      const found = area(slug);
      if (!found || found.status === "archived") return `${slug} is not an active Area.`;
      if (!roleOf(org, role)) return `${role} is not a Role.`;
      if (next.kind === "agent" && roleOf(org, role)?.manage === "org")
        return "An agent cannot be an Owner.";
    }
  } else if (change.kind === "setRoleDef") {
    const def = change.role;
    if (!NAME.test(def.name))
      return "A Role name uses 1 to 24 letters, digits, spaces and hyphens.";
    if (def.name === "Owner") return "The Owner Role is locked.";
    if (def.basedOn !== "" && !roleOf(org, def.basedOn)) return `${def.basedOn} is not a Role.`;
    if (
      level(WRITE_LEVELS, def.write) < 0 ||
      !["none", "area"].includes(def.approve) ||
      !["none", "area"].includes(def.manage)
    )
      return "Only the Owner Role can approve across the wall or manage the org.";
    const lower = def.name.toLowerCase();
    if (org.roles.some((role) => role.name !== def.name && role.name.toLowerCase() === lower))
      return "That Role name is taken.";
  } else if (change.kind === "removeRoleDef") {
    if (SHIPPED.has(change.role)) return "The four Roles that ship cannot be removed.";
    if (!roleOf(org, change.role)) return "That Role does not exist.";
    if (live(org).some((member) => Object.values(member.roles).includes(change.role)))
      return "A Member still holds that Role. Move them to another Role first.";
  } else if (!target(change.member)) {
    return "That Member does not exist or was removed.";
  }
  const owners = live(simulate(org, change)).filter(
    (member) =>
      member.kind === "person" && member.status === "active" && member.roles[HOME_AREA] === "Owner",
  );
  return owners.length === 0 ? "The business must keep at least one person Owner." : null;
}

/** The person Member who uses this computer, matched by GitHub login, or null. */
export function findActor(org: Org, githubLogin: string | null): OrgMember | null {
  if (!githubLogin) return null;
  const login = githubLogin.toLowerCase();
  return (
    live(org).find(
      (member) =>
        member.kind === "person" && member.github !== "" && member.github.toLowerCase() === login,
    ) ?? null
  );
}

/** True when the Member's Role in the Area lets them manage it (Admin or better in the table). */
const manages = (org: Org, member: OrgMember, area: string) =>
  (roleOf(org, member.roles[area])?.manage ?? "none") !== "none";

/** Only a person who is an Owner in Home decides a proposal. Agents never decide. */
export const canDecide = (actor: OrgMember | null): boolean =>
  actor !== null &&
  actor.kind === "person" &&
  actor.status === "active" &&
  actor.roles[HOME_AREA] === "Owner";

/**
 * What the actor may do with the change. A narrowing change applies at once. A widening change
 * becomes a proposal that an Owner decides. Removing a Member is for an Owner only.
 */
export function permit(
  org: Org,
  actor: OrgMember | null,
  change: OrgChange,
): "apply" | "propose" | "deny" {
  if (!actor || actor.kind !== "person" || actor.status !== "active") return "deny";
  if (change.kind === "removeMember") return canDecide(actor) ? "apply" : "deny";
  // The permission table belongs to an Owner, because it decides what every Role may do.
  if (change.kind === "setRoleDef" || change.kind === "removeRoleDef")
    return canDecide(actor) ? (classify(org, change) === "widen" ? "propose" : "apply") : "deny";
  const scope = change.kind === "setRole" ? change.area : HOME_AREA;
  if (!manages(org, actor, scope)) return "deny";
  return classify(org, change) === "widen" ? "propose" : "apply";
}

/** `roles:` block of a member file, replaced. Other fields stay as written. */
export function setRolesBlock(text: string, roles: Readonly<Record<string, string>>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^roles:/.test(line));
  const body = Object.entries(roles).map(([area, role]) => `  ${area}: ${role}`);
  const block = body.length > 0 ? ["roles:", ...body] : ["roles: {}"];
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end]!)) end += 1;
    lines.splice(start, end - start, ...block);
  } else {
    const close = lines.findIndex((line, i) => i > 0 && line === "---");
    if (close < 0) return text;
    lines.splice(close, 0, ...block);
  }
  return lines.join(eol);
}

/**
 * The first Markdown table of `org/roles.md`, replaced by one row for each Role. Text around the
 * table stays as written. A file with no table gets one at the end.
 */
export function setRolesTable(text: string, roles: ReadonlyArray<OrgRole>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const table = [
    "| Role | Based on | Write | Approve | Manage |",
    "|---|---|---|---|---|",
    ...roles.map(
      (role) =>
        `| ${role.name} | ${role.basedOn} | ${role.write} | ${role.approve} | ${role.manage} |`,
    ),
  ];
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().startsWith("|"));
  if (start < 0) return `${text.replace(/\s*$/, "")}${eol}${eol}${table.join(eol)}${eol}`;
  let end = start;
  while (end < lines.length && lines[end]!.trim().startsWith("|")) end += 1;
  lines.splice(start, end - start, ...table);
  return lines.join(eol);
}

/** `status:` line of a member file, replaced. */
export function setStatusLine(text: string, status: string): string {
  return /^status:.*$/m.test(text)
    ? text.replace(/^status:.*$/m, `status: ${status}`)
    : text.replace(/^(kind:.*)$/m, `$1\nstatus: ${status}`);
}

/** A person starts as `invited` until they accept the Invite. An agent has no one to invite. */
export const initialStatus = (member: NewMember): "invited" | "active" =>
  member.kind === "person" ? "invited" : "active";

/** A new member file in the record format of the template. */
export function renderMember(member: NewMember): string {
  const roles = Object.entries(member.roles).map(([area, role]) => `  ${area}: ${role}`);
  return [
    "---",
    "type: member",
    "scope: structural",
    `id: member-${member.slug}`,
    `title: "${member.name.replace(/"/g, "'")}"`,
    `kind: ${member.kind}`,
    `status: ${initialStatus(member)}`,
    ...(member.github ? [`github: ${member.github}`] : []),
    `department: ${member.department}`,
    ...(member.owner ? [`owner: ${member.owner}`] : []),
    "roles:",
    ...roles,
    "---",
    "",
    `# ${member.name}`,
    "",
  ].join("\n");
}
