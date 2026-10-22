import type { WorkspaceOrg } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  areaInLens,
  buildTeamGroups,
  copyRole,
  diffRoleTable,
  diffRoles,
  groupInLens,
  initials,
  memberInLens,
  rolesFor,
  suggestSlug,
  summarizeResults,
} from "./teamView.logic";

const member = (
  slug: string,
  department: string,
  roles: Record<string, string>,
  extra: Partial<WorkspaceOrg["members"][number]> = {},
): WorkspaceOrg["members"][number] => ({
  slug,
  name: slug,
  kind: "person",
  status: "active",
  department,
  owner: "",
  github: "",
  roles,
  ...extra,
});
const area = (slug: string, department: string): WorkspaceOrg["areas"][number] => ({
  slug,
  name: slug,
  department,
  sensitivity: "private",
  status: "active",
});

const table: WorkspaceOrg["roles"] = [
  { name: "Viewer", basedOn: "", write: "none", approve: "none", manage: "none" },
  { name: "Member", basedOn: "", write: "files", approve: "none", manage: "none" },
  { name: "Admin", basedOn: "", write: "all", approve: "area", manage: "area" },
  { name: "Owner", basedOn: "", write: "all", approve: "wall", manage: "org" },
  { name: "Closer", basedOn: "Member", write: "files", approve: "area", manage: "none" },
];

const org: WorkspaceOrg = {
  name: "Acme",
  departments: [
    { slug: "sales", name: "Sales", areas: ["deals"], leads: ["ada"] },
    { slug: "ops", name: "Ops", areas: ["home"], leads: [] },
  ],
  areas: [area("deals", "sales"), area("home", "ops"), area("misc", "gone")],
  roles: table,
  members: [
    member("ada", "sales", { home: "Owner", deals: "Admin" }),
    member("bo", "ops", { home: "Viewer" }),
    member("scout", "sales", { deals: "Member" }, { kind: "agent", owner: "ada" }),
    member("zed", "nowhere", {}),
    member("old", "sales", { deals: "Member" }, { status: "removed" }),
  ],
};

describe("buildTeamGroups", () => {
  it("groups by Department and keeps unknown ones in a last group, none lost", () => {
    const groups = buildTeamGroups(org);
    expect(groups.map((group) => group.key)).toEqual(["sales", "ops", "__none__"]);
    expect(groups[2]!.areas.map((a) => a.slug)).toEqual(["misc"]);
    expect(groups[2]!.members.map((m) => m.slug)).toEqual(["zed"]);
  });

  it("shows a lead by name, and by slug when the Member is unknown", () => {
    const named = { ...org, members: [member("ada", "sales", {}, { name: "Ada Lovelace" })] };
    expect(buildTeamGroups(named)[0]!.leads).toEqual(["Ada Lovelace"]);
    expect(buildTeamGroups({ ...named, members: [] })[0]!.leads).toEqual(["ada"]);
  });

  it("does not draw a removed Member", () => {
    const all = buildTeamGroups(org).flatMap((group) => group.members.map((m) => m.slug));
    expect(all).not.toContain("old");
  });
});

describe("lens", () => {
  it("keeps everything with no lens", () => {
    expect(memberInLens(org, null, org.members[0]!)).toBe(true);
  });

  it("an Area lens keeps the Members who hold a Role in it", () => {
    const lens = { kind: "area", slug: "deals" } as const;
    expect(org.members.filter((m) => memberInLens(org, lens, m)).map((m) => m.slug)).toEqual([
      "ada",
      "scout",
      "old",
    ]);
  });

  it("a Member lens keeps the Member, their agents and their Areas", () => {
    const lens = { kind: "member", slug: "ada" } as const;
    expect(org.members.filter((m) => memberInLens(org, lens, m)).map((m) => m.slug)).toEqual([
      "ada",
      "scout",
    ]);
    expect(org.areas.filter((a) => areaInLens(org, lens, a)).map((a) => a.slug)).toEqual([
      "deals",
      "home",
    ]);
  });

  it("a Department lens keeps its group and any group whose Areas the lens reaches", () => {
    const lens = { kind: "department", slug: "ops" } as const;
    const groups = buildTeamGroups(org);
    expect(groups.filter((g) => groupInLens(org, lens, g)).map((g) => g.key)).toEqual([
      "sales",
      "ops",
    ]);
  });
});

describe("initials", () => {
  it("takes two letters", () => {
    expect(initials("Ada Lovelace Byron")).toBe("AL");
    expect(initials("")).toBe("");
  });
});

describe("editor helpers", () => {
  it("gives an agent no Owner Role", () => {
    expect(rolesFor("agent", table)).toEqual(["Viewer", "Member", "Admin", "Closer"]);
    expect(rolesFor("person", table)).toContain("Owner");
  });

  it("copies a Role without the powers of Owner, and names only what the table changed", () => {
    const owner = table[3]!;
    expect(copyRole(owner, " Boss ")).toEqual({
      name: "Boss",
      basedOn: "Owner",
      write: "all",
      approve: "area",
      manage: "area",
    });
    const edited = table.map((r) => (r.name === "Member" ? { ...r, approve: "area" as const } : r));
    const fresh = { ...copyRole(table[1]!, "Scribe"), write: "none" as const };
    const dropped = edited.filter((r) => r.name !== "Closer");
    expect(
      diffRoleTable(table, [...edited, fresh]).map((c) => c.kind === "setRoleDef" && c.role.name),
    ).toEqual(["Member", "Scribe"]);
    expect(diffRoleTable(table, dropped)).toContainEqual({ kind: "removeRoleDef", role: "Closer" });
    expect(diffRoleTable(table, table.slice(0, 3))).toEqual([
      { kind: "removeRoleDef", role: "Closer" },
    ]);
    expect(diffRoleTable(table, table)).toEqual([]);
  });

  it("lists only the Areas whose Role changed, and uses null to remove", () => {
    const bo = org.members[1]!;
    const areas = [area("home", "ops"), area("deals", "sales"), area("studio", "ops")];
    expect(diffRoles(bo, areas, { home: "Viewer", deals: "Member" })).toEqual([
      { kind: "setRole", member: "bo", area: "deals", role: "Member" },
    ]);
    expect(diffRoles(bo, areas, { home: "" })).toEqual([
      { kind: "setRole", member: "bo", area: "home", role: null },
    ]);
    expect(diffRoles(bo, areas, {})).toEqual([]);
  });

  it("makes a short name from a full name", () => {
    expect(suggestSlug("  Ana Maria O'Neil ")).toBe("ana-maria-o-neil");
    expect(suggestSlug("!!!")).toBe("");
  });

  it("sums up a save in one line", () => {
    expect(summarizeResults([])).toBe("Nothing changed.");
    expect(
      summarizeResults([
        { result: "applied", message: "" },
        { result: "proposed", message: "" },
        { result: "denied", message: "No." },
      ]),
    ).toBe("1 applied, 1 waiting for an Owner, No.");
  });
});
