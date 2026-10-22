// @effect-diagnostics nodeBuiltinImport:off - test fixtures live in a temp folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { parseMember, readOrg, readTable } from "./org.ts";

const roots: string[] = [];
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "org-"));
  roots.push(root);
  return root;
};
const write = (root: string, path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.join(root, path, ".."), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, path), text, "utf8");
};
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const MEMBER = (title: string, extra: string, roles: string) =>
  `---\ntype: member\ntitle: "${title}"\n${extra}\nroles:\n${roles}\n---\n\n# ${title}\n`;

describe("readTable", () => {
  it("drops the header and rule rows and strips backticks", () => {
    const rows = readTable("intro\n\n| A | B |\n|---|---|\n| `x` | Two |\n\nafter | not | a row");
    assert.deepStrictEqual(rows, [["x", "Two"]]);
  });
});

describe("parseMember", () => {
  it("reads the nested roles map and the agent owner", () => {
    const member = parseMember(
      "scout",
      MEMBER(
        "Scout",
        "kind: agent\nstatus: active\ndepartment: sales\nowner: ada",
        "  home: Viewer\n  deals: Member",
      ),
    );
    assert.deepStrictEqual(member, {
      slug: "scout",
      name: "Scout",
      kind: "agent",
      status: "active",
      department: "sales",
      owner: "ada",
      roles: { home: "Viewer", deals: "Member" },
    });
  });

  it("ignores a file that is not a member", () => {
    assert.isNull(parseMember("x", "---\ntype: org-record\n---\n"));
  });
});

describe("readOrg", () => {
  it("builds the org from the record files", async () => {
    const root = makeRoot();
    write(root, "org/org.md", "---\ntype: org-record\n---\n\n# Acme\n");
    write(
      root,
      "org/departments.md",
      "| Slug | Name | Areas | Leads |\n|---|---|---|---|\n| `sales` | Sales | `home`, `deals` | `ada` |\n",
    );
    write(
      root,
      "org/areas.md",
      "| Slug | Name | Repo | Department | Sensitivity | Status |\n|---|---|---|---|---|---|\n| `home` | Home | `a-home` | `general` | shared | active |\n| `deals` | Deals | `a-deals` | `sales` | private | active |\n",
    );
    write(
      root,
      "org/members/ada.md",
      MEMBER("Ada", "kind: person\nstatus: active\ndepartment: sales", "  home: Owner"),
    );
    write(root, "org/members/README.md", "# not a member");
    const org = await readOrg(root);
    assert.strictEqual(org?.name, "Acme");
    assert.deepStrictEqual(org?.departments, [
      { slug: "sales", name: "Sales", areas: ["home", "deals"], leads: ["ada"] },
    ]);
    assert.deepStrictEqual(
      org?.areas.map((area) => [area.slug, area.department, area.sensitivity]),
      [
        ["home", "general", "shared"],
        ["deals", "sales", "private"],
      ],
    );
    assert.strictEqual(org?.members.length, 1);
    assert.deepStrictEqual(org?.members[0]?.roles, { home: "Owner" });
  });

  it("skips rows that still hold a template token", async () => {
    const root = makeRoot();
    write(
      root,
      "org/departments.md",
      "| S | N | A | L |\n|---|---|---|---|\n| `general` | General | `home` | `__OWNER_SLUG__` |\n",
    );
    write(root, "org/members/ada.md", MEMBER("Ada", "kind: person", "  home: Owner"));
    const org = await readOrg(root);
    assert.deepStrictEqual(org?.departments, []);
  });

  it("gives null when there is no member, so the screen can show its empty state", async () => {
    assert.isNull(await readOrg(makeRoot()));
  });
});
