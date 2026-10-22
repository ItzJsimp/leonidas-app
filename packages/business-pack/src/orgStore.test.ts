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
  type RoleInput,
} from "./orgEdit.ts";
import { decideProposal, readOrgView, readProposals, submitChange } from "./orgStore.ts";

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

const ROLES_FILE =
  "# Roles\n\nIntro.\n\n| Role | Based on | Write | Approve | Manage |\n|---|---|---|---|---|\n| Owner | | all | wall | org |\n| Admin | | all | area | area |\n| Member | | files | none | none |\n| Viewer | | none | none | none |\n| Closer | Member | files | area | none |\n| Bad | Member | all | wall | org |\n| Junk | Member | lots | none | none |\n\nAfter the table.\n";

const closer: RoleInput = {
  name: "Closer",
  basedOn: "Member",
  write: "files",
  approve: "area",
  manage: "none",
};

const giveCy = (root: string, roles: string) =>
  write(
    root,
    "org/members/cy.md",
    member("cy", "kind: person\nstatus: active\ngithub: cy\ndepartment: general", roles),
  );

describe("permission table", () => {
  it("reads the table, skips damaged rows and rows that grab Owner powers", async () => {
    const root = makeRoot();
    write(root, "org/roles.md", ROLES_FILE);
    const o = await org(root);
    assert.deepStrictEqual(
      o.roles.map((role) => role.name),
      ["Viewer", "Member", "Admin", "Owner", "Closer"],
    );
    assert.strictEqual(o.roles.find((role) => role.name === "Closer")!.approve, "area");
  });

  it("falls back to the four defaults when the file has no table", async () => {
    const o = await org(makeRoot());
    assert.deepStrictEqual(
      o.roles.map((role) => role.name),
      ["Viewer", "Member", "Admin", "Owner"],
    );
  });

  it("sorts role edits, locks Owner and keeps wall and org for Owner", async () => {
    const root = makeRoot();
    write(root, "org/roles.md", ROLES_FILE);
    const o = await org(root);
    const def = (change: Partial<RoleInput>): OrgChange => ({
      kind: "setRoleDef",
      role: { ...closer, ...change },
    });
    assert.strictEqual(classify(o, def({ name: "Fresh" })), "widen");
    assert.strictEqual(classify(o, def({ name: "Closer", approve: "none" })), "narrow");
    assert.strictEqual(
      classify(o, def({ name: "Closer", write: "all", approve: "none" })),
      "widen",
    );
    assert.strictEqual(classify(o, def({ name: "Closer" })), "none");
    assert.match(validate(o, def({ name: "Owner" }))!, /locked/);
    assert.match(validate(o, def({ name: "closer" }))!, /taken/);
    assert.match(validate(o, def({ name: "X", basedOn: "Nope" }))!, /not a Role/);
    assert.match(validate(o, def({ name: "X", manage: "org" as never }))!, /Owner/);
    assert.match(validate(o, def({ name: "bad\nname" }))!, /Role name/);
    assert.isNull(validate(o, def({ name: "Fresh" })));
  });

  it("refuses to remove a shipped Role or one a Member holds", async () => {
    const root = makeRoot();
    write(root, "org/roles.md", ROLES_FILE);
    giveCy(root, "  home: Closer");
    const o = await org(root);
    assert.match(validate(o, { kind: "removeRoleDef", role: "Admin" })!, /ship/);
    assert.match(validate(o, { kind: "removeRoleDef", role: "Closer" })!, /holds|Member/);
    assert.match(validate(o, { kind: "removeRoleDef", role: "Ghost" })!, /not exist/);
  });

  it("an Owner narrows a Role at once, a widening waits, a non-Owner is denied", async () => {
    const root = makeRoot();
    write(root, "org/roles.md", ROLES_FILE);
    const narrow = await submitChange(
      root,
      "ada-l",
      { kind: "setRoleDef", role: { ...closer, approve: "none" } },
      NOW,
    );
    assert.strictEqual(narrow.result, "applied");
    const text = read(root, "org/roles.md");
    assert.include(text, "| Closer | Member | files | none | none |");
    assert.include(text, "Intro.");
    assert.include(text, "After the table.");
    const widen = await submitChange(
      root,
      "ada-l",
      { kind: "setRoleDef", role: { ...closer, name: "Fresh" } },
      NOW,
    );
    assert.strictEqual(widen.result, "proposed");
    assert.notInclude(read(root, "org/roles.md"), "Fresh");
    const denied = await submitChange(
      root,
      "bo",
      { kind: "setRoleDef", role: { ...closer, name: "Other" } },
      NOW,
    );
    assert.strictEqual(denied.result, "denied");
    const [proposal] = await readProposals(root);
    assert.strictEqual(
      (await decideProposal(root, "ada-l", proposal!.id, "approve", NOW)).result,
      "applied",
    );
    assert.include(read(root, "org/roles.md"), "| Fresh | Member | files | area | none |");
  });

  it("a custom Role that manages an Area lets its holder act there", async () => {
    const root = makeRoot();
    write(
      root,
      "org/roles.md",
      ROLES_FILE.replace(
        "| Closer | Member | files | area | none |",
        "| Lead | Admin | files | area | area |",
      ),
    );
    giveCy(root, "  home: Viewer\n  studio: Lead");
    const o = await org(root);
    const cy = findActor(o, "cy")!;
    assert.strictEqual(
      permit(o, cy, { kind: "setRole", member: "bo", area: "studio", role: "Viewer" }),
      "apply",
    );
    assert.strictEqual(
      permit(o, cy, { kind: "setRole", member: "bo", area: "deals", role: "Viewer" }),
      "deny",
    );
  });
});

describe("invites", () => {
  const add = (login = "dee"): OrgChange => ({
    kind: "addMember",
    member: {
      slug: "dee",
      name: "Dee",
      kind: "person",
      department: "general",
      github: login,
      roles: { home: "Viewer", deals: "Member" },
    },
  });
  /** An Owner proposes Dee and approves it, so Dee is invited with an open Invite. */
  const invite = async (root: string) => {
    await submitChange(root, "ada-l", add(), NOW);
    const [proposal] = await readProposals(root);
    await decideProposal(root, "ada-l", proposal!.id, "approve", NOW);
  };

  it("approving a new person Member writes an invited Member and a 7 day Invite", async () => {
    const root = makeRoot();
    await invite(root);
    assert.strictEqual((await org(root)).members.find((m) => m.slug === "dee")!.status, "invited");
    const text = read(root, "org/invites/dee.md");
    assert.include(text, "status: approved");
    assert.include(text, "github: dee");
    assert.include(text, `expires_at: ${new Date(NOW + 7 * 86_400_000).toISOString()}`);
    assert.notMatch(text, /token|secret/i);
  });

  it("an agent has no Invite and starts active", async () => {
    const root = makeRoot();
    await submitChange(
      root,
      "ada-l",
      {
        kind: "addMember",
        member: {
          slug: "bot",
          name: "Bot",
          kind: "agent",
          department: "general",
          owner: "ada",
          roles: { home: "Viewer" },
        },
      },
      NOW,
    );
    const [proposal] = await readProposals(root);
    await decideProposal(root, "ada-l", proposal!.id, "approve", NOW);
    assert.strictEqual((await org(root)).members.find((m) => m.slug === "bot")!.status, "active");
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, "org/invites/bot.md")));
  });

  it("an invited Member can change nothing until they accept", async () => {
    const root = makeRoot();
    await invite(root);
    const change: OrgChange = { kind: "setRole", member: "cy", area: "deals", role: "Member" };
    assert.strictEqual((await submitChange(root, "dee", change, NOW)).result, "denied");
  });

  it("the invited person accepts once, and only with the named GitHub account", async () => {
    const root = makeRoot();
    await invite(root);
    const later = NOW + 86_400_000;
    assert.strictEqual(
      (await submitChange(root, "stranger", { kind: "acceptInvite" }, later)).result,
      "unknown_actor",
    );
    assert.strictEqual(
      (await submitChange(root, "Dee", { kind: "acceptInvite" }, later)).result,
      "applied",
    );
    assert.strictEqual((await org(root)).members.find((m) => m.slug === "dee")!.status, "active");
    assert.include(read(root, "org/invites/dee.md"), "status: accepted");
    assert.include(read(root, "events/2026-10.jsonl"), "Dee joined");
    assert.strictEqual(
      (await submitChange(root, "dee", { kind: "acceptInvite" }, later)).result,
      "invalid",
    );
  });

  it("an expired Invite closes, and only an Owner can renew it", async () => {
    const root = makeRoot();
    await invite(root);
    const late = NOW + 8 * 86_400_000;
    const expired = await submitChange(root, "dee", { kind: "acceptInvite" }, late);
    assert.match(expired.message, /expired/);
    assert.include(read(root, "org/invites/dee.md"), "status: expired");
    assert.strictEqual((await org(root)).members.find((m) => m.slug === "dee")!.status, "invited");
    assert.strictEqual(
      (await submitChange(root, "bo", { kind: "renewInvite", member: "dee" }, late)).result,
      "denied",
    );
    assert.strictEqual(
      (await submitChange(root, "ada-l", { kind: "renewInvite", member: "dee" }, late)).result,
      "applied",
    );
    assert.strictEqual(
      (await submitChange(root, "dee", { kind: "acceptInvite" }, late)).result,
      "applied",
    );
  });

  it("an Owner sees open Invites with a link that holds no sign-in", async () => {
    const root = makeRoot();
    write(
      root,
      ".git/config",
      '[remote "origin"]\n\turl = https://user:ghp_SECRET@github.com/acme/home.git\n',
    );
    await invite(root);
    const view = await readOrgView(root, "ada-l");
    assert.strictEqual(view.invites.length, 1);
    const link = view.invites[0]!.link;
    assert.include(link, encodeURIComponent("https://github.com/acme/home.git"));
    assert.notInclude(link, "SECRET");
    assert.deepStrictEqual((await readOrgView(root, "bo")).invites, []);
    assert.isTrue((await readOrgView(root, "dee")).me!.invited);
  });
});
