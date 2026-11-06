const PREVIEW_EVENT = "leonidas:preview-whats-new";
const LATEST_RELEASE_URL = "https://api.github.com/repos/ItzJsimp/leonidas-app/releases/latest";

/** Settings button -> coordinator: open the popup with the latest published release's bullets. */
export function requestWhatsNewPreview(): void {
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

export function onWhatsNewPreviewRequested(listener: () => void): () => void {
  window.addEventListener(PREVIEW_EVENT, listener);
  return () => window.removeEventListener(PREVIEW_EVENT, listener);
}

/** Preserve the publisher order: highlights first, followed by additional changes. */
export function parseReleaseBullets(body: string): ReadonlyArray<string> {
  return body
    .split("\n")
    .filter((line) => /^\s*[-*]\s/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

/** Bullets of the latest GitHub release, the same text the real update popup shows. */
export async function fetchLatestReleaseWhatsNew(): Promise<{
  version: string;
  items: ReadonlyArray<string>;
}> {
  try {
    const response = await fetch(LATEST_RELEASE_URL);
    if (!response.ok) throw new Error("Could not load the latest release.");
    const release = (await response.json()) as {
      tag_name?: string;
      body?: string;
    };
    const items = parseReleaseBullets(release.body ?? "");
    return {
      version: (release.tag_name ?? "").replace(/^v/, ""),
      items,
    };
  } catch {
    return {
      version: "",
      items: ["Release notes could not be loaded. Open update history to try again."],
    };
  }
}
