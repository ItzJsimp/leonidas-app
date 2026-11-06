// @effect-diagnostics nodeBuiltinImport:off - The advisor runs one PowerShell command on demand.
/**
 * PC advisor for the Models tab: which programs hold the most video and system memory while a
 * model runs. Read only. It names programs and gives a plain hint; it never stops a program.
 */
import type { LocalModelsAdvice, LocalModelsAdviceItem } from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";

const MB = 1024 ** 2;
/** Ignore programs that hold less than this much. */
const MIN_VRAM_BYTES = 200 * MB;
const MIN_RAM_BYTES = 500 * MB;
const MAX_ITEMS_PER_KIND = 5;

/** Programs that belong to the model setup itself, so the advisor never lists them. */
const OWN_PROGRAMS =
  /^(ollama|ollama app|ollama_llama_server|leonidas code|leonidas|node|electron)$/i;

/** Plain hints for programs that often hold memory on a game and AI PC. */
const HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/comfyui|python/i, "An image tool may be running. Close it to free memory for the model."],
  [
    /nvidia (overlay|share)|nvcontainer|nvidia web helper/i,
    "The NVIDIA overlay holds memory. You can turn it off in GeForce Experience.",
  ],
  [/roblox/i, "Roblox Studio holds a lot of memory. Close it while a large model runs."],
  [/chrome|msedge|firefox|brave/i, "A browser holds memory. Close tabs you do not need."],
  [
    /discord|spotify|steam/i,
    "This app holds memory in the background. Close it if the model is slow.",
  ],
];

export function hintFor(name: string): string | null {
  return HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/** The PowerShell script. It prints `vram|name|bytes|count` and `ram|name|bytes|count` lines. */
const ADVISOR_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$names = @{}
Get-Process | ForEach-Object { $names[[int]$_.Id] = $_.ProcessName }
$vram = @{}
(Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage').CounterSamples | ForEach-Object {
  $m = [regex]::Match($_.InstanceName, 'pid_(\\d+)')
  if ($m.Success) {
    $n = $names[[int]$m.Groups[1].Value]
    if ($n) { $vram[$n] = [long]$vram[$n] + [long]$_.CookedValue }
  }
}
$vram.GetEnumerator() | ForEach-Object { 'vram|' + $_.Key + '|' + $_.Value + '|1' }
Get-Process | Group-Object ProcessName | ForEach-Object {
  'ram|' + $_.Name + '|' + ($_.Group | Measure-Object WorkingSet64 -Sum).Sum + '|' + $_.Count
}
`;

/** Turn the script output into advice items: biggest first, small and own programs dropped. */
export function parseAdvisorOutput(text: string): ReadonlyArray<LocalModelsAdviceItem> {
  const items: LocalModelsAdviceItem[] = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length !== 4) continue;
    const [kind, name, bytesText, countText] = parts as [string, string, string, string];
    if (kind !== "vram" && kind !== "ram") continue;
    const bytes = Number(bytesText);
    const count = Number(countText);
    if (!Number.isFinite(bytes) || name.length === 0 || OWN_PROGRAMS.test(name)) continue;
    if (bytes < (kind === "vram" ? MIN_VRAM_BYTES : MIN_RAM_BYTES)) continue;
    items.push({
      kind,
      name,
      memoryBytes: Math.round(bytes),
      processes: Number.isFinite(count) && count > 0 ? Math.round(count) : 1,
      hint: hintFor(name),
    });
  }
  const top = (kind: "vram" | "ram") =>
    items
      .filter((item) => item.kind === kind)
      .toSorted((left, right) => right.memoryBytes - left.memoryBytes)
      .slice(0, MAX_ITEMS_PER_KIND);
  return [...top("vram"), ...top("ram")];
}

/** Read the advisor data once. Windows only: other systems get an empty list. */
export function readAdvice(now: () => number): Promise<LocalModelsAdvice> {
  if (NodeProcess.platform !== "win32") {
    return Promise.resolve({ at: now(), supported: false, items: [] });
  }
  return new Promise((resolve) => {
    NodeChildProcess.execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ADVISOR_SCRIPT],
      { timeout: 15_000, windowsHide: true, maxBuffer: 4 * MB },
      (_error, out) =>
        resolve({ at: now(), supported: true, items: parseAdvisorOutput(String(out ?? "")) }),
    );
  });
}
