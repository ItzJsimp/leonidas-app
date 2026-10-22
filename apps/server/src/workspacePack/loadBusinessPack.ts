import type {
  WorkspaceOrgActionResult,
  WorkspaceOrgChange,
  WorkspaceOrgResult,
  WorkspacePackWidget,
} from "@t3tools/contracts";

/** What the core needs from the business pack. The pack itself is never imported by name. */
export interface BusinessPack {
  readonly readWidgets: (root: string, now: number) => Promise<ReadonlyArray<WorkspacePackWidget>>;
  readonly readOrgView: (root: string, githubLogin: string | null) => Promise<WorkspaceOrgResult>;
  readonly submitChange: (
    root: string,
    githubLogin: string | null,
    change: WorkspaceOrgChange,
    now: number,
  ) => Promise<WorkspaceOrgActionResult>;
  readonly decideProposal: (
    root: string,
    githubLogin: string | null,
    id: string,
    decision: "approve" | "reject",
    now: number,
  ) => Promise<WorkspaceOrgActionResult>;
}

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

// The one seam to packages/business-pack. The bundler (and vitest) turn this glob into a lazy
// chunk when the folder exists and into an empty map when it does not, so the core builds and
// runs without it. Plain Node (the dev server) has no glob and throws here.
const globPack = () => {
  try {
    return import.meta.glob("../../../../packages/business-pack/src/index.ts");
  } catch {
    return undefined;
  }
};
const packModules = globPack();
const DEV_PACK_URL = new URL("../../../../packages/business-pack/src/index.ts", import.meta.url);

let pending: Promise<BusinessPack | null> | undefined;

/** The business pack, or null when this build has none. Loaded once, on first use. */
export function loadBusinessPack(): Promise<BusinessPack | null> {
  pending ??= (async () => {
    // Plain Node fallback: import the source by URL, which fails cleanly when the folder is gone.
    const load = packModules
      ? Object.values(packModules)[0]
      : () => import(/* @vite-ignore */ DEV_PACK_URL.href);
    if (!load) return null;
    try {
      const mod = (await load()) as Partial<BusinessPack>;
      return typeof mod.readWidgets === "function" && typeof mod.readOrgView === "function"
        ? (mod as BusinessPack)
        : null;
    } catch {
      return null;
    }
  })();
  return pending;
}
