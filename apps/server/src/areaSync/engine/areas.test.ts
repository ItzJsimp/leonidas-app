import { assert, describe, it } from "@effect/vitest";

import { parseAreas, planJoin } from "./areas.ts";
import type { AreaEntry } from "./areas.ts";

const HEADER = "| Slug | Name | Repo | Department | Sensitivity | Status |";
const SEPARATOR = "|---|---|---|---|---|---|";

const area = (slug: string, status = "active"): AreaEntry => ({
  slug,
  name: slug,
  repo: `acme-${slug}`,
  department: "sales",
  sensitivity: "private",
  status,
});

describe("parseAreas", () => {
  it("reads the example table", () => {
    const text = [
      HEADER,
      SEPARATOR,
      "| `home` | Home | `acme-home` | `general` | shared | active |",
      "| `sales` | Sales | `acme-sales` | `sales` | private | active |",
      "| `old` | Old | `acme-old` | `sales` | private | archived |",
    ].join("\n");
    assert.deepStrictEqual(parseAreas(text), [
      {
        slug: "home",
        name: "Home",
        repo: "acme-home",
        department: "general",
        sensitivity: "shared",
        status: "active",
      },
      {
        slug: "sales",
        name: "Sales",
        repo: "acme-sales",
        department: "sales",
        sensitivity: "private",
        status: "active",
      },
      {
        slug: "old",
        name: "Old",
        repo: "acme-old",
        department: "sales",
        sensitivity: "private",
        status: "archived",
      },
    ]);
  });

  it("ignores the header, the separator and non-table lines", () => {
    const text = [
      "# Areas",
      "",
      HEADER,
      SEPARATOR,
      "| `sales` | Sales | `acme-sales` | `sales` | private | active |",
    ].join("\n");
    assert.deepStrictEqual(
      parseAreas(text).map((a) => a.slug),
      ["sales"],
    );
  });

  it("handles CRLF line endings", () => {
    const text = [
      HEADER,
      SEPARATOR,
      "| `sales` | Sales | `acme-sales` | `sales` | private | Active |",
    ].join("\r\n");
    assert.deepStrictEqual(parseAreas(text), [
      {
        slug: "sales",
        name: "Sales",
        repo: "acme-sales",
        department: "sales",
        sensitivity: "private",
        status: "active",
      },
    ]);
  });

  it("reads plain-text cells without backticks", () => {
    const text = "| sales | Sales | acme-sales | sales | private | active |";
    assert.deepStrictEqual(parseAreas(text), [
      {
        slug: "sales",
        name: "Sales",
        repo: "acme-sales",
        department: "sales",
        sensitivity: "private",
        status: "active",
      },
    ]);
  });

  it("skips bad slugs", () => {
    const rows = ["`../x`", "`a/b`", "`Sales`", "``", "`ok`"].map(
      (slug) => `| ${slug} | Name | acme-repo | sales | private | active |`,
    );
    assert.deepStrictEqual(
      parseAreas(rows.join("\n")).map((a) => a.slug),
      ["ok"],
    );
  });

  it("skips bad repos", () => {
    const rows = ["`a/b`", "`..`", "`.`", "`acme-ok`"].map(
      (repo, i) => `| slug${i} | Name | ${repo} | sales | private | active |`,
    );
    assert.deepStrictEqual(
      parseAreas(rows.join("\n")).map((a) => a.repo),
      ["acme-ok"],
    );
  });

  it("skips rows with fewer than 6 cells", () => {
    const text = "| sales | Sales | acme-sales | sales | private |";
    assert.deepStrictEqual(parseAreas(text), []);
  });

  it("keeps the first row when a slug repeats", () => {
    const text = [
      "| sales | Sales | acme-sales | sales | private | active |",
      "| sales | Sales Two | acme-other | sales | private | archived |",
    ].join("\n");
    assert.deepStrictEqual(parseAreas(text), [
      {
        slug: "sales",
        name: "Sales",
        repo: "acme-sales",
        department: "sales",
        sensitivity: "private",
        status: "active",
      },
    ]);
  });

  it("returns an empty list for empty input", () => {
    assert.deepStrictEqual(parseAreas(""), []);
  });
});

describe("planJoin", () => {
  it("splits active, on-disk and archived areas and leaves out home", () => {
    const areas = [
      area("home"),
      area("alpha"),
      area("beta"),
      area("gamma", "archived"),
      area("delta"),
      area("epsilon", "archived"),
    ];
    const plan = planJoin(areas, new Set(["beta", "epsilon", "home"]));
    assert.deepStrictEqual(
      plan.clone.map((a) => a.slug),
      ["alpha", "delta"],
    );
    assert.deepStrictEqual(
      plan.sync.map((a) => a.slug),
      ["beta"],
    );
    assert.deepStrictEqual(
      plan.skip.map((a) => a.slug),
      ["gamma", "epsilon"],
    );
  });

  it("returns empty lists for empty input", () => {
    assert.deepStrictEqual(planJoin([], new Set()), { clone: [], sync: [], skip: [] });
  });
});
