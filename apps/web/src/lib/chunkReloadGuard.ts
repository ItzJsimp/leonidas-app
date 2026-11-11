// Split chunks are fetched lazily, so a deploy (or desktop server swap) between
// page load and a later fetch can 404 the old hashed assets. One reload picks
// up the fresh index.html.
const CHUNK_RELOAD_GUARD_KEY = "t3code:chunk-load-reloaded";

export function reloadOnceForChunkLoadError(
  getStorage: () => Storage = () => window.sessionStorage,
  reload: () => void = () => window.location.reload(),
): boolean {
  let alreadyReloaded: boolean;
  try {
    const storage = getStorage();
    alreadyReloaded = storage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
    if (!alreadyReloaded) storage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
  } catch {
    // Without storage the guard cannot survive a reload, so a persistent
    // failure would loop forever. Let the error surface instead.
    return false;
  }
  if (alreadyReloaded) return false;
  reload();
  return true;
}

export function clearChunkReloadGuard(getStorage: () => Storage = () => window.sessionStorage) {
  try {
    getStorage().removeItem(CHUNK_RELOAD_GUARD_KEY);
  } catch {}
}

const CHUNK_LOAD_ERROR_PATTERN =
  /dynamically imported module|importing a module script|error loading dynamically imported module/i;

/**
 * Whether a route error is a failed lazy-module fetch (stale assets, or a dev
 * server restarting mid-session). These never surface as `vite:preloadError`
 * when the router lazy-loads a route component, so the error view checks too.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}
