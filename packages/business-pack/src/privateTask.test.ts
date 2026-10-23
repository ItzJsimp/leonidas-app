// @effect-diagnostics nodeBuiltinImport:off - test fixtures live in a temp folder on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { maskCard, readPrivateTitle, setCardPrivacy, unmaskCard } from "./privateTask.ts";
import { scaffoldBusiness } from "./scaffold.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const CARD = `---\ntype: task\nid: task-plan\nname: "Secret plan for Acme"\nstatus: "Not started"\nassignee: ada-owner\n---\n\n# Secret plan for Acme\n\nCall the buyer about the hush deal.\n`;

/** A business with a `deals` Area besides Home, and one task card in Home. */
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "private-task-"));
  roots.push(root);
  scaffoldBusiness(root, {
    id: "acme",
    name: "Acme",
    ownerName: "Ada Owner",
    ownerGithub: "ada-gh",
    timezone: "UTC",
  });
  const areas = NodePath.join(root, "org", "areas.md");
  NodeFS.writeFileSync(
    areas,
    `${NodeFS.readFileSync(areas, "utf8").replace(
      "| `home` | Home |",
      "| `deals` | Deals | `acme-deals` | `general` | private | active |\n| `home` | Home |",
    )}`,
  );
  const file = NodePath.join(root, "tasks", "task-plan.md");
  NodeFS.writeFileSync(file, CARD);
  return { root, file };
};

describe("maskCard and unmaskCard", () => {
  it("hides the title and details in Home and brings them back", () => {
    const masked = maskCard(CARD, { slug: "deals", name: "Deals" })!;
    assert.include(masked, 'name: "Private task in Deals"');
    assert.include(masked, "private: true");
    assert.include(masked, "area: deals");
    assert.include(masked, "assignee: ada-owner");
    assert.notInclude(masked, "Secret");
    assert.notInclude(masked, "hush");
    const restored = unmaskCard(masked, CARD)!;
    assert.include(restored, 'name: "Secret plan for Acme"');
    assert.include(restored, "hush deal");
    assert.notInclude(restored, "private:");
  });

  it("keeps Windows line endings and refuses a card with no frontmatter", () => {
    const masked = maskCard(CARD.replaceAll("\n", "\r\n"), { slug: "deals", name: "Deals" })!;
    assert.notInclude(masked.replaceAll("\r\n", ""), "\n");
    assert.isNull(maskCard("no frontmatter", { slug: "deals", name: "Deals" }));
  });
});

describe("setCardPrivacy", () => {
  it("moves the real task to the Area and leaves Home with the mask, both ways", async () => {
    const { root, file } = makeRoot();
    NodeFS.mkdirSync(NodePath.join(root, "areas", "deals"), { recursive: true });
    assert.isNull(await setCardPrivacy(root, file, "task-plan", "deals"));
    const home = NodeFS.readFileSync(file, "utf8");
    assert.notInclude(home, "Secret");
    assert.notInclude(home, "hush");
    const body = NodeFS.readFileSync(
      NodePath.join(root, "areas", "deals", "tasks", "task-plan.md"),
      "utf8",
    );
    assert.include(body, "Secret plan for Acme");
    assert.equal(await readPrivateTitle(root, "deals", "task-plan"), "Secret plan for Acme");

    assert.isNull(await setCardPrivacy(root, file, "task-plan", null));
    assert.include(NodeFS.readFileSync(file, "utf8"), "hush deal");
    // Private again after a public spell works, and the Area file is the newer card.
    assert.isNull(await setCardPrivacy(root, file, "task-plan", "deals"));
    assert.notInclude(NodeFS.readFileSync(file, "utf8"), "hush");
  });

  it("refuses Home, an unknown Area and an Area that is not on this computer", async () => {
    const { root, file } = makeRoot();
    const home = await setCardPrivacy(root, file, "task-plan", "home");
    const unknown = await setCardPrivacy(root, file, "task-plan", "nope");
    const notJoined = await setCardPrivacy(root, file, "task-plan", "deals");
    assert.include(home ?? "", "other than Home");
    assert.include(unknown ?? "", "not in this business");
    assert.include(notJoined ?? "", "Join that Area first");
    assert.equal(NodeFS.readFileSync(file, "utf8"), CARD);
  });

  it("cannot make a task public when the Area copy is gone", async () => {
    const { root, file } = makeRoot();
    NodeFS.mkdirSync(NodePath.join(root, "areas", "deals"), { recursive: true });
    await setCardPrivacy(root, file, "task-plan", "deals");
    NodeFS.rmSync(NodePath.join(root, "areas", "deals", "tasks"), { recursive: true });
    assert.include(
      (await setCardPrivacy(root, file, "task-plan", null)) ?? "",
      "not on this computer",
    );
    assert.notInclude(NodeFS.readFileSync(file, "utf8"), "Secret");
  });
});
