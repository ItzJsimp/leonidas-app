// @effect-diagnostics nodeBuiltinImport:off - tests write a register JSON in a temp AIOS.
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { Exec } from "./check.ts";
import { controlWindowsTask } from "./windowsTasks.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function aios() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-"));
  roots.push(root);
  NodeFS.mkdirSync(NodePath.join(root, "wiki"));
  NodeFS.writeFileSync(
    NodePath.join(root, "wiki", "automation-register.json"),
    JSON.stringify({
      builtAt: "2026-11-08T04:18:00Z",
      entries: [
        {
          id: "task:AIOS-Daily-Briefing",
          kind: "windows_task",
          name: "AIOS-Daily-Briefing",
          schedule: "Daily at 6:00 AM",
          enabled: true,
        },
        { id: "daemon:42", kind: "daemon", name: "voice.py (PID 42)" },
      ],
    }),
  );
  return root;
}

describe("controlWindowsTask", () => {
  it("runs the task cmdlets with no console for a listed task", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (command, args) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: "SUCCESS", stderr: "" };
    };
    const root = aios();
    await controlWindowsTask(root, "task:AIOS-Daily-Briefing", { kind: "disable" }, exec);
    await controlWindowsTask(
      root,
      "task:AIOS-Daily-Briefing",
      { kind: "time", timeOfDay: "06:30" },
      exec,
    );
    await controlWindowsTask(root, "task:AIOS-Daily-Briefing", { kind: "run" }, exec);
    expect(calls.map((call) => call.at(-1))).toEqual([
      "$ErrorActionPreference = 'Stop'; Disable-ScheduledTask -TaskName 'AIOS-Daily-Briefing' | Out-Null",
      expect.stringContaining(".AddHours(6).AddMinutes(30)"),
      "$ErrorActionPreference = 'Stop'; Start-ScheduledTask -TaskName 'AIOS-Daily-Briefing'",
    ]);
    expect(calls.every((call) => call[0] === "pwsh" && call.includes("-NonInteractive"))).toBe(
      true,
    );
  });

  it("refuses names the register does not list, daemons and bad times", async () => {
    const exec: Exec = async () => ({ code: 0, stdout: "", stderr: "" });
    const root = aios();
    await expect(
      controlWindowsTask(root, "task:Not-Listed", { kind: "run" }, exec),
    ).rejects.toThrow("no Windows task");
    await expect(controlWindowsTask(root, "daemon:42", { kind: "run" }, exec)).rejects.toThrow();
    await expect(
      controlWindowsTask(
        root,
        "task:AIOS-Daily-Briefing",
        { kind: "time", timeOfDay: "6pm" },
        exec,
      ),
    ).rejects.toThrow("Use a time like 08:30.");
  });

  it("reports the schtasks error text", async () => {
    const exec: Exec = async () => ({ code: 1, stdout: "", stderr: "ERROR: Access is denied." });
    await expect(
      controlWindowsTask(aios(), "task:AIOS-Daily-Briefing", { kind: "enable" }, exec),
    ).rejects.toThrow("Access is denied");
  });
});
