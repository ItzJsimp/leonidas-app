import type { WorkspaceOrg } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { areaInLens, buildTeamGroups, groupInLens, initials, memberInLens } from "./teamView.logic";

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

const org: WorkspaceOrg = {
  name: "Acme",
  departments: [
    { slug: "sales", name: "Sales", areas: ["deals"], leads: ["ada"] },
    { slug: "ops", name: "Ops", areas: ["home"], leads: [] },
  ],
  areas: [area("deals", "sales"), area("home", "ops"), area("misc", "gone")],
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
