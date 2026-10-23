import { describe, expect, it } from "vite-plus/test";

import {
  canonicalName,
  matchesOwnerLens,
  ownerLensOptions,
  ownerOf,
  ownerPickerItems,
  ownerPickerValue,
  parseOwnerLens,
} from "./owner.logic";

const team = [
  { name: "Jake", aliases: ["ItzJsimp"] },
  { name: "Mob", aliases: ["vMobxAi", "Seth Moncada"] },
];

type Owned = Parameters<typeof ownerOf>[0];
const task = (patch: Partial<Owned> = {}): Owned => ({
  assignee: null,
  claimedBy: null,
  claimedAgent: null,
  status: "todo",
  ...patch,
});

describe("owners", () => {
  it("maps logins and git names to team names", () => {
    expect(canonicalName("itzjsimp", team)).toBe("Jake");
    expect(canonicalName("Seth Moncada", team)).toBe("Mob");
    expect(canonicalName("Gavin", team)).toBe("Gavin");
    expect(canonicalName("  ", team)).toBeNull();
  });

  it("prefers the owner field over the claim, and a claim makes an owner", () => {
    expect(ownerOf(task({ assignee: "Mob", claimedBy: "ItzJsimp" }), team)).toBe("Mob");
    expect(ownerOf(task({ claimedBy: "ItzJsimp" }), team)).toBe("Jake");
    expect(ownerOf(task(), team)).toBeNull();
  });

  it("filters by lens and keeps agent runs out of every lens but Agents", () => {
    const run = task({ kind: "agent_run", claimedBy: "ItzJsimp" });
    const mobs = task({ assignee: "Mob" });
    const free = task();
    const working = task({
      assignee: "Jake",
      status: "in_progress",
      claimedAgent: { threadId: "t" },
    });
    const lens = (value: Parameters<typeof matchesOwnerLens>[1]) =>
      [run, mobs, free, working].filter((item) => matchesOwnerLens(item, value, "Jake", team));
    expect(lens("everyone")).toEqual([mobs, free, working]);
    expect(lens("mine")).toEqual([working]);
    expect(lens("person:Mob")).toEqual([mobs]);
    expect(lens("anyone")).toEqual([free]);
    expect(lens("agents")).toEqual([run, working]);
  });

  it("counts every lens from open tasks", () => {
    const options = ownerLensOptions(
      [
        task({ assignee: "Mob" }),
        task(),
        task({ claimedBy: "ItzJsimp" }),
        task({ kind: "agent_run" }),
      ],
      "Jake",
      team,
    );
    expect(options.map((option) => [option.label, option.count])).toEqual([
      ["Everyone", 3],
      ["Mine", 1],
      ["Mob", 1],
      ["Anyone", 1],
      ["Agents", 1],
    ]);
  });

  it("reads saved lenses and rejects junk", () => {
    expect(parseOwnerLens("person:Mob")).toBe("person:Mob");
    expect(parseOwnerLens("agents")).toBe("agents");
    expect(parseOwnerLens("person:")).toBe("everyone");
    expect(parseOwnerLens(42)).toBe("everyone");
  });
});

describe("owner picker", () => {
  const business = [
    {
      name: "Ada Owner",
      aliases: ["ada-owner", "ada-gh"],
      slug: "ada-owner",
      kind: "person" as const,
    },
    { name: "Scout", aliases: ["scout"], slug: "scout", kind: "agent" as const },
  ];

  it("lists each Member by slug, marks an agent, and keeps an unlisted owner", () => {
    expect(ownerPickerItems(business, "Ada Owner")).toEqual([
      { value: "ada-owner", label: "Ada Owner" },
      { value: "scout", label: "Scout (agent)" },
    ]);
    expect(ownerPickerItems(team, "Zed")).toEqual([
      { value: "Jake", label: "Jake" },
      { value: "Mob", label: "Mob" },
      { value: "Zed", label: "Zed" },
    ]);
  });

  it("maps a stored slug to the same row the picker offers", () => {
    const owner = ownerOf(task({ assignee: "scout" }), business);
    expect(owner).toBe("Scout");
    expect(ownerPickerValue(business, owner)).toBe("scout");
    expect(ownerPickerValue(team, "Jake")).toBe("Jake");
    expect(ownerPickerValue(business, null)).toBeNull();
  });
});
