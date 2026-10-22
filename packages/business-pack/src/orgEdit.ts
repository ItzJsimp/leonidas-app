import type { Org, OrgMember } from "./org.ts";

/** The four Roles that ship, lowest to highest (ADR-0088). */
export const BASE_ROLES = ["Viewer", "Member", "Admin", "Owner"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

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
  | { readonly kind: "removeMember"; readonly member: string };

export const HOME_AREA = "home";
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const rank = (role: string | undefined): number =>
  role === undefined ? -1 : BASE_ROLES.indexOf(role as BaseRole);

const live = (org: Org) => org.members.filter((member) => member.status !== "removed");

/** `narrow` lowers or removes access, `widen` adds or raises it, `none` changes nothing. */
export function classify(org: Org, change: OrgChange): "narrow" | "widen" | "none" {
  if (change.kind === "addMember") return "widen";
  if (change.kind === "removeMember") return "narrow";
  const old = org.members.find((member) => member.slug === change.member)?.roles[change.area];
  if (change.role === null) return old === undefined ? "none" : "narrow";
  if (old === undefined) return "widen";
  const delta = rank(change.role) - rank(old);
  return delta > 0 ? "widen" : delta < 0 ? "narrow" : "none";
}

/** The org after the change. Pure. Removing a person also removes the agents they answer for. */
export function simulate(org: Org, change: OrgChange): Org {
  if (change.kind === "addMember") {
    const added: OrgMember = {
      slug: change.member.slug,
      name: change.member.name,
      kind: change.member.kind,
      status: "active",
      department: change.member.department,
      owner: change.member.owner ?? "",
      github: change.member.github ?? "",
      roles: change.member.roles,
    };
    return { ...org, members: [...org.members, added] };
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
    if (change.role !== null && rank(change.role) < 0) return `${change.role} is not a Role.`;
    if (member.kind === "agent" && change.role === "Owner") return "An agent cannot be an Owner.";
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
    if (rank(next.roles[HOME_AREA]) < 0)
      return "Give the Member a Role in the Home area, at least Viewer.";
    for (const [slug, role] of Object.entries(next.roles)) {
      const found = area(slug);
      if (!found || found.status === "archived") return `${slug} is not an active Area.`;
      if (rank(role) < 0) return `${role} is not a Role.`;
      if (next.kind === "agent" && role === "Owner") return "An agent cannot be an Owner.";
    }
  } else if (!target(change.member)) {
    return "That Member does not exist or was removed.";
  }
  const owners = live(simulate(org, change)).filter(
    (member) => member.kind === "person" && member.roles[HOME_AREA] === "Owner",
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

const atLeast = (member: OrgMember, area: string, role: BaseRole) =>
  rank(member.roles[area]) >= rank(role);

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
  const scope = change.kind === "setRole" ? change.area : HOME_AREA;
  if (!atLeast(actor, scope, "Admin")) return "deny";
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

/** `status:` line of a member file, replaced. */
export function setStatusLine(text: string, status: string): string {
  return /^status:.*$/m.test(text)
    ? text.replace(/^status:.*$/m, `status: ${status}`)
    : text.replace(/^(kind:.*)$/m, `$1\nstatus: ${status}`);
}

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
    "status: active",
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
