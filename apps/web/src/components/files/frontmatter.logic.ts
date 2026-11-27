/**
 * A line-based reader and writer for a file's YAML front matter. It never reprints the block:
 * a change rewrites one value on one line, so comments, order, quotes and line endings stay.
 * Anything it cannot rewrite safely (nested maps, block text, anchors) is read-only.
 */
export type FrontmatterKind = "text" | "boolean" | "date" | "list" | "readonly";

export interface FrontmatterProperty {
  readonly key: string;
  readonly kind: FrontmatterKind;
  /** The value without quotes. For a read-only block, its lines joined. */
  readonly value: string;
  readonly items: ReadonlyArray<string>;
}

export interface Frontmatter {
  readonly properties: ReadonlyArray<FrontmatterProperty>;
  /** Index of the first character after the closing `---` line. */
  readonly bodyOffset: number;
}

interface ScalarSpan {
  readonly start: number;
  readonly end: number;
  readonly quote: '"' | "'" | "";
}

interface ParsedProperty extends FrontmatterProperty {
  readonly span: ScalarSpan | null;
}

const BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)(?<=\n)---[ \t]*(?:\r?\n|$)/;
const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?=[ \t]|$)[ \t]*/;
const CONTINUATION = /^(?:[ \t]+\S|-(?:[ \t]|$))/;
const LIST_ITEM = /^[ \t]*-[ \t]+(.*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BOOLEAN = /^(?:true|false)$/i;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function unquote(raw: string): string | null {
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (raw.startsWith("'")) {
    return /^'(?:[^']|'')*'$/.test(raw) ? raw.slice(1, -1).replaceAll("''", "'") : null;
  }
  return raw;
}

function splitFlowList(inner: string): string[] {
  const items = inner.match(/"(?:\\.|[^"\\])*"|'(?:[^']|'')*'|[^,]+/g) ?? [];
  return items.map((item) => unquote(item.trim()) ?? item.trim()).filter((item) => item !== "");
}

function parseScalar(key: string, text: string, offset: number): ParsedProperty {
  const quoted = /^("(?:\\.|[^"\\])*"|'(?:[^']|'')*')[ \t]*(?:[ \t]#.*)?$/.exec(text);
  const comment = quoted ? -1 : text.search(/(?:^|[ \t])#/);
  const raw = quoted ? quoted[1]! : (comment < 0 ? text : text.slice(0, comment)).trimEnd();
  const readonly: ParsedProperty = { key, kind: "readonly", value: raw, items: [], span: null };
  if (!quoted) {
    if (raw.startsWith("[") && raw.endsWith("]")) {
      return { ...readonly, kind: "list", items: splitFlowList(raw.slice(1, -1)) };
    }
    if (/^["'[\]{}&*!|>%@`]/.test(raw)) return readonly;
  }
  const value = unquote(raw);
  if (value === null) return readonly;
  const quote = quoted ? (raw[0] as '"' | "'") : "";
  const kind: FrontmatterKind =
    !quote && BOOLEAN.test(value) ? "boolean" : DATE.test(value) ? "date" : "text";
  return { key, kind, value, items: [], span: { start: offset, end: offset + raw.length, quote } };
}

function parse(text: string): { properties: ParsedProperty[]; bodyOffset: number } | null {
  const match = BLOCK.exec(text);
  if (!match) return null;
  const start = text.indexOf("\n") + 1;
  const lines = match[1]!.split("\n");
  const properties: ParsedProperty[] = [];
  let offset = start;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, "");
    const lineOffset = offset;
    offset += lines[i]!.length + 1;
    if (line.trim() === "" || line.startsWith("#")) continue;
    const key = KEY_LINE.exec(line);
    // A line that is not YAML means this block is ordinary text between two rules.
    if (!key) return null;
    const rest = line.slice(key[0].length).trimEnd();
    const nested: string[] = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1]!.replace(/\r$/, "");
      const blankInside = next.trim() === "" && /^[ \t]+\S/.test(lines[i + 2] ?? "");
      if (!CONTINUATION.test(next) && !blankInside) break;
      nested.push(next);
      offset += lines[++i]!.length + 1;
    }
    if (nested.length === 0) {
      properties.push(parseScalar(key[1]!, rest, lineOffset + key[0].length));
      continue;
    }
    const isList = rest === "" && nested.every((item) => /^[ \t]*-[ \t]+[^:]*$/.test(item));
    const items = isList
      ? nested.map((item) => {
          const raw = LIST_ITEM.exec(item)![1]!.trim();
          return unquote(raw) ?? raw;
        })
      : [];
    const joined = [/^[|>][+-]?$/.test(rest) ? "" : rest, ...nested.map((item) => item.trim())]
      .filter(Boolean)
      .join(isList ? ", " : " ");
    properties.push({
      key: key[1]!,
      kind: isList ? "list" : "readonly",
      value: joined,
      items,
      span: null,
    });
  }
  if (properties.length === 0) return null;
  // A repeated key has no single line to rewrite.
  const counts = new Map<string, number>();
  for (const { key } of properties) counts.set(key, (counts.get(key) ?? 0) + 1);
  return {
    properties: properties.map((property) =>
      counts.get(property.key)! > 1 ? { ...property, kind: "readonly", span: null } : property,
    ),
    bodyOffset: match[0].length,
  };
}

export function parseFrontmatter(text: string): Frontmatter | null {
  return parse(text);
}

function formatScalar(next: string, previous: ParsedProperty): string {
  const quote = previous.span!.quote;
  if (quote === '"') return JSON.stringify(next);
  if (quote === "'" && !/[\r\n]/.test(next)) return `'${next.replaceAll("'", "''")}'`;
  const changesType =
    (BOOLEAN.test(next) && previous.kind !== "boolean") ||
    (NUMBER.test(next) && !NUMBER.test(previous.value)) ||
    /^(?:null|~)$/i.test(next);
  const plain =
    next !== "" &&
    next === next.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`](?=[ \t]|$)|^[,[\]{}#&*!|>'"%@`]/.test(next) &&
    !/:(?:[ \t]|$)|[ \t]#|[\r\n\t]/.test(next);
  return plain && !changesType ? next : JSON.stringify(next);
}

/** The text with one property set. Returns the text unchanged when the property is read-only. */
export function setFrontmatterValue(text: string, key: string, value: string): string {
  const property = parse(text)?.properties.find((candidate) => candidate.key === key);
  if (!property?.span || property.value === value) return text;
  const { start, end } = property.span;
  // `key:` with no value needs the space that separates it from the new one.
  const space = text[start - 1] === ":" ? " " : "";
  return `${text.slice(0, start)}${space}${formatScalar(value, property)}${text.slice(end)}`;
}

export type PropertyTone = "state" | "success" | "warning" | "error";

interface PropertyOptions {
  readonly values: ReadonlyArray<string>;
  readonly tones?: Readonly<Record<string, PropertyTone>>;
  /** Offer the menu on any file of this `type`, even when the value is not in the list. */
  readonly type?: string;
}

// The option lists of an AIOS: task cards first, then the fields shared by all canon files.
const OPTIONS: Readonly<Record<string, PropertyOptions>> = {
  status: {
    type: "task",
    values: [
      "Not started",
      "In progress",
      "Blocked",
      "Dormant",
      "Awaiting Review",
      "Done",
      "Retired",
    ],
    tones: {
      "In progress": "state",
      Blocked: "error",
      "Awaiting Review": "state",
      Done: "success",
    },
  },
  priority: {
    type: "task",
    values: ["Critical", "High", "Medium", "Low"],
    tones: { Critical: "error", High: "warning" },
  },
  effort: { type: "task", values: ["Low", "Medium", "High"] },
  energy_type: { type: "task", values: ["Deep Work", "Quick Win", "Admin", "Strategic"] },
  lane: { type: "task", values: ["hermes", "leonidas", "grill", "draft", "human"] },
  scope: { values: ["personal", "structural"] },
  kind: { values: ["state", "event", "procedure"] },
  load: { values: ["always", "on-demand", "reference"] },
};

/** The menu for a property, or null for a free value. The current value is always listed. */
export function propertyOptions(
  property: FrontmatterProperty,
  fileType: string | undefined,
): PropertyOptions | null {
  if (property.kind !== "text" || !Object.hasOwn(OPTIONS, property.key)) return null;
  const options = OPTIONS[property.key]!;
  const match = options.values.find(
    (option) => option.toLowerCase() === property.value.toLowerCase(),
  );
  if (match === property.value) return options;
  if (match === undefined && (options.type === undefined || options.type !== fileType)) return null;
  // Keep the file's own spelling in place of the standard one.
  return {
    ...options,
    values: match
      ? options.values.map((option) => (option === match ? property.value : option))
      : [property.value, ...options.values].filter(Boolean),
  };
}

const LEAD_KEYS = [
  "status",
  "priority",
  "effort",
  "energy_type",
  "lane",
  "project",
  "due",
  "last_touched",
  "autonomous",
];

/** The properties people change most come first; the rest keep the file's order. */
export function orderProperties(
  properties: ReadonlyArray<FrontmatterProperty>,
): ReadonlyArray<FrontmatterProperty> {
  const rank = ({ key }: FrontmatterProperty) => {
    const index = LEAD_KEYS.indexOf(key);
    return index < 0 ? LEAD_KEYS.length : index;
  };
  return properties.toSorted((a, b) => rank(a) - rank(b));
}

export function propertyLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A leading `# Title` stays above the properties, as in a document header. */
export function splitLeadingHeading(body: string): { heading: string; rest: string } {
  const heading = /^(?:[ \t]*\r?\n)*# [^\r\n]*(?:\r?\n|$)/.exec(body)?.[0] ?? "";
  return { heading, rest: body.slice(heading.length) };
}
