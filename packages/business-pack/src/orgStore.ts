// @effect-diagnostics nodeBuiltinImport:off - the org record is plain files in the Home area.
// @effect-diagnostics globalDate:off - formats a timestamp the caller passes in; no clock reads.
import { randomBytes } from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { readFrontmatter } from "./frontmatter.ts";
import { readOrg, type Org } from "./org.ts";
import {
  canDecide,
  classify,
  findActor,
  permit,
  renderMember,
  setRolesBlock,
  setStatusLine,
  simulate,
  validate,
  type OrgChange,
} from "./orgEdit.ts";

export interface OrgProposal {
  readonly id: string;
  readonly title: string;
  readonly status: "proposed" | "applied" | "rejected" | string;
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly decidedBy: string;
  readonly change: OrgChange | null;
}

export type SubmitResult =
  | { readonly result: "applied" | "proposed"; readonly message: string }
  | { readonly result: "denied" | "invalid" | "unknown_actor"; readonly message: string };

export type DecideResult =
  | { readonly result: "applied" | "rejected"; readonly message: string }
  | { readonly result: "denied" | "invalid" | "missing"; readonly message: string };

const MAX_PROPOSALS = 200;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID: 10 characters of time, 16 of randomness (events/README.md). */
function ulid(now: number): string {
  let time = "";
  for (let rest = now, i = 0; i < 10; i += 1, rest = Math.floor(rest / 32))
    time = CROCKFORD[rest % 32]! + time;
  const random = Array.from(randomBytes(16), (byte) => CROCKFORD[byte % 32]!).join("");
  return time + random;
}

const iso = (now: number) => new Date(now).toISOString();

/** A plain line that says what a change does. */
export function describeChange(org: Org, change: OrgChange): string {
  const name = (slug: string) => org.members.find((member) => member.slug === slug)?.name ?? slug;
  const area = (slug: string) =>
    org.areas.find((candidate) => candidate.slug === slug)?.name ?? slug;
  if (change.kind === "addMember") return `Add ${change.member.name} (${change.member.kind})`;
  if (change.kind === "removeMember") return `Remove ${name(change.member)}`;
  return change.role === null
    ? `Remove ${name(change.member)} from ${area(change.area)}`
    : `Give ${name(change.member)} the ${change.role} Role in ${area(change.area)}`;
}

async function appendEvent(
  root: string,
  now: number,
  event: {
    readonly level: "info" | "needs_you";
    readonly type: string;
    readonly title: string;
    readonly actor: string;
    readonly for?: ReadonlyArray<string>;
  },
) {
  const file = NodePath.join(root, "events", `${iso(now).slice(0, 7)}.jsonl`);
  const line = JSON.stringify({
    v: 1,
    id: `evt_${ulid(now)}`,
    ts: iso(now),
    level: event.level,
    type: event.type,
    title: event.title.slice(0, 80),
    actor: { kind: "person", name: event.actor, member: event.actor },
    ...(event.for ? { for: event.for } : {}),
  });
  await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
  await NodeFSP.appendFile(file, `${line}\n`, "utf8");
}

const memberFile = (root: string, slug: string) =>
  NodePath.join(root, "org", "members", `${slug}.md`);

/** Writes the member files a change touches. The caller checked `validate` first. */
async function writeChange(root: string, org: Org, change: OrgChange) {
  if (change.kind === "addMember") {
    await NodeFSP.mkdir(NodePath.join(root, "org", "members"), { recursive: true });
    await NodeFSP.writeFile(memberFile(root, change.member.slug), renderMember(change.member), {
      encoding: "utf8",
      flag: "wx",
    });
    return;
  }
  const after = simulate(org, change);
  for (const member of after.members) {
    const before = org.members.find((candidate) => candidate.slug === member.slug);
    if (!before || (before.status === member.status && before.roles === member.roles)) continue;
    const path = memberFile(root, member.slug);
    let text = await NodeFSP.readFile(path, "utf8");
    if (before.status !== member.status) text = setStatusLine(text, member.status);
    if (before.roles !== member.roles) text = setRolesBlock(text, member.roles);
    await NodeFSP.writeFile(path, text, "utf8");
  }
}

const proposalPath = (root: string, id: string) =>
  NodePath.join(root, "org", "proposals", `${id}.md`);

function renderProposal(
  id: string,
  title: string,
  by: string,
  now: number,
  change: OrgChange,
): string {
  return [
    "---",
    "type: org-proposal",
    "scope: structural",
    `id: proposal-${id}`,
    `title: "${title.replace(/"/g, "'")}"`,
    "status: proposed",
    `proposed_by: ${by}`,
    `proposed_at: ${iso(now)}`,
    "decided_by:",
    "decided_at:",
    `change: ${JSON.stringify(change)}`,
    "---",
    "",
    `# ${title}`,
    "",
    "Waiting for an Owner. See [`org/proposals/README.md`](./README.md).",
    "",
  ].join("\n");
}

/** Every proposal, newest first. A damaged file is skipped. */
export async function readProposals(root: string): Promise<ReadonlyArray<OrgProposal>> {
  const dir = NodePath.join(root, "org", "proposals");
  const names = (await NodeFSP.readdir(dir).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md")
    .sort()
    .reverse()
    .slice(0, MAX_PROPOSALS);
  const rows = await Promise.all(
    names.map(async (name): Promise<OrgProposal | null> => {
      const front = readFrontmatter(
        await NodeFSP.readFile(NodePath.join(dir, name), "utf8").catch(() => ""),
      );
      if (front.type !== "org-proposal") return null;
      let change: OrgChange | null = null;
      try {
        change = JSON.parse(front.change ?? "") as OrgChange;
      } catch {
        change = null;
      }
      return {
        id: name.slice(0, -3),
        title: front.title ?? name,
        status: front.status ?? "proposed",
        proposedBy: front.proposed_by ?? "",
        proposedAt: front.proposed_at ?? "",
        decidedBy: front.decided_by ?? "",
        change,
      };
    }),
  );
  return rows.filter((row): row is OrgProposal => row !== null);
}

/**
 * Applies a change now when it only narrows access, or files it as a proposal when it widens
 * access. `githubLogin` is the account signed in on this computer. Never throws on a rule break.
 */
export async function submitChange(
  root: string,
  githubLogin: string | null,
  change: OrgChange,
  now: number,
): Promise<SubmitResult> {
  const org = await readOrg(root);
  if (!org) return { result: "invalid", message: "This workspace has no Members yet." };
  const actor = findActor(org, githubLogin);
  if (!actor)
    return {
      result: "unknown_actor",
      message: "This computer's GitHub account is not a Member of this business.",
    };
  const problem = validate(org, change);
  if (problem) return { result: "invalid", message: problem };
  if (classify(org, change) === "none")
    return { result: "invalid", message: "Nothing would change." };
  const route = permit(org, actor, change);
  if (route === "deny")
    return { result: "denied", message: "Your Role does not let you make this change." };
  const title = describeChange(org, change);
  if (route === "apply") {
    await writeChange(root, org, change);
    await appendEvent(root, now, { level: "info", type: "org.changed", title, actor: actor.slug });
    return { result: "applied", message: title };
  }
  const subject = change.kind === "addMember" ? change.member.slug : change.member;
  const id = `${iso(now).replace(/[-:]/g, "").slice(0, 15)}-${change.kind.toLowerCase()}-${subject}`;
  await NodeFSP.mkdir(NodePath.join(root, "org", "proposals"), { recursive: true });
  try {
    await NodeFSP.writeFile(
      proposalPath(root, id),
      renderProposal(id, title, actor.slug, now, change),
      { encoding: "utf8", flag: "wx" },
    );
  } catch {
    return { result: "invalid", message: "This proposal is already waiting." };
  }
  const owners = org.members
    .filter(
      (member) =>
        member.kind === "person" && member.status === "active" && member.roles.home === "Owner",
    )
    .map((member) => member.slug);
  await appendEvent(root, now, {
    level: "needs_you",
    type: "org.proposal",
    title,
    actor: actor.slug,
    for: owners,
  });
  return { result: "proposed", message: title };
}

/** An Owner approves or rejects a proposal. Approve checks the change against the org as it is now. */
export async function decideProposal(
  root: string,
  githubLogin: string | null,
  id: string,
  decision: "approve" | "reject",
  now: number,
): Promise<DecideResult> {
  const org = await readOrg(root);
  if (!org) return { result: "invalid", message: "This workspace has no Members yet." };
  const actor = findActor(org, githubLogin);
  if (!canDecide(actor))
    return { result: "denied", message: "Only an Owner can decide a proposal." };
  if (!/^[A-Za-z0-9-]+$/.test(id)) return { result: "missing", message: "No such proposal." };
  const path = proposalPath(root, id);
  const text = await NodeFSP.readFile(path, "utf8").catch(() => null);
  const proposal = text === null ? null : (await readProposals(root)).find((row) => row.id === id);
  if (text === null || !proposal) return { result: "missing", message: "No such proposal." };
  if (proposal.status !== "proposed" || !proposal.change)
    return { result: "invalid", message: "This proposal was already decided." };
  const stamp = (status: string) =>
    text
      .replace(/^status:.*$/m, `status: ${status}`)
      .replace(/^decided_by:.*$/m, `decided_by: ${actor!.slug}`)
      .replace(/^decided_at:.*$/m, `decided_at: ${iso(now)}`);
  if (decision === "reject") {
    await NodeFSP.writeFile(path, stamp("rejected"), "utf8");
    await appendEvent(root, now, {
      level: "info",
      type: "org.changed",
      title: `Rejected: ${proposal.title}`,
      actor: actor!.slug,
    });
    return { result: "rejected", message: proposal.title };
  }
  const problem = validate(org, proposal.change);
  if (problem) return { result: "invalid", message: problem };
  await writeChange(root, org, proposal.change);
  await NodeFSP.writeFile(path, stamp("applied"), "utf8");
  await appendEvent(root, now, {
    level: "info",
    type: "org.changed",
    title: proposal.title,
    actor: actor!.slug,
  });
  return { result: "applied", message: proposal.title };
}

export interface OrgView {
  readonly org: Org | null;
  /** The Member who uses this computer, matched by GitHub login. */
  readonly me: { readonly slug: string; readonly canDecide: boolean } | null;
  /** Proposals that still wait for an Owner. */
  readonly proposals: ReadonlyArray<
    Pick<OrgProposal, "id" | "title" | "proposedBy" | "proposedAt">
  >;
}

/** What the Team view needs in one read: the org, who is using it, and the waiting proposals. */
export async function readOrgView(root: string, githubLogin: string | null): Promise<OrgView> {
  const org = await readOrg(root);
  if (!org) return { org: null, me: null, proposals: [] };
  const actor = findActor(org, githubLogin);
  const proposals = (await readProposals(root))
    .filter((proposal) => proposal.status === "proposed")
    .map(({ id, title, proposedBy, proposedAt }) => ({ id, title, proposedBy, proposedAt }));
  return { org, me: actor ? { slug: actor.slug, canDecide: canDecide(actor) } : null, proposals };
}
