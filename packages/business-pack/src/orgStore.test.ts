// @effect-diagnostics nodeBuiltinImport:off - test fixtures live in a temp folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { readOrg } from "./org.ts";
import {
  canDecide,
  classify,
  findActor,
  permit,
  setRolesBlock,
  validate,
  type OrgChange,
} from "./orgEdit.ts";
import { decideProposal, readProposals, submitChange } from "./orgStore.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const write = (root: string, path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.join(root, path, ".."), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, path), text, "utf8");
};
const read = (root: string, path: string) => NodeFS.readFileSync(NodePath.join(root, path), "utf8");

const member = (slug: string, extra: string, roles: string) =>
  `---\ntype: member\ntitle: "${slug}"\n${extra}\nroles:\n${roles}\n---\n\n# ${slug}\n`;

/** ada Owner, bo Admin of studio, cy Viewer, scout agent of ada. */
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "org-edit-"));
  roots.push(root);
  write(
    root,
    "org/departments.md",
    "| S | N | A | L |\n|---|---|---|---|\n| `general` | General | `home`, `deals`, `studio` | `ada` |\n",
  );
  write(
    root,
    "org/areas.md",
    "| S | N | R | D | Sen | St |\n|---|---|---|---|---|---|\n| `home` | Home | `h` | `general` | shared | active |\n| `deals` | Deals | `d` | `general` | private | active |\n| `studio` | Studio | `s` | `general` | private | active |\n",
  );
  write(
    root,
    "org/members/ada.md",
    member(
      "ada",
      "kind: person\nstatus: active\ngithub: Ada-L\ndepartment: general",
      "  home: Owner\n  deals: Owner\n  studio: Owner",
    ),
  );
  write(
    root,
    "org/members/bo.md",
    member(
      "bo",
      "kind: person\nstatus: active\ngithub: bo\ndepartment: general",
      "  home: Viewer\n  studio: Admin",
    ),
  );
  write(
    root,
    "org/members/cy.md",
    member("cy", "kind: person\nstatus: active\ngithub: cy\ndepartment: general", "  home: Viewer"),
  );
  write(
    root,
    "org/members/scout.md",
    member(
      "scout",
      "kind: agent\nstatus: active\ndepartment: general\nowner: ada",
      "  home: Viewer\n  deals: Member",
    ),
  );
  return root;
};

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const org = async (root: string) => (await readOrg(root))!;

describe("classify and validate", () => {
  it("sorts changes into narrow, widen and none", async () => {
    const o = await org(makeRoot());
    const set = (member: string, area: string, role: string | null): OrgChange => ({
      kind: "setRole",
      member,
      area,
      role,
    });
    assert.strictEqual(classify(o, set("bo", "studio", "Viewer")), "narrow");
    assert.strictEqual(classify(o, set("bo", "studio", null)), "narrow");
    assert.strictEqual(classify(o, set("bo", "studio", "Owner")), "widen");
    assert.strictEqual(classify(o, set("bo", "deals", "Viewer")), "widen");
    assert.strictEqual(classify(o, set("bo", "studio", "Admin")), "none");
    assert.strictEqual(classify(o, { kind: "removeMember", member: "bo" }), "narrow");
  });

  it("refuses an agent Owner, a missing Home Role and the loss of the last Owner", async () => {
    const o = await org(makeRoot());
    assert.match(
      validate(o, { kind: "setRole", member: "scout", area: "deals", role: "Owner" })!,
      /agent/,
    );
    assert.match(validate(o, { kind: "setRole", member: "bo", area: "home", role: null })!, /Home/);
    assert.match(validate(o, { kind: "removeMember", member: "ada" })!, /Owner/);
    assert.match(
      validate(o, { kind: "setRole", member: "ada", area: "home", role: "Admin" })!,
      /Owner/,
    );
    assert.isNull(validate(o, { kind: "setRole", member: "bo", area: "studio", role: "Viewer" }));
  });

  it("checks a new Member and keeps a newline out of the file", async () => {
    const o = await org(makeRoot());
    const base = {
      slug: "dee",
      name: "Dee",
      kind: "person",
      department: "general",
      github: "dee",
      roles: { home: "Viewer" },
    } as const;
    assert.isNull(validate(o, { kind: "addMember", member: base }));
    assert.match(
      validate(o, { kind: "addMember", member: { ...base, name: "Dee\nroles:" } })!,
      /one line/,
    );
    assert.match(validate(o, { kind: "addMember", member: { ...base, slug: "bo" } })!, /taken/);
    assert.match(validate(o, { kind: "addMember", member: { ...base, github: "" } })!, /GitHub/);
    assert.match(validate(o, { kind: "addMember", member: { ...base, roles: {} } })!, /Home/);
    assert.match(
      validate(o, { kind: "addMember", member: { ...base, department: "nope" } })!,
      /Department/,
    );
    assert.match(
      validate(o, { kind: "addMember", member: { ...base, kind: "agent", owner: "scout" } })!,
      /person/,
    );
  });
});

describe("who may do what", () => {
  it("finds the actor by GitHub login without case, and never an agent", async () => {
    const o = await org(makeRoot());
    assert.strictEqual(findActor(o, "ada-l")?.slug, "ada");
    assert.isNull(findActor(o, "nobody"));
    assert.isNull(findActor(o, null));
    assert.isFalse(canDecide(findActor(o, "bo")));
    assert.isTrue(canDecide(findActor(o, "ada-l")));
  });

  it("lets an Admin narrow or propose inside the Area, and nothing outside it", async () => {
    const o = await org(makeRoot());
    const bo = findActor(o, "bo");
    assert.strictEqual(
      permit(o, bo, { kind: "setRole", member: "cy", area: "studio", role: "Member" }),
      "propose",
    );
    assert.strictEqual(
      permit(o, bo, { kind: "setRole", member: "ada", area: "studio", role: "Admin" }),
      "apply",
    );
    assert.strictEqual(
      permit(o, bo, { kind: "setRole", member: "cy", area: "deals", role: "Member" }),
      "deny",
    );
    assert.strictEqual(permit(o, bo, { kind: "removeMember", member: "cy" }), "deny");
    assert.strictEqual(
      permit(o, findActor(o, "cy"), { kind: "setRole", member: "cy", area: "home", role: "Owner" }),
      "deny",
    );
  });
});

describe("setRolesBlock", () => {
  it("replaces only the roles block", () => {
    const text = member("bo", "kind: person", "  home: Viewer\n  studio: Admin");
    const next = setRolesBlock(text, { home: "Viewer" });
    assert.include(next, "roles:\n  home: Viewer\n---");
    assert.notInclude(next, "studio");
    assert.include(next, "kind: person");
  });
});

describe("submitChange", () => {
  it("applies a narrowing change at once, writes the file and logs an event", async () => {
    const root = makeRoot();
    const result = await submitChange(
      root,
      "ada-l",
      { kind: "setRole", member: "bo", area: "studio", role: "Viewer" },
      NOW,
    );
    assert.strictEqual(result.result, "applied");
    assert.deepStrictEqual((await org(root)).members.find((m) => m.slug === "bo")!.roles, {
      home: "Viewer",
      studio: "Viewer",
    });
    const line = JSON.parse(read(root, "events/2026-10.jsonl").trim());
    assert.strictEqual(line.type, "org.changed");
    assert.match(line.id, /^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("files a widening change as a proposal and leaves the member untouched", async () => {
    const root = makeRoot();
    const result = await submitChange(
      root,
      "ada-l",
      { kind: "setRole", member: "cy", area: "deals", role: "Member" },
      NOW,
    );
    assert.strictEqual(result.result, "proposed");
    assert.deepStrictEqual((await org(root)).members.find((m) => m.slug === "cy")!.roles, {
      home: "Viewer",
    });
    const [proposal] = await readProposals(root);
    assert.strictEqual(proposal?.status, "proposed");
    assert.strictEqual(proposal?.proposedBy, "ada");
    const event = JSON.parse(read(root, "events/2026-10.jsonl").trim());
    assert.deepStrictEqual(
      [event.type, event.level, event.for],
      ["org.proposal", "needs_you", ["ada"]],
    );
    const again = await submitChange(
      root,
      "ada-l",
      { kind: "setRole", member: "cy", area: "deals", role: "Member" },
      NOW,
    );
    assert.strictEqual(again.result, "invalid");
  });

  it("denies a Viewer and an unknown account, and changes nothing", async () => {
    const root = makeRoot();
    const change: OrgChange = { kind: "setRole", member: "cy", area: "studio", role: "Member" };
    assert.strictEqual((await submitChange(root, "cy", change, NOW)).result, "denied");
    assert.strictEqual((await submitChange(root, "stranger", change, NOW)).result, "unknown_actor");
    assert.strictEqual((await readProposals(root)).length, 0);
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, "events")));
  });

  it("removing a person removes the agents they answer for", async () => {
    const root = makeRoot();
    write(
      root,
      "org/members/dee.md",
      member(
        "dee",
        "kind: person\nstatus: active\ngithub: dee\ndepartment: general",
        "  home: Owner",
      ),
    );
    const result = await submitChange(root, "dee", { kind: "removeMember", member: "ada" }, NOW);
    assert.strictEqual(result.result, "applied");
    const o = await org(root);
    assert.deepStrictEqual(
      o.members
        .filter((m) => m.status === "removed")
        .map((m) => m.slug)
        .sort(),
      ["ada", "scout"],
    );
    assert.isTrue(NodeFS.existsSync(NodePath.join(root, "org/members/ada.md")));
  });
});

describe("decideProposal", () => {
  const propose = async (root: string) => {
    await submitChange(
      root,
      "ada-l",
      { kind: "setRole", member: "cy", area: "deals", role: "Member" },
      NOW,
    );
    return (await readProposals(root))[0]!.id;
  };

  it("an Owner approves: the change is applied and the proposal is stamped", async () => {
    const root = makeRoot();
    const id = await propose(root);
    const result = await decideProposal(root, "ada-l", id, "approve", NOW + 1000);
    assert.strictEqual(result.result, "applied");
    assert.deepStrictEqual((await org(root)).members.find((m) => m.slug === "cy")!.roles, {
      home: "Viewer",
      deals: "Member",
    });
    const [done] = await readProposals(root);
    assert.deepStrictEqual([done?.status, done?.decidedBy], ["applied", "ada"]);
    assert.strictEqual((await decideProposal(root, "ada-l", id, "approve", NOW)).result, "invalid");
  });

  it("only an Owner decides, and a reject changes no member", async () => {
    const root = makeRoot();
    const id = await propose(root);
    assert.strictEqual((await decideProposal(root, "bo", id, "approve", NOW)).result, "denied");
    assert.strictEqual((await decideProposal(root, "ada-l", id, "reject", NOW)).result, "rejected");
    assert.deepStrictEqual((await org(root)).members.find((m) => m.slug === "cy")!.roles, {
      home: "Viewer",
    });
    assert.strictEqual((await readProposals(root))[0]?.status, "rejected");
  });

  it("refuses a path trick and an unknown id", async () => {
    const root = makeRoot();
    assert.strictEqual(
      (await decideProposal(root, "ada-l", "../../org/members/ada", "approve", NOW)).result,
      "missing",
    );
    assert.strictEqual(
      (await decideProposal(root, "ada-l", "nope", "approve", NOW)).result,
      "missing",
    );
  });
});
