import { describe, expect, it } from "@effect/vitest";

import { makeGameModeRunner, parseStatus } from "./gameMode.ts";

const LINE = '{"mode":"on","watcher":true,"throttled":12,"virtualDisplay":"off"}';

describe("Game Mode runner", () => {
  it("reads the last JSON line and ignores earlier output", () => {
    expect(parseStatus(`noise\r\n${LINE}\r\n`)).toEqual({
      mode: "on",
      watcher: true,
      throttled: 12,
      virtualDisplay: "off",
      error: null,
    });
  });

  it.skipIf(process.platform !== "win32")(
    "passes the action name to the script and holds a read for ttl",
    async () => {
      const seen: string[] = [];
      const runner = makeGameModeRunner(async (action) => {
        seen.push(action);
        return LINE;
      }, 60_000);
      await runner.status();
      await runner.status();
      expect(seen).toEqual(["Status"]);
      const after = await runner.act("vddOff");
      expect(seen).toEqual(["Status", "VddOff"]);
      expect(after.virtualDisplay).toBe("off");
    },
  );

  it.skipIf(process.platform !== "win32")(
    "reports a script failure as error and does not hold it",
    async () => {
      let calls = 0;
      const runner = makeGameModeRunner(async () => {
        calls += 1;
        throw new Error("task not found");
      }, 60_000);
      expect((await runner.status()).error).toBe("task not found");
      await runner.status();
      expect(calls).toBe(2);
    },
  );
});
