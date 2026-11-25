export const PROJECT_FAVICON_FALLBACK_MARKER = "project-favicon-missing";

// Listed, not derived from the preview list: HEIC and TIFF preview in the file viewer but do not
// draw as an icon.
export const PROJECT_FAVICON_EXTENSIONS = [
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
  ".icns",
] as const;

export function isProjectFaviconPath(path: string): boolean {
  const literalPath = path.toLowerCase();
  return PROJECT_FAVICON_EXTENSIONS.some((extension) => literalPath.endsWith(extension));
}

export function getProjectFaviconResourceKey(
  environmentId: string,
  workspaceRoot: string,
  faviconPath?: string | null,
) {
  return JSON.stringify([environmentId, workspaceRoot, faviconPath || null]);
}

export function getProjectFaviconCacheKey(
  environmentId: string,
  workspaceRoot: string,
  url: string,
) {
  let revision = url;

  try {
    const pathname = new URL(url, "https://t3.invalid").pathname;
    revision = pathname.slice(pathname.lastIndexOf("/") + 1);
  } catch {}

  return JSON.stringify([environmentId, workspaceRoot, revision]);
}

export function isProjectFaviconFallbackUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const pathname = new URL(url, "https://t3.invalid").pathname;
    return pathname.slice(pathname.lastIndexOf("/") + 1) === PROJECT_FAVICON_FALLBACK_MARKER;
  } catch {
    return false;
  }
}
