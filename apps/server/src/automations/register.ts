// @effect-diagnostics nodeBuiltinImport:off - reads the register JSON that the AIOS script writes.
import { type AutomationEntry, AutomationKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/** Written by `scripts/Get-AutomationSurface.ps1` from the same rows as `wiki/automation-register.md`. */
export const REGISTER_FILE = "wiki/automation-register.json";

const isKind = Schema.is(AutomationKind);

export interface RegisterRow {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly name?: unknown;
  readonly line?: unknown;
  readonly schedule?: unknown;
  readonly status?: unknown;
  readonly enabled?: unknown;
  readonly lastRunAt?: unknown;
  readonly lastResult?: unknown;
  readonly nextRunAt?: unknown;
  readonly file?: unknown;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** One register row as a tab entry. Rows without an id, a known kind or a name are dropped. */
export function registerEntry(row: RegisterRow): AutomationEntry | null {
  const id = text(row.id);
  const name = text(row.name);
  if (id === null || name === null || !isKind(row.kind)) return null;
  const result = text(row.lastResult);
  const file = text(row.file);
  return {
    id,
    kind: row.kind,
    name,
    line: text(row.line) ?? text(row.status) ?? "",
    scheduleText: text(row.schedule) ?? "Always on",
    enabled: typeof row.enabled === "boolean" ? row.enabled : null,
    lastRunAt: text(row.lastRunAt),
    lastResult:
      result === "ok" || result === "failed" || result === "findings" || result === "running"
        ? result
        : result === null
          ? "never"
          : "skipped",
    lastSummary: text(row.status),
    nextRunAt: text(row.nextRunAt),
    canRunNow: false,
    ...(file === null ? {} : { file }),
  };
}

export function readRegister(root: string): {
  readonly builtAt: string | null;
  readonly entries: ReadonlyArray<AutomationEntry>;
} {
  try {
    const value = JSON.parse(NodeFS.readFileSync(NodePath.join(root, REGISTER_FILE), "utf8")) as {
      builtAt?: unknown;
      entries?: unknown;
    };
    const rows = Array.isArray(value.entries) ? (value.entries as RegisterRow[]) : [];
    return {
      builtAt: text(value.builtAt),
      entries: rows.flatMap((row) => registerEntry(row) ?? []),
    };
  } catch {
    return { builtAt: null, entries: [] };
  }
}
