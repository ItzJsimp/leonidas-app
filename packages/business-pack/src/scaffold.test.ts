// @effect-diagnostics nodeBuiltinImport:off - test fixtures live in a temp folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { readOrgView } from "./orgStore.ts";
import { ownerSlug, scaffoldBusiness } from "./scaffold.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "scaffold-"));
  roots.push(root);
  return root;
};

const INPUT = {
  id: "acme-studio",
  name: "Acme Studio",
  ownerName: "Ada Owner",
  ownerGithub: "ada-gh",
  timezone: "America/Phoenix",
};

describe("scaffoldBusiness", () => {
  it("writes a template the org reader accepts, with the setup person as Owner", async () => {
    const root = makeRoot();
    assert.isAbove(scaffoldBusiness(root, INPUT), 20);
    const view = await readOrgView(root, "ada-gh");
    assert.equal(view.org?.members[0]?.slug, "ada-owner");
    assert.equal(view.me?.slug, "ada-owner");
    assert.isTrue(view.me?.canDecide);
    assert.equal(view.org?.areas[0]?.slug, "home");
  });

  it("leaves no token behind in the org record and fills the names", () => {
    const root = makeRoot();
    scaffoldBusiness(root, INPUT);
    const org = NodeFS.readFileSync(NodePath.join(root, "org/org.md"), "utf8");
    assert.include(org, "# Acme Studio");
    assert.include(org, "Acme Studio AI");
    assert.notMatch(org, /__[A-Z_]+__/);
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, "org/members/__OWNER_SLUG__.md")));
    assert.isFalse(NodeFS.existsSync(NodePath.join(root, "workspace.json")));
  });

  it("keeps a file that already exists and takes no special pattern from a name", () => {
    const root = makeRoot();
    NodeFS.writeFileSync(NodePath.join(root, "AGENTS.md"), "mine", "utf8");
    scaffoldBusiness(root, { ...INPUT, name: "Cash $& Co" });
    assert.equal(NodeFS.readFileSync(NodePath.join(root, "AGENTS.md"), "utf8"), "mine");
    assert.include(NodeFS.readFileSync(NodePath.join(root, "org/org.md"), "utf8"), "# Cash $& Co");
  });

  it("makes a safe slug from any name", () => {
    assert.equal(ownerSlug("  Ada  O'Neil "), "ada-o-neil");
    assert.equal(ownerSlug("../.."), "owner");
  });
});
