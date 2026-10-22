import { assert, describe, it } from "@effect/vitest";
import type { WorkspaceOrgResult, WorkspacePackWidget } from "@t3tools/contracts";

import type { AiosWorkspaceState } from "../taskBoard/aiosWorkspaces.ts";
import { loadBusinessPack } from "./loadBusinessPack.ts";
import {
  changeOrgForWorkspace,
  decideOrgForWorkspace,
  orgForWorkspace,
  scaffoldForSetup,
  widgetsForWorkspace,
  type BusinessPack,
} from "./workspacePack.ts";

const widget: WorkspacePackWidget = {
  id: "w",
  title: "T",
  kpis: [{ label: "L", value: "1", detail: "d" }],
};
const view: WorkspaceOrgResult = {
  org: { name: "Acme", departments: [], areas: [], members: [], roles: [] },
  me: { slug: "ada", canDecide: true, invited: false },
  proposals: [],
  invites: [],
};
const seenLogin: Array<string | null> = [];
const seen: string[] = [];
const pack: BusinessPack = {
  readOrgView: async (_root, login) => {
    seenLogin.push(login);
    return view;
  },
  submitChange: async () => ({ result: "applied", message: "ok" }),
  decideProposal: async () => ({ result: "applied", message: "ok" }),
  scaffoldBusiness: (root) => {
    seen.push(`scaffold:${root}`);
    return 1;
  },
  readWidgets: async (root) => {
    seen.push(root);
    return [widget];
  },
};
const ready = (id: string, type: "personal" | "business", root: string): AiosWorkspaceState => ({
  status: "ready",
  root,
  file: { id, name: id, type, schemaVersion: 1 },
});
const workspaces: ReadonlyArray<AiosWorkspaceState> = [
  ready("leonidas", "personal", "/aios/personal"),
  ready("simplygersi", "business", "/aios/sg"),
  { status: "invalid", root: "/aios/broken", error: "bad" },
];

describe("widgetsForWorkspace", () => {
  it("returns the pack widgets for a business workspace, read from its own root", async () => {
    seen.length = 0;
    const widgets = await widgetsForWorkspace(workspaces, "simplygersi", 0, async () => pack);
    assert.deepEqual(widgets, [widget]);
    assert.deepEqual(seen, ["/aios/sg"]);
  });

  it("returns nothing for a personal workspace and never loads the pack", async () => {
    let loaded = false;
    const widgets = await widgetsForWorkspace(workspaces, "leonidas", 0, async () => {
      loaded = true;
      return pack;
    });
    assert.deepEqual(widgets, []);
    assert.isFalse(loaded);
  });

  it("returns nothing for an unknown id, an unready default and no workspaces", async () => {
    const load = async () => pack;
    assert.deepEqual(await widgetsForWorkspace(workspaces, "nope", 0, load), []);
    assert.deepEqual(await widgetsForWorkspace(workspaces.slice(2), undefined, 0, load), []);
    assert.deepEqual(await widgetsForWorkspace([], undefined, 0, load), []);
  });

  it("returns nothing when the pack is absent", async () => {
    assert.deepEqual(await widgetsForWorkspace(workspaces, "simplygersi", 0, async () => null), []);
  });

  it("returns nothing when the pack throws, so the Home never fails for a widget", async () => {
    const broken: BusinessPack = {
      ...pack,
      readOrgView: async () => {
        throw new Error("boom");
      },
      submitChange: async () => ({ result: "applied", message: "ok" }),
      decideProposal: async () => ({ result: "applied", message: "ok" }),
      readWidgets: async () => {
        throw new Error("boom");
      },
    };
    const load = async () => broken;
    assert.deepEqual(await widgetsForWorkspace(workspaces, "simplygersi", 0, load), []);
  });
});

describe("org actions", () => {
  it("reads the org view of a business workspace, and nothing for personal, unknown, absent or broken", async () => {
    assert.deepEqual(
      await orgForWorkspace(workspaces, "simplygersi", "ada", async () => pack),
      view,
    );
    assert.deepEqual(seenLogin, ["ada"]);
    const empty = { org: null, me: null, proposals: [], invites: [] };
    assert.deepEqual(await orgForWorkspace(workspaces, "leonidas", "ada", async () => pack), empty);
    assert.deepEqual(await orgForWorkspace(workspaces, "nope", "ada", async () => pack), empty);
    assert.deepEqual(
      await orgForWorkspace(workspaces, "simplygersi", "ada", async () => null),
      empty,
    );
    const broken: BusinessPack = {
      ...pack,
      readOrgView: async () => {
        throw new Error("boom");
      },
    };
    assert.deepEqual(
      await orgForWorkspace(workspaces, "simplygersi", "ada", async () => broken),
      empty,
    );
  });

  it("sends a change and a decision to the pack for a business workspace only", async () => {
    const change = { kind: "removeMember", member: "bo" } as const;
    const sent = await changeOrgForWorkspace(
      workspaces,
      "simplygersi",
      "ada",
      change,
      5,
      async () => pack,
    );
    assert.strictEqual(sent.result, "applied");
    const decided = await decideOrgForWorkspace(
      workspaces,
      "simplygersi",
      "ada",
      "p1",
      "approve",
      5,
      async () => pack,
    );
    assert.strictEqual(decided.result, "applied");
    const personal = await changeOrgForWorkspace(
      workspaces,
      "leonidas",
      "ada",
      change,
      5,
      async () => pack,
    );
    assert.strictEqual(personal.result, "invalid");
    const unknown = await decideOrgForWorkspace(
      workspaces,
      "nope",
      "ada",
      "p1",
      "reject",
      5,
      async () => pack,
    );
    assert.strictEqual(unknown.result, "invalid");
  });

  it("answers invalid, and does not throw, when the pack fails", async () => {
    const fail = async () => {
      throw new Error("boom");
    };
    const broken: BusinessPack = { ...pack, submitChange: fail, decideProposal: fail };
    const change = { kind: "removeMember", member: "bo" } as const;
    const a = await changeOrgForWorkspace(
      workspaces,
      "simplygersi",
      "ada",
      change,
      5,
      async () => broken,
    );
    const b = await decideOrgForWorkspace(
      workspaces,
      "simplygersi",
      "ada",
      "p1",
      "approve",
      5,
      async () => broken,
    );
    assert.deepEqual([a.result, b.result], ["invalid", "invalid"]);
  });
});

describe("scaffoldForSetup", () => {
  const input = { id: "acme", name: "Acme", ownerName: "Ada" };
  const load = async () => pack;

  it("copies the template when the Owner name and a GitHub login are known", async () => {
    seen.length = 0;
    assert.isNull(await scaffoldForSetup("/r", input, "ada-gh", "UTC", load));
    assert.deepEqual(seen, ["scaffold:/r"]);
  });

  it("refuses with a plain message, and writes nothing, when something is missing", async () => {
    seen.length = 0;
    const noName = await scaffoldForSetup("/r", { id: "a", name: "A" }, "ada", "UTC", load);
    const noLogin = await scaffoldForSetup("/r", input, null, "UTC", load);
    const badLogin = await scaffoldForSetup("/r", input, "a/../b", "UTC", load);
    const noPack = await scaffoldForSetup("/r", input, "ada", "UTC", async () => null);
    assert.isTrue([noName, noLogin, badLogin, noPack].every((text) => text !== null));
    assert.deepEqual(seen, []);
  });

  it("turns a failed copy into a message", async () => {
    const broken = {
      ...pack,
      scaffoldBusiness: () => {
        throw new Error("EACCES");
      },
    };
    assert.include(
      (await scaffoldForSetup("/r", input, "ada", "UTC", async () => broken)) ?? "",
      "writable",
    );
  });
});

describe("loadBusinessPack", () => {
  it("returns the pack or null, never throws", async () => {
    const loaded = await loadBusinessPack();
    assert.isTrue(loaded === null || typeof loaded.readWidgets === "function");
  });
});
