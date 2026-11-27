interface ServiceWorkerEnv {
  readonly isProduction: boolean;
  readonly isElectron: boolean;
  readonly isSecureContext: boolean;
  readonly container: Pick<ServiceWorkerContainer, "register"> | undefined;
}

/**
 * Registers `/sw.js` for the browser and Home Screen app. The desktop app loads a file-backed
 * shell, and plain http over a LAN address is not a secure context, so both skip it.
 */
export function registerServiceWorker(env: ServiceWorkerEnv): Promise<unknown> | null {
  if (!env.isProduction || env.isElectron || !env.isSecureContext || !env.container) return null;
  // A failed registration only loses the offline shell; the app works the same without it.
  return env.container.register("/sw.js", { scope: "/" }).catch(() => undefined);
}
