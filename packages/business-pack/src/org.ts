// @effect-diagnostics nodeBuiltinImport:off - the org record is plain files in the Home area.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { readFrontmatter } from "./frontmatter.ts";

export interface OrgDepartment {
  readonly slug: string;
  readonly name: string;
  readonly areas: ReadonlyArray<string>;
  readonly leads: ReadonlyArray<string>;
}

export interface OrgArea {
  readonly slug: string;
  readonly name: string;
  readonly department: string;
  readonly sensitivity: string;
  readonly status: string;
}

export interface OrgMember {
  readonly slug: string;
  readonly name: string;
  readonly kind: "person" | "agent";
  readonly status: string;
  readonly department: string;
  /** The person who answers for an agent. Empty for a person. */
  readonly owner: string;
  /** Area slug to Role name. */
  readonly roles: Readonly<Record<string, string>>;
}

export interface Org {
  readonly name: string;
  readonly departments: ReadonlyArray<OrgDepartment>;
  readonly areas: ReadonlyArray<OrgArea>;
  readonly members: ReadonlyArray<OrgMember>;
}

const MAX_MEMBERS = 500;
const TOKEN = /__[A-Z_]+__/;

/** Rows of the first Markdown table in `text`, as trimmed cells with backticks removed. */
export function readTable(text: string): ReadonlyArray<ReadonlyArray<string>> {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim().replace(/`/g, ""));
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows.slice(1);
}

const list = (cell: string | undefined): string[] =>
  (cell ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** The `roles:` map of a member file: indented `area: Role` lines under `roles:`. */
function readRoles(text: string): Record<string, string> {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ""));
  const roles: Record<string, string> = {};
  let inside = false;
  for (const line of (front?.[1] ?? "").split(/\r?\n/)) {
    if (/^roles:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    const pair = /^\s+([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);
    if (!pair) break;
    roles[pair[1]!] = pair[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return roles;
}

export function parseMember(slug: string, text: string): OrgMember | null {
  const front = readFrontmatter(text);
  if (front.type !== "member") return null;
  return {
    slug,
    name: front.title || slug,
    kind: front.kind === "agent" ? "agent" : "person",
    status: front.status || "active",
    department: front.department ?? "",
    owner: front.owner ?? "",
    roles: readRoles(text),
  };
}

const readText = (path: string) => NodeFSP.readFile(path, "utf8").catch(() => "");

/**
 * The org record of a business workspace: Departments, Areas and Members. Read only. A row that
 * still holds a `__TOKEN__` is skipped. `null` when the folder holds no Member, so the screen can
 * show its empty state.
 */
export async function readOrg(root: string): Promise<Org | null> {
  const dir = NodePath.join(root, "org");
  const [orgText, deptText, areaText, names] = await Promise.all([
    readText(NodePath.join(dir, "org.md")),
    readText(NodePath.join(dir, "departments.md")),
    readText(NodePath.join(dir, "areas.md")),
    NodeFSP.readdir(NodePath.join(dir, "members")).catch(() => [] as string[]),
  ]);
  const members = (
    await Promise.all(
      names
        .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md")
        .slice(0, MAX_MEMBERS)
        .map(async (name) =>
          parseMember(name.slice(0, -3), await readText(NodePath.join(dir, "members", name))),
        ),
    )
  ).filter((member): member is OrgMember => member !== null);
  if (members.length === 0) return null;
  const clean = (rows: ReadonlyArray<ReadonlyArray<string>>) =>
    rows.filter((row) => row.length >= 2 && !row.some((cell) => TOKEN.test(cell)));
  return {
    name: /^#\s+(.+)$/m.exec(orgText)?.[1]?.trim() ?? "",
    departments: clean(readTable(deptText)).map((row) => ({
      slug: row[0]!,
      name: row[1]!,
      areas: list(row[2]),
      leads: list(row[3]),
    })),
    areas: clean(readTable(areaText)).map((row) => ({
      slug: row[0]!,
      name: row[1]!,
      department: row[3] ?? "",
      sensitivity: row[4] ?? "",
      status: row[5] ?? "active",
    })),
    members: members.filter((member) => !TOKEN.test(member.slug)),
  };
}
