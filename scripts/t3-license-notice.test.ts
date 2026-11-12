// @effect-diagnostics nodeBuiltinImport:off - This test reads repository files.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const root = NodePath.resolve(import.meta.dirname, "..");

// The MIT license requires the original copyright and permission notice to ship with the app.
describe("original project license notice", () => {
  it("keeps the T3 Tools copyright in LICENSE", () => {
    const license = NodeFS.readFileSync(NodePath.join(root, "LICENSE"), "utf8");
    expect(license).toContain("Copyright (c) 2026 T3 Tools Inc.");
    expect(license).toContain("Permission is hereby granted, free of charge");
  });

  it("lists it in the open source licenses screen for desktop, web and mobile", () => {
    const config = JSON.parse(
      NodeFS.readFileSync(NodePath.join(root, "third-party-licenses.config.json"), "utf8"),
    ) as {
      customNotices: ReadonlyArray<{ noticeFile?: string; sourceUrl: string; bundles: string[] }>;
    };
    const notice = config.customNotices.find((entry) => entry.noticeFile === "LICENSE");
    expect(notice?.sourceUrl).toBe("https://github.com/pingdotgg/t3code");
    expect(notice?.bundles).toEqual(expect.arrayContaining(["desktop", "mobile", "web"]));
  });
});
