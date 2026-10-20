// @effect-diagnostics nodeBuiltinImport:off
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as NodeZlib from "node:zlib";

import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import compression from "compression";
import { defineProject, type TestProjectInlineConfiguration } from "vite-plus/test/config";
import "vite-plus/test/config";
import { defineConfig, type Connect, type Plugin } from "vite-plus";
import pkg from "./package.json" with { type: "json" };

import {
  DEV_PROXIED_ORIGIN_PRESERVING_PREFIXES,
  DEV_PROXIED_PATH_PREFIXES,
} from "@t3tools/shared/devProxy";

import { loadRepoEnv } from "../../scripts/lib/public-config";
import { thirdPartyLicensesPlugin } from "../../scripts/lib/third-party-licenses";
import { formatDevVersionLabel } from "./src/devVersionLabel";
import { tailwindPlugins } from "./vite/tailwind";

const repoEnv = loadRepoEnv();
Object.assign(process.env, repoEnv);

// Single-origin dev is signalled positively, because it cannot be inferred
// from the absence of VITE_HTTP_URL/VITE_WS_URL: the runner deletes those keys
// but `loadRepoEnv` merges `.env`/`.env.local` *underneath* the process env, so
// a developer with either URL in their `.env` gets it back here. Baking it then
// pins the client to localhost and breaks every non-localhost origin — the
// exact failure single-origin mode exists to prevent, and an invisible one
// since the page still loads.
const isSingleOriginDev = process.env.T3CODE_SINGLE_ORIGIN_DEV === "1";

const port = Number(process.env.PORT ?? 5733);
const explicitHost = process.env.HOST?.trim();
const host = explicitHost || "localhost";
const configuredWsUrl = isSingleOriginDev ? undefined : process.env.VITE_WS_URL?.trim();
const configuredHttpUrl = isSingleOriginDev ? undefined : process.env.VITE_HTTP_URL?.trim();
const configuredRelayUrl = repoEnv.VITE_T3CODE_RELAY_URL?.trim() || "";
const configuredClerkPublishableKey = repoEnv.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";
const configuredClerkJwtTemplate = repoEnv.VITE_CLERK_JWT_TEMPLATE?.trim() || "";
const configuredClerkCliOAuthClientId = repoEnv.VITE_CLERK_CLI_OAUTH_CLIENT_ID?.trim() || "";
const configuredRelayTracingUrl = repoEnv.VITE_RELAY_OTLP_TRACES_URL?.trim() || "";
const configuredRelayTracingDataset = repoEnv.VITE_RELAY_OTLP_TRACES_DATASET?.trim() || "";
const configuredRelayTracingToken = repoEnv.VITE_RELAY_OTLP_TRACES_TOKEN?.trim() || "";
const configuredHostedAppChannel = process.env.VITE_HOSTED_APP_CHANNEL?.trim() || "";
const useReactCompiler =
  process.argv.includes("build") || process.env.LEONIDAS_DEV_REACT_COMPILER === "1";
const configuredAppVersion = process.env.APP_VERSION?.trim() || pkg.version;
// Dev copies run from a checkout whose package version is not the release number, so label them
// from git. Production builds already carry the exact release version and skip this.
const configuredVersionLabel = (() => {
  const explicit = process.env.LEONIDAS_VERSION_LABEL?.trim();
  if (explicit) return explicit;
  if (process.argv.includes("build")) return "";
  try {
    const describe = execFileSync("git", ["describe", "--tags", "--long", "--match", "v0.*"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    return formatDevVersionLabel(describe) ?? "";
  } catch (error) {
    console.warn("[version-label] git describe failed, showing the package version:", error);
    return "";
  }
})();
const configuredHostedAppUrl = (() => {
  const explicitHostedAppUrl = process.env.VITE_HOSTED_APP_URL?.trim();
  if (explicitHostedAppUrl) {
    return explicitHostedAppUrl;
  }
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return undefined;
})();
const sourcemapEnv = process.env.T3CODE_WEB_SOURCEMAP?.trim().toLowerCase();

// Vite 8.1's experimental bundled dev mode: serves rolldown-bundled chunks in
// dev for much faster startup/reload on large module graphs, with HMR served
// as hot patches. Opt-in while experimental: T3CODE_BUNDLED_DEV=1 pnpm dev:web
// The dev runner defaults this on for --share runs (remote browsers pay a
// round trip per import level in unbundled dev); T3CODE_BUNDLED_DEV=0 opts out.
const bundledDevEnv = process.env.T3CODE_BUNDLED_DEV?.trim().toLowerCase();
const bundledDev = bundledDevEnv === "1" || bundledDevEnv === "true";

const buildSourcemap: boolean | "hidden" =
  sourcemapEnv === "0" || sourcemapEnv === "false"
    ? false
    : sourcemapEnv === "hidden"
      ? "hidden"
      : true;

const unitTestProject = {
  extends: true,
  test: {
    name: "unit",
    include: ["src/**/*.test.{ts,tsx}"],
    // The web runtime suite exercises auth bootstrap, saved environments,
    // and websocket subscription lifecycles. Under the full monorepo test
    // run, those async tests can exceed Vitest's default 5s budget.
    hookTimeout: 15_000,
    testTimeout: 15_000,
    setupFiles: ["../../packages/shared/src/testing/longTempDir.ts"],
  },
} satisfies TestProjectInlineConfiguration;

function resolveDevProxyTarget(
  backendPort: string | undefined,
  wsUrl: string | undefined,
): string | undefined {
  // Browser dev is single-origin: the backend port is proxied through this
  // server so the app works from any origin (localhost, tailnet, LAN, phone).
  // T3CODE_PORT is set by scripts/dev-runner.ts for every non-desktop mode.
  const port = Number(backendPort?.trim());
  if (Number.isInteger(port) && port > 0) {
    return `http://localhost:${port}/`;
  }

  // dev:desktop still points the renderer straight at the backend, so fall
  // back to deriving the target from the explicit websocket URL.
  if (!wsUrl) {
    return undefined;
  }

  try {
    const url = new URL(wsUrl);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

const devProxyTarget = resolveDevProxyTarget(process.env.T3CODE_PORT, configuredWsUrl);

// Vite's dev server sends JS uncompressed. On localhost that is free; over a
// shared origin (tailnet, LAN) it is the whole cold-start: bundled dev serves
// one ~25 MB chunk, and a typical uplink moves that in about a minute while
// both machines sit idle. Compressing turns it into a few seconds of CPU.
// Brotli quality 5 keeps encode time in the hundreds of ms; the default
// (quality 11) would trade the transfer stall for an equally long encode stall.
function devCompressionPlugin(): Plugin {
  return {
    name: "t3code:dev-compression",
    apply: "serve",
    configureServer(server) {
      // compression() is typed against Express's req/res, which extend the
      // node http objects Connect actually passes — safe to narrow.
      server.middlewares.use(
        compression({
          // Proxied API and event-stream responses are small or streamed; buffering them stalls clients.
          filter: (req, res) =>
            !DEV_PROXIED_PATH_PREFIXES.some((prefix) => req.url?.startsWith(prefix)) &&
            compression.filter(req, res),
          brotli: { params: { [NodeZlib.constants.BROTLI_PARAM_QUALITY]: 5 } },
        }) as unknown as Connect.NextHandleFunction,
      );
    },
  };
}

// The always-on dev copy runs in an app window whose taskbar icon is the page favicon. Serving the
// green dev icon there keeps it apart from the real app (the shipped favicon is a blurry 48 px one).
function devIconPlugin(): Plugin {
  const icons: Record<string, string> = {
    "/favicon.ico": "leonidas-dev-green.ico",
    "/apple-touch-icon.png": "leonidas-dev-green-256.png",
  };
  return {
    name: "leonidas:dev-icon",
    apply: "serve",
    configureServer(server) {
      if (process.env.LEONIDAS_DEV_ICON !== "1") return;
      server.middlewares.use((req, res, next) => {
        const file = icons[req.url?.split("?")[0] ?? ""];
        if (!file) return next();
        res.setHeader("Content-Type", file.endsWith(".ico") ? "image/x-icon" : "image/png");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(new URL(`../../assets/dev/${file}`, import.meta.url)));
      });
    },
  };
}

// Vite rejects requests whose Host header isn't localhost, which blocks sharing
// a dev server over Tailscale/LAN. Tailnet names are safe to allow wholesale:
// the DNS is controlled by tailscale, so they can't be rebound by an attacker.
// Anything else (ngrok, a LAN IP alias) goes through the env var.
const configuredAllowedHosts = (process.env.T3CODE_DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
const allowedHosts = [".ts.net", ...configuredAllowedHosts];

export default defineConfig(() => {
  return {
    // One dependency cache per dev port. Agents run several Vite servers from one checkout, and
    // a shared cache lets them rewrite each other's optimized deps and stall mid-request.
    cacheDir: `node_modules/.vite-${port}`,
    assetsInclude: ["**/*.wasm"],
    plugins: [
      devCompressionPlugin(),
      devIconPlugin(),
      thirdPartyLicensesPlugin({
        bundleName: "web",
        configFile: new URL("../../third-party-licenses.config.json", import.meta.url),
        packageManifests: [
          { bundle: "web", path: new URL("./package.json", import.meta.url) },
          { bundle: "server", path: new URL("../server/package.json", import.meta.url) },
          { bundle: "desktop", path: new URL("../desktop/package.json", import.meta.url) },
        ],
      }),
      // Route components load as split chunks so settings, pull-request, and
      // usage code stay out of the cold-start payload; the router prefetches
      // them on navigation intent (see getRouter's defaultPreload).
      tanstackRouter({ autoCodeSplitting: true }),
      react(),
      // React Compiler runs through Babel on every module, which blocks Vite's single thread for
      // tens of seconds on a cold start (ChatView alone is 1.5 MB). It is a build-time speedup, so
      // dev skips it. Set LEONIDAS_DEV_REACT_COMPILER=1 to test compiled output in dev.
      ...(useReactCompiler
        ? [
            babel({
              // We need to be explicit about the parser options after moving to @vitejs/plugin-react v6.0.0
              // This is because the babel plugin only automatically parses typescript and jsx based on relative paths (e.g. "**/*.ts")
              // whereas the previous version of the plugin parsed all files with a .ts extension.
              // This is causing our packages/ directory to fail to parse, as they are not relative to the CWD.
              parserOpts: { plugins: ["typescript", "jsx"] },
              presets: [reactCompilerPreset()],
            }),
          ]
        : []),
      tailwindPlugins(bundledDev),
    ],
    optimizeDeps: {
      // A package that cannot be resolved here (for example @clerk/clerk-js, which pnpm keeps
      // out of this folder) leaves the dependency optimizer stuck on "bundling dependencies"
      // with no CPU use, so every prebundled module request hangs and the page never loads.
      // Skip what does not resolve; Vite then finds it on demand.
      include: [
        "@clerk/clerk-js",
        "@clerk/react/internal",
        "@pierre/diffs",
        "@pierre/diffs/edit",
        "@pierre/diffs/react",
        "@pierre/diffs/worker/worker.js",
        "effect/Array",
        "effect/Order",
        "react-dom/client",
      ].filter((id) => {
        try {
          import.meta.resolve(id);
          return true;
        } catch {
          return false;
        }
      }),
    },
    define: {
      // In dev mode, tell the web app where the WebSocket server lives
      "import.meta.env.VITE_WS_URL": JSON.stringify(configuredWsUrl ?? ""),
      // Pinned explicitly rather than left to Vite's automatic VITE_ exposure:
      // under single-origin dev this must stay empty even when a `.env`
      // supplies it, so the client falls back to window.location.origin.
      "import.meta.env.VITE_HTTP_URL": JSON.stringify(configuredHttpUrl ?? ""),
      "import.meta.env.VITE_T3CODE_RELAY_URL": JSON.stringify(configuredRelayUrl),
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(configuredClerkPublishableKey),
      "import.meta.env.VITE_CLERK_JWT_TEMPLATE": JSON.stringify(configuredClerkJwtTemplate),
      "import.meta.env.VITE_CLERK_CLI_OAUTH_CLIENT_ID": JSON.stringify(
        configuredClerkCliOAuthClientId,
      ),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_URL": JSON.stringify(configuredRelayTracingUrl),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_DATASET": JSON.stringify(
        configuredRelayTracingDataset,
      ),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_TOKEN": JSON.stringify(configuredRelayTracingToken),
      "import.meta.env.VITE_HOSTED_APP_URL": JSON.stringify(configuredHostedAppUrl ?? ""),
      "import.meta.env.VITE_HOSTED_APP_CHANNEL": JSON.stringify(configuredHostedAppChannel),
      "import.meta.env.APP_VERSION": JSON.stringify(configuredAppVersion),
      "import.meta.env.LEONIDAS_VERSION_LABEL": JSON.stringify(configuredVersionLabel),
    },
    resolve: {
      tsconfigPaths: true,
      dedupe: ["react", "react-dom"],
    },
    experimental: {
      bundledDev,
    },
    server: {
      host,
      port,
      strictPort: true,
      allowedHosts,
      // Transform the whole module graph at server start instead of on the
      // first request. Without this, a cold worktree discovers and transforms
      // modules one import-level at a time while the browser waits — which
      // over a tailnet origin turns into minutes of waterfall.
      warmup: {
        clientFiles: ["./src/main.tsx"],
      },
      ...(devProxyTarget
        ? {
            // One entry per shared prefix; the server's dev catch-all 404s the
            // same list, so the two sides cannot drift. `/ws` is the app's own
            // socket and `/api` carries the device hub's stream sockets —
            // Vite's HMR socket is matched separately and exactly (path "/"
            // plus a vite-hmr subprotocol), so the upgrade handlers don't
            // collide.
            proxy: Object.fromEntries(
              DEV_PROXIED_PATH_PREFIXES.map((prefix) => [
                prefix,
                {
                  target: devProxyTarget,
                  changeOrigin: !DEV_PROXIED_ORIGIN_PRESERVING_PREFIXES.has(prefix),
                  ...(prefix === "/ws" || prefix === "/api" ? { ws: true } : {}),
                },
              ]),
            ),
          }
        : {}),
      // Electron's BrowserWindow needs the HMR socket pinned to an explicit
      // host to connect reliably; dev:desktop is the only mode that sets HOST.
      // Everywhere else, leaving this unset lets the client derive it from the
      // page origin, which is what makes HMR work over Tailscale/LAN instead of
      // failing an attempt against the wrong machine's localhost first.
      // (Vite 8 logs connection state via console.debug — enable "Verbose".)
      ...(explicitHost
        ? {
            hmr: {
              protocol: "ws",
              host: explicitHost,
              clientPort: port,
            },
          }
        : {}),
    },
    // @tailwindcss/vite only emits a CSS sourcemap when devSourcemap is on; without it
    // rolldown flags the transform as SOURCEMAP_BROKEN on every sourcemapped build.
    css: {
      devSourcemap: buildSourcemap !== false,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      manifest: true,
      sourcemap: buildSourcemap,
    },
    test: {
      projects: [defineProject(unitTestProject)],
    },
  };
});
