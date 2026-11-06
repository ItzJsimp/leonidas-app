/**
 * Renders the no-chat AIOS folder script from the starter preset. The committed
 * scripts/New-AiosFolders.ps1 is this output (scripts/generate-aios-folders.ts writes it);
 * a test fails when the two drift apart.
 */
import { describeInspection, type FolderInspection } from "./folderInspection.logic.ts";

export interface AiosFolderEntry {
  readonly path: string;
}

/** Characters Windows refuses in a folder name; a slash would also start a sub-folder. */
const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

/** A folder name the user typed, made safe to use as one path segment. */
export function cleanAiosFolderName(name: string): string {
  return name
    .replace(INVALID_NAME_CHARACTERS, "")
    .trim()
    .replace(/[. ]+$/, "");
}

/** Splits a stored folder path into the folder that holds it and its own name. */
export function splitAiosFolder(folder: string): { location: string; name: string } {
  const trimmed = folder.trim();
  if (trimmed === "~" || /^[a-zA-Z]:[\\/]?$/.test(trimmed)) return { location: trimmed, name: "" };
  const withoutTrailing = trimmed.replace(/[\\/]+$/, "");
  const cut = Math.max(withoutTrailing.lastIndexOf("/"), withoutTrailing.lastIndexOf("\\"));
  if (cut < 0) return { location: "", name: withoutTrailing };
  const location = withoutTrailing.slice(0, cut) || withoutTrailing.slice(0, cut + 1);
  return {
    location: /^[a-zA-Z]:$/.test(location) ? `${location}\\` : location,
    name: withoutTrailing.slice(cut + 1),
  };
}

/**
 * Joins a location and a name into one folder path, or null while either is missing.
 * The location keeps its own separator style, so a Windows path stays a Windows path.
 */
export function joinAiosFolder(location: string, name: string): string | null {
  const base = location.trim();
  const cleanName = cleanAiosFolderName(name);
  if (base.length === 0 || cleanName.length === 0) return null;
  if (/[\\/]$/.test(base)) return `${base}${cleanName}`;
  const windowsStyle = /^[a-zA-Z]:$/.test(base) || (base.includes("\\") && !base.includes("/"));
  return `${base}${windowsStyle ? "\\" : "/"}${cleanName}`;
}

export interface AiosFolderNotice {
  /** `info` explains a normal case; `warning` is a real problem. Both let the user continue. */
  readonly tone: "info" | "warning";
  readonly lines: readonly string[];
}

/**
 * What to tell the user about the chosen folder before the setup chat writes there.
 * A folder that already holds files is normal (Documents is full of them), so it gets a plain
 * explanation, not a warning. A folder that cannot be checked or read keeps the warning.
 */
export function describeAiosFolder(inspection: FolderInspection): AiosFolderNotice | null {
  if (inspection._tag === "directory") {
    const items = inspection.directoryCount + inspection.fileCount;
    if (items === 0) return null;
    const lines = [
      `This folder already has ${items} ${items === 1 ? "item" : "items"} in it. That is fine.`,
      "Leonidas adds the AIOS files next to your own files and leaves yours alone.",
    ];
    if (inspection.existingFiles.length > 0) {
      lines.push(
        `These AIOS files already exist: ${inspection.existingFiles.slice(0, 6).join(", ")}. Your AI reads them first and asks before it changes them.`,
      );
    }
    return { tone: "info", lines };
  }
  const lines = describeInspection(inspection);
  return lines.length === 0 ? null : { tone: "warning", lines };
}

/** PowerShell single-quoted strings escape a quote by doubling it. */
function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Raw file on the public main branch; the installed app has no repo checkout to run it from. */
export const AIOS_FOLDERS_SCRIPT_URL =
  "https://raw.githubusercontent.com/ItzJsimp/leonidas-app/main/scripts/New-AiosFolders.ps1";

/** A leading ~/ becomes the user's home, since PowerShell would not expand it inside quotes. */
function psFolderArgument(folder: string): string {
  const underHome = folder.match(/^~(?:[\\/](.*))?$/);
  if (!underHome) return psQuote(folder);
  const rest = underHome[1] ?? "";
  return rest ? `(Join-Path $HOME ${psQuote(rest)})` : "$HOME";
}

/** One PowerShell line that creates the starter AIOS folders with no chat. */
export function buildAiosFoldersCommand(folder: string): string {
  return `& ([scriptblock]::Create((irm ${AIOS_FOLDERS_SCRIPT_URL}))) -Path ${psFolderArgument(folder)}`;
}

export function renderAiosFoldersScript(entries: readonly AiosFolderEntry[]): string {
  const entryLines = entries.map((entry) => `  ${psQuote(entry.path)}`).join("\n");

  return `# GENERATED from AIOS_PRESET (apps/web/src/onboarding/leonidasSetup.logic.ts). Do not edit by hand.
# To change it: edit the preset, then run: node scripts/generate-aios-folders.ts
# Creates the starter AIOS folders and empty files without a chat. Existing files are kept.

[CmdletBinding()]
param(
  [string]$Path = (Join-Path $HOME 'AIOS')
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($Path)
New-Item -ItemType Directory -Force -Path $root | Out-Null

$entries = @(
${entryLines}
)
foreach ($entry in $entries) {
  $target = Join-Path $root $entry
  if ($entry.EndsWith('/')) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
  } elseif (-not (Test-Path -LiteralPath $target)) {
    New-Item -ItemType File -Path $target | Out-Null
  }
}
Write-Host "AIOS folders ready at $root"
`;
}
