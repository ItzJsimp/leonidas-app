export interface AreaEntry {
  readonly slug: string;
  readonly name: string;
  readonly repo: string;
  readonly department: string;
  readonly sensitivity: string;
  readonly status: string;
}

// A slug becomes a folder name, so it must not hold a path separator or a dot segment.
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const REPO = /^[A-Za-z0-9._-]+$/;
const SEPARATOR_CELL = /^[-: ]*$/;

export function parseAreas(text: string): ReadonlyArray<AreaEntry> {
  const seen = new Set<string>();
  const areas: AreaEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const pieces = line.split("|").slice(1);
    if (pieces[pieces.length - 1] === "") pieces.pop();
    const cells = pieces.map((piece) => piece.trim().replace(/^`(.*)`$/, "$1"));
    if (cells.length < 6) continue;
    if (cells[0].toLowerCase() === "slug") continue;
    if (cells.every((cell) => SEPARATOR_CELL.test(cell))) continue;
    const [slug, name, repo, department, sensitivity, status] = cells;
    if (!SLUG.test(slug) || seen.has(slug)) continue;
    if (!REPO.test(repo) || repo === "." || repo === "..") continue;
    seen.add(slug);
    areas.push({ slug, name, repo, department, sensitivity, status: status.toLowerCase() });
  }
  return areas;
}

export interface JoinPlan {
  readonly clone: ReadonlyArray<AreaEntry>; // active, not on disk
  readonly sync: ReadonlyArray<AreaEntry>; // active, already on disk
  readonly skip: ReadonlyArray<AreaEntry>; // archived
}

export function planJoin(areas: ReadonlyArray<AreaEntry>, onDisk: ReadonlySet<string>): JoinPlan {
  const clone: AreaEntry[] = [];
  const sync: AreaEntry[] = [];
  const skip: AreaEntry[] = [];
  for (const area of areas) {
    // "home" is the workspace root, not an Area to clone.
    if (area.slug === "home") continue;
    if (area.status === "archived") skip.push(area);
    else if (onDisk.has(area.slug)) sync.push(area);
    else clone.push(area);
  }
  return { clone, sync, skip };
}
