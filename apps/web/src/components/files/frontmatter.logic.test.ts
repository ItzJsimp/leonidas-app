import { describe, expect, it } from "vite-plus/test";

import {
  orderProperties,
  parseFrontmatter,
  propertyOptions,
  setFrontmatterValue,
  splitLeadingHeading,
} from "./frontmatter.logic";

const CARD = [
  "---",
  "type: task",
  'name: "Zoom out: avatars"',
  'status: "Not started" # board column',
  "priority: High",
  "autonomous: false",
  "created: 2026-11-12",
  "start_files: []",
  "description: >",
  "  Folded text",
  "  on two lines.",
  "related:",
  "  - one",
  '  - "two"',
  "---",
  "# Title",
  "",
  "- [ ] gate",
  "",
].join("\n");

const read = (text: string, key: string) =>
  parseFrontmatter(text)?.properties.find((property) => property.key === key);

describe("parseFrontmatter", () => {
  it("reads kinds, lists and block text, and finds the body", () => {
    expect(read(CARD, "name")?.value).toBe("Zoom out: avatars");
    expect(read(CARD, "status")?.value).toBe("Not started");
    expect(read(CARD, "autonomous")?.kind).toBe("boolean");
    expect(read(CARD, "created")?.kind).toBe("date");
    expect(read(CARD, "start_files")).toMatchObject({ kind: "list", items: [] });
    expect(read(CARD, "description")).toMatchObject({
      kind: "readonly",
      value: "Folded text on two lines.",
    });
    expect(read(CARD, "related")?.items).toEqual(["one", "two"]);
    expect(CARD.slice(parseFrontmatter(CARD)!.bodyOffset)).toBe("# Title\n\n- [ ] gate\n");
  });

  it("ignores text that only looks like front matter", () => {
    expect(parseFrontmatter("# A\n---\nstatus: x\n---\n")).toBeNull();
    expect(parseFrontmatter("---\nJust a sentence.\n---\n")).toBeNull();
    expect(parseFrontmatter("---\n---\n")).toBeNull();
  });

  it("makes nested maps, anchors and repeated keys read-only", () => {
    const text = "---\nmeta:\n  a: 1\nref: *base\nx: 1\nx: 2\n---\n";
    expect(parseFrontmatter(text)?.properties.map((property) => property.kind)).toEqual([
      "readonly",
      "readonly",
      "readonly",
      "readonly",
    ]);
    expect(setFrontmatterValue(text, "x", "3")).toBe(text);
  });
});

describe("setFrontmatterValue", () => {
  it("changes only the value and keeps quotes and comments", () => {
    expect(setFrontmatterValue(CARD, "status", "Done")).toBe(
      CARD.replace('"Not started"', '"Done"'),
    );
    expect(setFrontmatterValue(CARD, "priority", "Low")).toBe(
      CARD.replace("priority: High", "priority: Low"),
    );
    expect(setFrontmatterValue(CARD, "autonomous", "true")).toBe(
      CARD.replace("autonomous: false", "autonomous: true"),
    );
  });

  it("keeps CRLF line endings and a byte order mark", () => {
    const text = "﻿---\r\npriority: High\r\n---\r\nBody\r\n";
    expect(setFrontmatterValue(text, "priority", "Low")).toBe(text.replace("High", "Low"));
  });

  it("quotes a value that would change meaning as plain YAML", () => {
    const text = "---\ntitle: A\nempty:\n---\n";
    for (const [next, written] of [
      ["a: b", '"a: b"'],
      ["true", '"true"'],
      ["42", '"42"'],
      ["# no", '"# no"'],
      ["two words", "two words"],
    ] as const) {
      expect(setFrontmatterValue(text, "title", next)).toContain(`title: ${written}\n`);
    }
    expect(setFrontmatterValue(text, "empty", "set")).toContain("empty: set\n");
    expect(setFrontmatterValue("---\nt: 'a'\n---\n", "t", "it's")).toContain("t: 'it''s'");
  });
});

describe("propertyOptions", () => {
  it("offers task menus and keeps the file's spelling", () => {
    const status = read('---\nstatus: "Not Started"\n---\n', "status")!;
    expect(propertyOptions(status, "task")?.values[0]).toBe("Not Started");
    expect(propertyOptions(status, undefined)?.values).toContain("Not Started");
  });

  it("leaves another file type's own words as free text", () => {
    const status = read("---\nstatus: Active\n---\n", "status")!;
    expect(propertyOptions(status, "decision")).toBeNull();
    expect(propertyOptions(status, "task")?.values[0]).toBe("Active");
  });
});

describe("layout helpers", () => {
  it("puts the properties people change first", () => {
    expect(
      orderProperties(parseFrontmatter(CARD)!.properties)
        .slice(0, 3)
        .map((property) => property.key),
    ).toEqual(["status", "priority", "autonomous"]);
  });

  it("splits off a leading heading only", () => {
    expect(splitLeadingHeading("\n# T\nText")).toEqual({ heading: "\n# T\n", rest: "Text" });
    expect(splitLeadingHeading("Text\n# T")).toEqual({ heading: "", rest: "Text\n# T" });
  });
});
