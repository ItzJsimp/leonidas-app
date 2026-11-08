// @effect-diagnostics nodeBuiltinImport:off - reads and writes small state and task card files.
// @effect-diagnostics globalDate:off - card dates and the 7-day window use wall-clock time.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { CheckInput, CheckOutcome, Finding } from "./check.ts";

export type SourceGroup = "engines" | "skill-packs" | "blogs" | "design";

export interface FrontierSource {
  readonly id: string;
  readonly group: SourceGroup;
  readonly name: string;
  /** `releases` and `commits` read the GitHub API; `feed` reads RSS or Atom; `page` diffs links. */
  readonly kind: "releases" | "commits" | "feed" | "page";
  readonly url: string;
  /** For `page`: the path prefix of article links, such as `/ui/`. */
  readonly linkPrefix?: string;
}

const MIRROR = "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds";
const gh = (repo: string, kind: "releases" | "commits") =>
  `https://api.github.com/repos/${repo}/${kind}?per_page=10`;

/** Approved by Jake on 2026-11-07 (all 4 groups). Anthropic pages render in the browser, so their RSS mirrors are read. */
export const FRONTIER_SOURCES: ReadonlyArray<FrontierSource> = [
  {
    id: "claude-code",
    group: "engines",
    name: "Claude Code releases",
    kind: "releases",
    url: gh("anthropics/claude-code", "releases"),
  },
  {
    id: "codex",
    group: "engines",
    name: "Codex CLI releases",
    kind: "releases",
    url: gh("openai/codex", "releases"),
  },
  {
    id: "gemini-cli",
    group: "engines",
    name: "Gemini CLI releases",
    kind: "releases",
    url: gh("google-gemini/gemini-cli", "releases"),
  },
  {
    id: "anthropic-news",
    group: "engines",
    name: "Anthropic news",
    kind: "feed",
    url: `${MIRROR}/feed_anthropic_news.xml`,
  },
  {
    id: "anthropic-skills",
    group: "skill-packs",
    name: "anthropics/skills",
    kind: "commits",
    url: gh("anthropics/skills", "commits"),
  },
  {
    id: "impeccable",
    group: "skill-packs",
    name: "Impeccable releases",
    kind: "releases",
    url: gh("pbakaus/impeccable", "releases"),
  },
  {
    id: "superpowers",
    group: "skill-packs",
    name: "Superpowers releases",
    kind: "releases",
    url: gh("obra/superpowers", "releases"),
  },
  {
    id: "simon-willison",
    group: "blogs",
    name: "Simon Willison",
    kind: "feed",
    url: "https://simonwillison.net/atom/everything/",
  },
  {
    id: "latent-space",
    group: "blogs",
    name: "Latent Space",
    kind: "feed",
    url: "https://www.latent.space/feed",
  },
  {
    id: "anthropic-engineering",
    group: "blogs",
    name: "Anthropic engineering",
    kind: "feed",
    url: `${MIRROR}/feed_anthropic_engineering.xml`,
  },
  {
    id: "vercel",
    group: "design",
    name: "Vercel blog",
    kind: "feed",
    url: "https://vercel.com/atom",
  },
  {
    id: "emil-kowalski",
    group: "design",
    name: "Emil Kowalski",
    kind: "page",
    url: "https://emilkowal.ski",
    linkPrefix: "/ui/",
  },
  {
    id: "rauno",
    group: "design",
    name: "Rauno Freiberg",
    kind: "page",
    url: "https://rauno.me/craft",
    linkPrefix: "/craft/",
  },
];

export interface FrontierItem {
  readonly source: string;
  readonly title: string;
  readonly url: string;
}

export interface Proposal {
  readonly title: string;
  readonly change: string;
  readonly target: string;
  readonly url: string;
}

export interface FreeChatAnswer {
  readonly text: string;
  readonly engine: string;
  readonly model: string;
}

/** Free engines only. Null when none answered. The caller decides which engines count as free. */
export type FreeChat = (prompt: string) => Promise<FreeChatAnswer | null>;

export interface DigestDeps {
  readonly fetchText: (url: string) => Promise<string | null>;
  readonly freeChat: FreeChat;
  readonly sources?: ReadonlyArray<FrontierSource>;
}

const WEEK_MS = 7 * 24 * 3_600_000;
const MAX_ITEMS_PER_SOURCE = 5;
const MAX_PROPOSALS = 5;
const SEEN_FILE = "automations/frontier-seen.json";

const decode = (text: string) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** RSS `<item>` and Atom `<entry>` blocks newer than `since`. */
export function parseFeed(xml: string, since: number): Array<{ title: string; url: string }> {
  const items: Array<{ title: string; url: string }> = [];
  for (const block of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const text = block[0];
    const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/.exec(text)?.[1] ?? "");
    const url =
      /<link[^>]*href="([^"]+)"/.exec(text)?.[1] ??
      decode(/<link>([\s\S]*?)<\/link>/.exec(text)?.[1] ?? "");
    const date = /<(published|updated|pubDate|dc:date)>([\s\S]*?)<\/\1>/.exec(text)?.[2];
    const at = date ? Date.parse(decode(date)) : Number.NaN;
    if (!title || !url || !Number.isFinite(at) || at < since) continue;
    items.push({ title, url });
  }
  return items;
}

interface GitHubRelease {
  readonly name?: string | null;
  readonly tag_name?: string;
  readonly html_url?: string;
  readonly published_at?: string | null;
}
interface GitHubCommit {
  readonly html_url?: string;
  readonly commit?: { readonly message?: string; readonly committer?: { readonly date?: string } };
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parseGitHub(
  kind: "releases" | "commits",
  text: string,
  since: number,
): Array<{ title: string; url: string }> {
  if (kind === "releases") {
    return (parseJson<GitHubRelease[]>(text) ?? [])
      .filter((release) => Date.parse(release.published_at ?? "") >= since)
      .map((release) => ({
        title: release.name || release.tag_name || "release",
        url: release.html_url ?? "",
      }));
  }
  return (parseJson<GitHubCommit[]>(text) ?? [])
    .filter((commit) => Date.parse(commit.commit?.committer?.date ?? "") >= since)
    .map((commit) => ({
      title: (commit.commit?.message ?? "").split("\n")[0] ?? "",
      url: commit.html_url ?? "",
    }));
}

export function pageLinks(html: string, base: string, prefix: string): string[] {
  const origin = new URL(base).origin;
  const links = new Set<string>();
  const pattern = new RegExp(`href="(${prefix.replace(/[/]/g, "\\/")}[a-z0-9-]+)"`, "g");
  for (const match of html.matchAll(pattern)) links.add(`${origin}${match[1]}`);
  return [...links];
}

function readSeen(root: string): Record<string, ReadonlyArray<string>> {
  try {
    return JSON.parse(NodeFS.readFileSync(NodePath.join(root, SEEN_FILE), "utf8"));
  } catch {
    return {};
  }
}

export function buildPrompt(
  items: ReadonlyArray<FrontierItem>,
  skills: ReadonlyArray<string>,
): string {
  return [
    "You maintain an AI operating system made of skills (markdown instructions for coding agents) and canon files.",
    `Its skills: ${skills.slice(0, 200).join(", ")}.`,
    `Here are new items from trusted sources this week:`,
    ...items.map((item, index) => `${index + 1}. [${item.source}] ${item.title} ${item.url}`),
    "",
    `Propose at most ${MAX_PROPOSALS} concrete updates to existing skills or canon that these items justify.`,
    "Skip items with no clear effect on how agents should work. Never invent facts the items do not state.",
    'Answer with JSON only: {"proposals":[{"title":"<under 70 chars>","change":"<what to change, 1-3 sentences>","target":"<skill name or canon file>","url":"<source item url>"}]}',
  ].join("\n");
}

export function readProposals(text: string): Proposal[] {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  const value = json ? parseJson<{ proposals?: unknown }>(json) : null;
  if (!value || !Array.isArray(value.proposals)) return [];
  return value.proposals
    .flatMap((raw): Proposal[] => {
      if (typeof raw !== "object" || raw === null) return [];
      const p = raw as Record<string, unknown>;
      const field = (key: string) => (typeof p[key] === "string" ? (p[key] as string).trim() : "");
      const proposal = {
        title: field("title").slice(0, 70),
        change: field("change"),
        target: field("target"),
        url: field("url"),
      };
      return proposal.title && proposal.change ? [proposal] : [];
    })
    .slice(0, MAX_PROPOSALS);
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** One task card per proposal, `autonomous: false`, so it waits for Jake's approval. */
export function writeProposalCard(root: string, proposal: Proposal, now: number): string | null {
  const day = new Date(now).toLocaleDateString("en-CA");
  const slug = `frontier-${slugify(proposal.title)}`;
  const file = NodePath.join(root, "tasks", `${slug}.md`);
  if (NodeFS.existsSync(file)) return null;
  const title = proposal.title.replaceAll('"', "'");
  const card = `---
type: task
id: task-${slug}
name: "Frontier: ${title}"
status: "Not started"
owner: leonidas
accountable: "Leonidas"
priority: "Low"
energy_type: "Light Work"
effort: "Small"
scope: structural
created: ${day}
last_touched: ${day}
project: "aios"
verify: ""
start_files: []
taste: ""
lane: "inbox"
autonomous: false
---
# Frontier: ${proposal.title}

## Why

The weekly frontier digest proposes this from a trusted source. Approve it before any agent acts on it.

- **Source:** ${proposal.url || "not given"}
- **Target:** ${proposal.target || "not given"}

## Done when

- [ ] Jake approved or rejected the change.
- [ ] If approved: ${proposal.change}
`;
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, card, "utf8");
  return file;
}

/**
 * Reads new items from the approved sources, asks a free engine for skill and canon updates,
 * and files each proposal as a task card. A dry run writes nothing.
 */
export async function frontierDigest(
  input: CheckInput,
  deps: DigestDeps,
): Promise<CheckOutcome & { readonly report: string[] }> {
  const sources = deps.sources ?? FRONTIER_SOURCES;
  const since = input.lastRunAt ?? input.now - WEEK_MS;
  const seen = readSeen(input.aiosRoot);
  const nextSeen: Record<string, ReadonlyArray<string>> = { ...seen };
  const report: string[] = [];
  const items: FrontierItem[] = [];

  await Promise.all(
    sources.map(async (source) => {
      const text = await deps.fetchText(source.url);
      if (text === null) {
        report.push(`${source.name}: could not read`);
        return;
      }
      let found: Array<{ title: string; url: string }>;
      if (source.kind === "page") {
        const links = pageLinks(text, source.url, source.linkPrefix ?? "/");
        const known = seen[source.id];
        nextSeen[source.id] = links;
        // The first read only remembers the links; a page has no dates to tell what is new.
        found =
          known === undefined
            ? []
            : links
                .filter((link) => !known.includes(link))
                .map((url) => ({ title: url.split("/").pop() ?? url, url }));
      } else if (source.kind === "feed") {
        found = parseFeed(text, since);
      } else {
        found = parseGitHub(source.kind, text, since);
      }
      found = found.filter((item) => item.url).slice(0, MAX_ITEMS_PER_SOURCE);
      report.push(`${source.name}: ${found.length} new`);
      items.push(...found.map((item) => ({ source: source.name, ...item })));
    }),
  );
  report.sort();

  if (!input.dryRun) {
    NodeFS.mkdirSync(NodePath.join(input.aiosRoot, "automations"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(input.aiosRoot, SEEN_FILE),
      JSON.stringify(nextSeen, null, 2),
    );
  }
  if (items.length === 0) {
    return { status: "ok", summary: "No new items from the approved sources.", report };
  }

  const skills = (() => {
    try {
      return NodeFS.readdirSync(NodePath.join(input.aiosRoot, ".agents", "skills"));
    } catch {
      return [];
    }
  })();
  const answer = await deps.freeChat(buildPrompt(items, skills));
  report.push(
    answer ? `Model: ${answer.engine} ${answer.model} (free)` : "Model: no free engine answered",
  );
  report.push("Paid model calls: 0");
  if (answer === null) {
    return {
      status: "skipped",
      summary: `${items.length} new items, but no free model answered.`,
      report,
    };
  }
  const proposals = readProposals(answer.text);
  const findings: Finding[] = [];
  for (const proposal of proposals) {
    report.push(`Proposal: ${proposal.title} -> ${proposal.target}`);
    const file = input.dryRun ? null : writeProposalCard(input.aiosRoot, proposal, input.now);
    findings.push({
      key: `proposal:${slugify(proposal.title)}`,
      text: file ? `${proposal.title} (task card filed)` : proposal.title,
    });
  }
  if (findings.length === 0) {
    return {
      status: "ok",
      summary: `${items.length} new items, no skill or canon change proposed.`,
      report,
    };
  }
  return {
    status: "findings",
    level: "needs_you",
    title: `Frontier digest: ${findings.length} ${findings.length === 1 ? "proposal" : "proposals"} to approve`,
    summary: `${items.length} new items this week. Each proposal is a task card in the inbox lane.`,
    findings,
    report,
  };
}
