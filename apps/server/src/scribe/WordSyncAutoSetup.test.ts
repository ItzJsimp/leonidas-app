import { expect, it } from "@effect/vitest";

import { autoWordSyncDir } from "./WordSyncAutoSetup.ts";

it("builds the folder inside a Windows AIOS", () => {
  expect(autoWordSyncDir({}, "D:\\Leonidas AIOS")).toBe("D:\\Leonidas AIOS\\scribe\\words");
});

it("builds the folder inside a POSIX AIOS", () => {
  expect(autoWordSyncDir({ other: 1 }, "/home/jake/aios")).toBe("/home/jake/aios/scribe/words");
});

it("leaves a user alone who chose a folder or turned sync off", () => {
  expect(autoWordSyncDir({ wordSyncDir: "E:\\words" }, "D:\\aios")).toBeNull();
  // A blank is the user's "Turn off". It must never switch back on.
  expect(autoWordSyncDir({ wordSyncDir: "" }, "D:\\aios")).toBeNull();
});

it("does nothing without an AIOS folder", () => {
  expect(autoWordSyncDir({}, null)).toBeNull();
});
