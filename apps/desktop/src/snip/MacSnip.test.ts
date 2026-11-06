// @effect-diagnostics nodeBuiltinImport:off -- The test checks the temporary file the macOS selector writes, with real Node file calls.
import * as NodeFSP from "node:fs/promises";

import { assert, describe, it } from "vite-plus/test";

import { captureMacSnip, macSnipArguments } from "./MacSnip.ts";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("rest-of-image"),
]);
const outputOf = (args: ReadonlyArray<string>) => args[args.length - 1]!;

describe("captureMacSnip", () => {
  it("asks the system selector for a silent PNG at the file it will read", async () => {
    let seen: ReadonlyArray<string> = [];
    await captureMacSnip(async (args) => {
      seen = args;
    });
    assert.deepStrictEqual(seen.slice(0, 4), ["-i", "-x", "-t", "png"]);
    assert.deepStrictEqual(seen, macSnipArguments(outputOf(seen)));
  });

  it("returns the PNG the selector wrote and removes its temporary folder", async () => {
    let written = "";
    const png = await captureMacSnip(async (args) => {
      written = outputOf(args);
      await NodeFSP.writeFile(written, PNG);
    });
    assert.isTrue(png !== null && png.equals(PNG));
    assert.isFalse(
      await NodeFSP.access(written).then(
        () => true,
        () => false,
      ),
    );
  });

  it("treats Esc as a cancel, even when the tool exits with a number", async () => {
    assert.isNull(await captureMacSnip(async () => {}));
    assert.isNull(
      await captureMacSnip(async () => {
        throw Object.assign(new Error("exit"), { code: 1 });
      }),
    );
  });

  it("fails when the tool cannot run or returns something that is not a PNG", async () => {
    let failure: unknown;
    try {
      await captureMacSnip(async () => {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      });
    } catch (error) {
      failure = error;
    }
    assert.isTrue(failure instanceof Error && /not found/.test(failure.message));

    failure = undefined;
    try {
      await captureMacSnip(async (args) => {
        await NodeFSP.writeFile(outputOf(args), Buffer.from("not a png at all"));
      });
    } catch (error) {
      failure = error;
    }
    assert.isTrue(failure instanceof Error && /invalid snip/.test(failure.message));
  });
});
