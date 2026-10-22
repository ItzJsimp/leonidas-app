// @effect-diagnostics nodeBuiltinImport:off - invites are plain files in the Home area.
// @effect-diagnostics globalDate:off - formats a timestamp the caller passes in; no clock reads.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { readFrontmatter } from "./frontmatter.ts";

/** An Invite lives 7 days (ADR-0088). */
export const INVITE_DAYS = 7;
const MAX_INVITES = 200;

export interface OrgInvite {
  readonly slug: string;
  readonly name: string;
  readonly github: string;
  /** `approved` waits for the person. `accepted` and `expired` are closed. */
  readonly status: string;
  readonly expiresAt: string;
  readonly approvedBy: string;
}

/** What a Member does with an Invite. Neither changes who may do what, so neither is a proposal. */
export type InviteAction =
  | { readonly kind: "acceptInvite" }
  | { readonly kind: "renewInvite"; readonly member: string };

const dir = (root: string) => NodePath.join(root, "org", "invites");
export const invitePath = (root: string, slug: string) => NodePath.join(dir(root), `${slug}.md`);

export const expiryOf = (now: number) =>
  new Date(now + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

/**
 * The invite file. It holds no secret: the Invite is bound to the GitHub login of the Member, so
 * a forwarded link cannot be used by another account.
 */
export function renderInvite(invite: OrgInvite & { readonly createdAt: string }): string {
  return [
    "---",
    "type: org-invite",
    "scope: structural",
    `id: invite-${invite.slug}`,
    `title: "Invite ${invite.name.replace(/"/g, "'")}"`,
    `member: ${invite.slug}`,
    `github: ${invite.github}`,
    `status: ${invite.status}`,
    `approved_by: ${invite.approvedBy}`,
    `created_at: ${invite.createdAt}`,
    `expires_at: ${invite.expiresAt}`,
    "---",
    "",
    `# Invite ${invite.name}`,
    "",
    "Open for 7 days, for the GitHub account named above. See [`README.md`](./README.md).",
    "",
  ].join("\n");
}

/** `key: value` line of an invite file, replaced. */
export const setField = (text: string, key: string, value: string): string =>
  new RegExp(`^${key}:.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`)
    : text.replace(/^(status:.*)$/m, `$1\n${key}: ${value}`);

/** Every invite file, newest first. A damaged file is skipped. */
export async function readInvites(root: string): Promise<ReadonlyArray<OrgInvite>> {
  const names = (await NodeFSP.readdir(dir(root)).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md")
    .sort()
    .reverse()
    .slice(0, MAX_INVITES);
  const rows = await Promise.all(
    names.map(async (name): Promise<OrgInvite | null> => {
      const front = readFrontmatter(
        await NodeFSP.readFile(NodePath.join(dir(root), name), "utf8").catch(() => ""),
      );
      if (front.type !== "org-invite") return null;
      return {
        slug: name.slice(0, -3),
        name: (front.title ?? name).replace(/^Invite /, ""),
        github: front.github ?? "",
        status: front.status ?? "",
        expiresAt: front.expires_at ?? "",
        approvedBy: front.approved_by ?? "",
      };
    }),
  );
  return rows.filter((row): row is OrgInvite => row !== null);
}

/**
 * The `origin` URL of the Home repo, read from `.git/config`, with any sign-in part removed so a
 * token in the remote never reaches a link. `null` when the Home folder has no remote.
 */
export async function readHomeOrigin(root: string): Promise<string | null> {
  const config = await NodeFSP.readFile(NodePath.join(root, ".git", "config"), "utf8").catch(
    () => "",
  );
  const url = /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/.exec(config)?.[1];
  if (!url) return null;
  return url.replace(/^(https?:\/\/)[^/@]+@/, "$1");
}

/** The link an Owner sends. It names the Home repo and the Invite, and holds no secret. */
export const inviteLink = (origin: string | null, slug: string): string =>
  origin
    ? `leonidas://join?home=${encodeURIComponent(origin)}&invite=${encodeURIComponent(slug)}`
    : "";
