import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export type ActivityKind =
  | "read"
  | "write"
  | "search"
  | "command"
  | "web"
  | "skill"
  | "memory"
  | "tool"
  | "agent";

export interface ActivityEvent {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly running: boolean;
  readonly failed: boolean;
  /** `Reading` while running, `Read` once done. */
  readonly label: string;
  readonly target: string | null;
  /** The file this event touched, when it touched one. */
  readonly path: string | null;
  readonly durationMs: number | null;
}

export type AccessKind = "read" | "write";

/** Canon folders of an AIOS checkout; a path starting in one of them is the agent using the AIOS. */
const AIOS_FOLDERS = new Set([
  "memory",
  "tasks",
  "decisions",
  "standards",
  "modes",
  "wiki",
  "logs",
  "domains",
  "ideal-state",
  "handoff-docs",
  "audits",
  "contacts",
  "capture",
  "prompts",
  "templates",
  "workflows",
  "tools",
  "dashboards",
]);
const AIOS_ROOT_FILE =
  /^(?:AGENTS|CLAUDE|MASTER-INSTRUCTIONS|INTENT|TASKS|BUILD-PLAN|CONTEXT|connections)\.md$/i;
const SKILL_FOLDER = /(?:^|\/)skills\/([^/]+)\//i;
const ABSOLUTE = /^(?:[A-Za-z]:\/|\/)/;

export type PathClass =
  | { readonly area: "skill"; readonly skill: string }
  | { readonly area: "aios"; readonly folder: string; readonly relative: string }
  | { readonly area: "file" };

/** Skill folder, AIOS canon folder, or an ordinary project file. */
export function classifyAccessPath(path: string): PathClass {
  const normalized = path.trim().replaceAll("\\", "/");
  const skill = SKILL_FOLDER.exec(normalized)?.[1];
  if (skill) return { area: "skill", skill };
  const segments = normalized.split("/").filter(Boolean);
  // `D:/Leonidas AIOS/memory/core.md` and the relative `memory/core.md` an agent
  // running inside the AIOS passes both land here; other absolute paths never match.
  const aiosIndex = segments.findIndex((segment) => /\bAIOS\b/i.test(segment));
  const relative =
    aiosIndex >= 0
      ? segments.slice(aiosIndex + 1)
      : ABSOLUTE.test(normalized)
        ? []
        : segments.filter((segment) => segment !== ".");
  const [first] = relative;
  if (first && AIOS_FOLDERS.has(first.toLowerCase()) && relative.length > 1) {
    return { area: "aios", folder: first.toLowerCase(), relative: relative.join("/") };
  }
  if (first && relative.length === 1 && AIOS_ROOT_FILE.test(first)) {
    return { area: "aios", folder: "root", relative: first };
  }
  return { area: "file" };
}

const READ_COMMAND =
  /\b(?:Get-Content|gc|cat|type|head|tail|sed|less|more|bat|Select-String|rg|grep)\b/i;
const QUOTED = /(['"])((?:(?!\1).)+)\1/g;
const BARE_PATH = /[\w.\\/:-]+\.(?:md|ts|tsx|json|ps1|py|yml|yaml|txt|css|js|mjs|toml)\b/g;
const SHELL_LAUNCHER =
  /^"?[^"]*?(?:pwsh|powershell|bash|zsh|cmd|sh)(?:\.exe)?"?\s+(?:-NoProfile\s+)?(?:-Command|-c|-lc|\/c)\s+/i;

function looksLikePath(token: string): boolean {
  return (
    token.length <= 260 &&
    !/[\n$|;<>*]/.test(token) &&
    (/[\\/]/.test(token) || /\.\w{1,5}$/.test(token)) &&
    !token.startsWith("-") &&
    !/^(?:https?:)?\/\//.test(token)
  );
}

/** Files a shell command reads (`Get-Content 'memory/core.md'`, `cat a.md b.md`); none for other commands. */
export function commandReadPaths(command: string): string[] {
  if (!READ_COMMAND.test(command)) return [];
  const found = new Set<string>();
  for (const match of command.matchAll(QUOTED)) {
    const token = match[2]!.trim();
    if (looksLikePath(token) && !READ_COMMAND.test(token)) found.add(token);
  }
  for (const match of command.matchAll(BARE_PATH)) {
    if (looksLikePath(match[0])) found.add(match[0]);
  }
  // A quoted path also matches the bare scan; keep the longer, quoted spelling only.
  return [...found].filter(
    (path) => ![...found].some((other) => other !== path && other.includes(path)),
  );
}

/** The command without its `pwsh -Command "..."` wrapper, on one line. */
export function readableCommand(command: string): string {
  const unwrapped = command
    .trim()
    .replace(SHELL_LAUNCHER, "")
    .replace(/^(["'])([\s\S]*)\1$/, "$2");
  // `cd "<repo>" && gh run list` is about `gh run list`, not the directory change.
  return (
    unwrapped
      .replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/i, "")
      // `rtk proxy` and `.\node_modules\.bin\vp.cmd` are launch plumbing; the user cares about `vp`.
      .replace(/^rtk\s+(?:proxy\s+)?(?=\S)/i, "")
      .replace(
        /^(?:\.[\\/]+)?node_modules[\\/]+\.bin[\\/]+([\w.-]+?)(?:\.(?:cmd|exe|ps1))?(?=\s|$)/i,
        "$1",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** The shell a command was launched through, for telling the user what they are waiting on. */
export function commandShell(command: string): "PowerShell" | "Bash" | "Command Prompt" | "Shell" {
  const launcher = SHELL_LAUNCHER.exec(command.trim())?.[0] ?? "";
  if (/pwsh|powershell/i.test(launcher)) return "PowerShell";
  if (/bash|zsh|(?:^|[\\/"])sh(?:\.exe)?"?\s/i.test(launcher)) return "Bash";
  if (/cmd/i.test(launcher)) return "Command Prompt";
  return "Shell";
}

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const LABELS: Record<ActivityKind, readonly [running: string, done: string]> = {
  read: ["Reading", "Read"],
  write: ["Editing", "Edited"],
  search: ["Searching", "Searched"],
  command: ["Running", "Ran"],
  web: ["Browsing", "Browsed"],
  skill: ["Loading skill", "Loaded skill"],
  memory: ["Checking memory", "Checked memory"],
  tool: ["Using", "Used"],
  agent: ["Starting helper", "Started helper"],
};

const WRITE_TOOLS = new Set(["edit", "write", "multiedit", "notebookedit", "applypatch"]);
const READ_TOOLS = new Set(["read", "view"]);
const SEARCH_TOOLS = new Set(["glob", "grep", "ls", "search"]);
const AGENT_TOOLS = new Set(["task", "agent", "sendmessage"]);

function humanize(name: string): string {
  return name.replace(/[-_]+/g, " ").trim();
}

/** `mcp__leonidas__thread_list` and `t3-code.thread_list` both read as server `t3 code`, tool `thread list`. */
function splitMcpToolName(toolName: string): { server: string; tool: string } | null {
  const claude = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (claude) return { server: humanize(claude[1]!), tool: humanize(claude[2]!) };
  const dotted = /^([^.]+)\.(.+)$/.exec(toolName);
  return dotted ? { server: humanize(dotted[1]!), tool: humanize(dotted[2]!) } : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function durationOf(item: OrchestrationV2TurnItem): number | null {
  if (!item.startedAt || !item.completedAt) return null;
  return Math.max(
    0,
    DateTime.toEpochMillis(item.completedAt) - DateTime.toEpochMillis(item.startedAt),
  );
}

export interface ClassifiedItem {
  readonly event: ActivityEvent | null;
  /** Files the item read or wrote, for the access lists. */
  readonly access: ReadonlyArray<{ readonly path: string; readonly access: AccessKind }>;
  /** A skill the item loaded, by name. */
  readonly skills: readonly string[];
  /** A non-file capability the item used: MCP tool, memory lookup. */
  readonly tool: string | null;
}

const NONE: ClassifiedItem = { event: null, access: [], skills: [], tool: null };

/** What a turn item means to a person watching: one event plus the context it touched. */
export function classifyActivityItem(item: OrchestrationV2TurnItem): ClassifiedItem {
  const running = item.status === "running" || item.status === "pending";
  const base = { id: item.id, running, durationMs: durationOf(item) };
  const make = (
    kind: ActivityKind,
    target: string | null,
    path: string | null = null,
    failed = item.status === "failed",
  ): ActivityEvent => ({
    ...base,
    kind,
    failed,
    label: LABELS[kind][running ? 0 : 1],
    target,
    path,
  });

  switch (item.type) {
    case "file_change": {
      const paths = [item.fileName, ...(item.changes?.map((change) => change.path) ?? [])];
      const unique = [...new Set(paths)];
      return {
        event: make("write", basename(item.fileName), item.fileName),
        access: unique.map((path) => ({ path, access: "write" as const })),
        skills: unique.flatMap((path) => {
          const found = classifyAccessPath(path);
          return found.area === "skill" ? [found.skill] : [];
        }),
        tool: null,
      };
    }
    case "file_search":
      return { ...NONE, event: make("search", item.pattern ? clip(item.pattern, 60) : null) };
    case "web_search": {
      const target =
        item.patterns?.[0] ?? item.results?.[0]?.url ?? item.results?.[0]?.title ?? null;
      return { ...NONE, event: make("web", target ? clip(target, 60) : null) };
    }
    case "subagent":
      return {
        ...NONE,
        event: make("agent", clip(item.title ?? item.prompt, 60)),
        tool: "Helper",
      };
    case "command_execution": {
      // The workspace-preparation step is setup, not something the agent chose to do.
      if (item.title === "Workspace ready" || item.input === "Preparing workspace") return NONE;
      const command = readableCommand(item.input);
      const reads = commandReadPaths(command);
      const failed =
        item.status === "failed" || (item.exitCode !== undefined && item.exitCode !== 0);
      const skills = reads.flatMap((path) => {
        const found = classifyAccessPath(path);
        return found.area === "skill" ? [found.skill] : [];
      });
      return {
        event:
          reads.length > 0
            ? make(
                "read",
                reads.length === 1 ? basename(reads[0]!) : `${reads.length} files`,
                reads[0]!,
                failed,
              )
            : make("command", clip(command, 70), null, failed),
        access: reads.map((path) => ({ path, access: "read" as const })),
        skills,
        tool: null,
      };
    }
    case "dynamic_tool": {
      const toolName = item.toolName ?? "";
      const key = toolName.toLowerCase().replace(/[\s_-]/g, "");
      const input = record(item.input);
      const path = str(input.file_path) ?? str(input.path) ?? str(input.notebook_path);
      if (key === "skill") {
        const name = str(input.skill);
        return name ? { event: make("skill", name), access: [], skills: [name], tool: null } : NONE;
      }
      if (key === "todowrite" || key === "toolsearch") return NONE;
      if (READ_TOOLS.has(key) && path) {
        const found = classifyAccessPath(path);
        return {
          event: make("read", basename(path), path),
          access: [{ path, access: "read" }],
          skills: found.area === "skill" ? [found.skill] : [],
          tool: null,
        };
      }
      if (WRITE_TOOLS.has(key) && path) {
        return {
          event: make("write", basename(path), path),
          access: [{ path, access: "write" }],
          skills: [],
          tool: null,
        };
      }
      if (SEARCH_TOOLS.has(key)) {
        // A bare path reads as its last two segments, not the whole drive path.
        const target =
          str(input.pattern) ??
          str(input.query) ??
          (path ? path.replaceAll("\\", "/").split("/").filter(Boolean).slice(-2).join("/") : null);
        return { ...NONE, event: make("search", target ? clip(target, 60) : null) };
      }
      if (AGENT_TOOLS.has(key)) {
        return {
          ...NONE,
          event: make("agent", clip(str(input.description) ?? str(input.prompt) ?? "a helper", 60)),
          tool: "Helper",
        };
      }
      // A named subagent start: the bar and the thread say who runs, not "a helper".
      if (key.endsWith("delegatetask") && str(input.subagent)) {
        return {
          ...NONE,
          event: make("agent", clip(`@${str(input.subagent)}`, 60)),
          tool: "Helper",
        };
      }
      const mcp = splitMcpToolName(toolName);
      if (/mem0/i.test(toolName)) {
        return {
          ...NONE,
          event: make("memory", clip(str(input.query) ?? "memories", 60)),
          tool: "Memory",
        };
      }
      if (/codebase.?memory/i.test(toolName)) {
        const target = str(input.name_pattern) ?? str(input.function_name) ?? str(input.project);
        return {
          ...NONE,
          event: make(
            "search",
            target ? `${mcp?.tool ?? "graph"}: ${clip(target, 48)}` : (mcp?.tool ?? "code graph"),
          ),
          tool: "Code graph",
        };
      }
      const name = mcp ? `${mcp.tool} · ${mcp.server}` : (item.title ?? humanize(toolName));
      return {
        ...NONE,
        event: make("tool", clip(name, 70)),
        tool: mcp?.server ? humanize(mcp.server) : name,
      };
    }
    default:
      return NONE;
  }
}

/** The first heading or sentence of a reasoning or assistant message, plain text. */
export function firstThought(text: string, max = 150): string | null {
  // The response banner (`Active Mode: ...`, `Focus: ...`) says nothing about the work.
  const stripped = text
    .replace(/\r/g, "")
    .split("\n")
    .filter(
      (line) =>
        !/^\W*(?:Active Modes?|Focus|Chat Title)\b/i.test(line) && !/^\s*-{3,}\s*$/.test(line),
    )
    .join("\n")
    .trim();
  if (!stripped) return null;
  const heading = /^\*\*(.+?)\*\*/.exec(stripped)?.[1];
  const line = (heading ?? stripped.split("\n").find((part) => part.trim()) ?? "")
    .replace(/[*_`#>]+/g, "")
    .trim();
  return line ? clip(line, max) : null;
}
