import { parseReleaseArticle } from "./releaseArticle";

const RELEASES_URL = "https://api.github.com/repos/ItzJsimp/leonidas-app/releases";

export interface ReleaseHistoryMeta {
  readonly commit?: string;
  readonly authors?: ReadonlyArray<string>;
  readonly coAuthors?: ReadonlyArray<string>;
  readonly authorCommits?: Readonly<Record<string, number>>;
}

export interface ReleaseHistoryEntry {
  readonly version: string;
  readonly publishedAt: string;
  readonly notes: ReadonlyArray<string>;
  readonly url: string;
  readonly article: ReturnType<typeof parseReleaseArticle>;
  readonly meta?: ReleaseHistoryMeta | null;
}

export function formatFriendlyReleaseDate(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** "Alex 70% · Sam 30%" when per-author commit counts exist, else the plain author list. */
export function formatReleaseCredits(meta: ReleaseHistoryMeta | null | undefined): string {
  const counts = Object.entries(meta?.authorCommits ?? {}).filter(([, n]) => n > 0);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  if (counts.length > 1 && total > 0) {
    return counts
      .toSorted((a, b) => b[1] - a[1])
      .map(([name, n]) => `${name} ${Math.round((n / total) * 100)}%`)
      .join(" · ");
  }
  return (meta?.authors ?? []).join(", ");
}

export function parseReleaseHistory(value: unknown): ReleaseHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error("Invalid release history response");
  return value.flatMap((release: unknown) => {
    if (typeof release !== "object" || release === null) return [];
    const row = release as Record<string, unknown>;
    if (
      row.draft ||
      row.prerelease ||
      typeof row.tag_name !== "string" ||
      !/^v\d+\.\d+\.\d+$/.test(row.tag_name)
    )
      return [];
    const notes =
      typeof row.body === "string"
        ? row.body
            .split("\n")
            .filter((line) => /^\s*[-*]\s/.test(line))
            .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
        : [];
    let meta: ReleaseHistoryMeta | null = null;
    if (typeof row.body === "string") {
      const match = /<!--\s*leonidas-release\s+({.*?})\s*-->/.exec(row.body);
      if (match && match[1]) {
        try {
          meta = JSON.parse(match[1]);
        } catch {
          meta = null;
        }
      }
    }
    return [
      {
        version: row.tag_name.slice(1),
        article: parseReleaseArticle(
          typeof row.body === "string" ? row.body : "",
          row.tag_name.slice(1),
        ),
        publishedAt: typeof row.published_at === "string" ? row.published_at : "",
        notes: [...new Set(notes)],
        url:
          typeof row.html_url === "string" &&
          row.html_url.startsWith("https://github.com/ItzJsimp/leonidas-app/releases/")
            ? row.html_url
            : "",
        meta,
      },
    ];
  });
}

export async function fetchReleaseHistory(
  page: number,
  signal?: AbortSignal,
): Promise<{
  entries: ReleaseHistoryEntry[];
  hasMore: boolean;
}> {
  const response = await fetch(`${RELEASES_URL}?per_page=10&page=${page}`, {
    signal: signal ?? null,
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? "GitHub temporarily limited requests. Please try again later."
        : "Could not load release history. Please try again.",
    );
  const value: unknown = await response.json();
  return {
    entries: parseReleaseHistory(value),
    hasMore: Array.isArray(value) && value.length === 10,
  };
}

/** Fetch the article for the downloaded version, not whichever release happens to be latest. */
export async function fetchReleaseEntry(
  version: string,
  signal?: AbortSignal,
): Promise<ReleaseHistoryEntry> {
  const tag = version.trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(tag)) throw new Error("Invalid release version");
  const response = await fetch(`${RELEASES_URL}/tags/v${tag}`, { signal: signal ?? null });
  if (!response.ok) throw new Error("The full update story could not be loaded.");
  const entry = parseReleaseHistory([await response.json()])[0];
  if (!entry || entry.version !== tag) throw new Error("The release does not match this update.");
  return entry;
}
