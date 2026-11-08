// @effect-diagnostics nodeBuiltinImport:off - checks for the AIOS register script on disk.
import type { AutomationEntry } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { Exec } from "./check.ts";
import { readRegister } from "./register.ts";

export const TASK_PREFIX = "task:";
const SAFE_NAME = /^[A-Za-z0-9 ._-]{1,200}$/;
const REGISTER_SCRIPT = "scripts/Get-AutomationSurface.ps1";

export type TaskAction =
  | { readonly kind: "enable" | "disable" | "run" }
  | { readonly kind: "time"; readonly timeOfDay: string };

/**
 * The PowerShell for one action. `schtasks /Change` asks for the account password on S4U tasks
 * when it has no console, so the task cmdlets run instead: they keep the stored sign-in.
 * Only a name the register lists and SAFE_NAME allows (no quotes) reaches this.
 */
export function taskScript(name: string, action: TaskAction): string {
  const task = `'${name}'`;
  switch (action.kind) {
    case "enable":
      return `Enable-ScheduledTask -TaskName ${task} | Out-Null`;
    case "disable":
      return `Disable-ScheduledTask -TaskName ${task} | Out-Null`;
    case "run":
      return `Start-ScheduledTask -TaskName ${task}`;
    case "time": {
      const [hour, minute] = action.timeOfDay.split(":").map(Number);
      return [
        `$t = Get-ScheduledTask -TaskName ${task}`,
        `foreach ($tr in $t.Triggers) { if ($tr.StartBoundary) { $tr.StartBoundary = ([datetime]$tr.StartBoundary).Date.AddHours(${hour}).AddMinutes(${minute}).ToString('yyyy-MM-ddTHH:mm:ss') } }`,
        "Set-ScheduledTask -InputObject $t | Out-Null",
      ].join("; ");
    }
  }
}

/**
 * Starts, stops, runs or retimes one Windows task from the register, then rebuilds the
 * register so the tab and `wiki/automation-register.md` show the same state.
 */
export async function controlWindowsTask(
  root: string,
  id: string,
  action: TaskAction,
  exec: Exec,
): Promise<AutomationEntry> {
  const listed = readRegister(root).entries.find((entry) => entry.id === id);
  const name = id.slice(TASK_PREFIX.length);
  if (!listed || listed.kind !== "windows_task" || !SAFE_NAME.test(name)) {
    throw new Error(`The automation register has no Windows task "${name}".`);
  }
  if (action.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(action.timeOfDay)) {
    throw new Error("Use a time like 08:30.");
  }
  const result = await exec(
    "pwsh",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference = 'Stop'; ${taskScript(name, action)}`,
    ],
    { cwd: root, timeoutMs: 30_000 },
  );
  if (result.code !== 0) {
    throw new Error(
      (result.stderr || result.stdout).trim() ||
        `Windows Task Scheduler refused the change for ${name}.`,
    );
  }
  if (NodeFS.existsSync(NodePath.join(root, REGISTER_SCRIPT))) {
    await exec("pwsh", ["-NoProfile", "-File", REGISTER_SCRIPT], { cwd: root, timeoutMs: 120_000 });
  }
  return readRegister(root).entries.find((entry) => entry.id === id) ?? listed;
}
