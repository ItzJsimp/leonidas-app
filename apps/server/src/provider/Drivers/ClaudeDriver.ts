/**
 * ClaudeDriver — `ProviderDriver` for the Claude Agent SDK runtime.
 *
 * Mirrors `CodexDriver`: a plain value whose `create()` returns one
 * `ProviderInstance` bundling `snapshot` / `adapter` / `textGeneration`
 * closures captured over the per-instance `ClaudeSettings`.
 *
 * Unlike Codex, the Claude snapshot probe may invoke a secondary probe
 * (`probeClaudeCapabilities`) to read Anthropic account + slash-command
 * metadata. That probe is per-instance and keyed by binary + resolved HOME so
 * two concurrent Claude instances don't cross-contaminate account metadata.
 *
 * @module provider/Drivers/ClaudeDriver
 */
import {
  ClaudeSettings,
  ProviderDriverKind,
  type ServerProviderResetCredits,
} from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Crypto from "effect/Crypto";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import { makeClaudeTextGeneration } from "../../textGeneration/ClaudeTextGeneration.ts";
import * as ProviderLatestVersions from "@t3tools/provider-core/server/ProviderLatestVersions";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as ServerConfig from "../../config.ts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import {
  createClaudeAdapterV2,
  type ClaudeAdapterV2DriverEnv,
} from "../../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeClaudeAuth, makeClaudeAuthCommands } from "../ClaudeAuth.ts";
import { makeClaudeAuthEventLog } from "../ClaudeAuthEvents.ts";
import { claudeUsageReader } from "./claudeUsage.ts";
import { claudeUsageResponseToLimits, makeClaudeScopedLimitNames } from "../claudeUsageLimits.ts";
import { makeChatQuotaRecorder } from "../../usage/ChatQuotaLog.ts";
import * as ClaudeResetCredits from "../claudeResetCredits.ts";
import * as ResetCreditCoordinator from "../resetCreditCoordinator.ts";
import {
  checkClaudeProviderStatus,
  makePendingClaudeProvider,
  probeClaudeCapabilities,
  probeClaudeWorkspaceSnapshot,
} from "../ClaudeProvider.ts";
import { makeManagedServerProvider } from "@t3tools/provider-core/server/managedProvider";
import * as ModelCatalog from "@t3tools/provider-core/server/ModelCatalog";
import { resolveClaudeModelCatalog } from "../ClaudeModelCatalog.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import { withInstanceIdentity } from "@t3tools/provider-core/server/instanceIdentity";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  makeCachedProviderMaintenanceResolution,
  makePackageManagedProviderMaintenanceResolver,
  normalizeCommandPath,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "@t3tools/provider-core/server/maintenanceResolver";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@t3tools/provider-core/server/snapshotSettings";
import {
  makeClaudeCapabilitiesCacheKey,
  makeClaudeContinuationGroupKey,
  resolveClaudeHomePath,
} from "./ClaudeHome.ts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { withClaudeUserBinOnPath } from "./ClaudeExecutable.ts";
import { scheduleClaudePonytail } from "../PonytailEnsure.ts";
const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);

const DRIVER_KIND = ProviderDriverKind.make("claudeAgent");
const RESET_CREDITS_GRACE_MS = 30 * 60_000;
const CAPABILITIES_PROBE_TTL = Duration.minutes(5);
// Limit bars refresh on their own faster cadence: one cheap HTTP read per account,
// never the CLI spawn the full health check costs.
const USAGE_POLL_INTERVAL = Duration.seconds(60);

function isClaudeNativeCommandPath(commandPath: string): boolean {
  const normalized = normalizeCommandPath(commandPath);
  return (
    normalized.endsWith("/.local/bin/claude") ||
    normalized.endsWith("/.local/bin/claude.exe") ||
    normalized.includes("/.local/share/claude/")
  );
}

const UPDATE = makePackageManagedProviderMaintenanceResolver({
  provider: DRIVER_KIND,
  npmPackageName: "@anthropic-ai/claude-code",
  nativeUpdate: {
    args: ["update"],
    isCommandPath: isClaudeNativeCommandPath,
  },
});

export type ClaudeDriverEnv =
  | ClaudeAdapterV2DriverEnv
  | ProviderHost.ProviderHost
  | ChildProcessSpawner.ChildProcessSpawner
  | ResetCreditCoordinator.ResetCreditCoordinator
  | Crypto.Crypto
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | ProviderLatestVersions.ProviderLatestVersions
  | ModelCatalog.ModelCatalog
  | Path.Path
  | ProviderEventLoggers.ProviderEventLoggers
  | ServerConfig.ServerConfig;

export const ClaudeDriver: ProviderDriver<ClaudeSettings, ClaudeDriverEnv, Path.Path> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Claude",
    supportsMultipleInstances: true,
  },
  configSchema: ClaudeSettings,
  defaultConfig: (): ClaudeSettings => decodeClaudeSettings({}),
  usage: claudeUsageReader,
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Instance-level probes are not tied to a project, so they run in the
      // server's own state dir. The server cwd is $HOME in packaged desktop
      // builds, and `claude` wrappers that scope themselves to their cwd refuse
      // to run there. Workspace probes use the thread cwd via `snapshotForCwd`.
      const { stateDir, providerStatusCacheDir } = yield* ServerConfig.ServerConfig;
      const httpClient = yield* HttpClient.HttpClient;
      const latestVersions = yield* ProviderLatestVersions.ProviderLatestVersions;
      const resetCreditCoordinator = yield* ResetCreditCoordinator.ResetCreditCoordinator;
      const catalogService = yield* ModelCatalog.ModelCatalog;
      const modelCatalog = catalogService
        .current(DRIVER_KIND)
        .pipe(Effect.map(resolveClaudeModelCatalog));
      // A Claude installed by Connect (or after server start) lives in ~/.local/bin.
      const processEnv = withClaudeUserBinOnPath(
        yield* mergeProviderInstanceEnvironment(environment),
        yield* HostProcess.HomeDirectory,
        yield* HostProcess.Platform,
      );
      const fallbackContinuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const effectiveConfig = {
        ...config,
        enabled,
        binaryPath: expandHomePath(config.binaryPath, yield* HostProcess.HomeDirectory),
      } satisfies ClaudeSettings;
      const resolveMaintenance = yield* makeCachedProviderMaintenanceResolution(
        resolveProviderMaintenanceCapabilitiesEffect(UPDATE, {
          binaryPath: effectiveConfig.binaryPath,
          env: processEnv,
        }).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        ),
      );
      const continuationGroupKey = yield* makeClaudeContinuationGroupKey(
        effectiveConfig,
        processEnv,
      );
      const configDir = yield* resolveClaudeHomePath(effectiveConfig, processEnv);
      // Evidence for the next unexpected sign-out: the server trace rotates in hours.
      const authEvents = yield* makeClaudeAuthEventLog({
        logPath: path.join(stateDir, "logs", "claude-auth-events.ndjson"),
        configDir,
        instanceId,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      );
      let lastResetCredits: { value: ServerProviderResetCredits; at: number } | undefined;
      if (enabled) {
        scheduleClaudePonytail({
          binaryPath: effectiveConfig.binaryPath,
          env: { ...processEnv, CLAUDE_CONFIG_DIR: configDir },
        });
      }
      const accountConfigPath = yield* ClaudeResetCredits.claudeAccountConfigPath(
        effectiveConfig.homePath.trim() || processEnv.CLAUDE_CONFIG_DIR?.trim()
          ? configDir
          : undefined,
      );
      const stampIdentity = withInstanceIdentity({
        instanceId,
        driverKind: DRIVER_KIND,
        displayName,
        accentColor,
        continuationGroupKey,
      });

      const scopedLimitNames = yield* makeClaudeScopedLimitNames;
      const recordChatQuota = yield* makeChatQuotaRecorder(
        providerStatusCacheDir,
        instanceId,
        yield* Clock.currentTimeMillis,
      );
      const orchestrationAdapter = yield* createClaudeAdapterV2(
        {
          instanceId,
          displayName,
          accentColor,
          environment,
          enabled,
          config,
        },
        {
          scopedLimitNames,
          onUsageLimits: (update) => snapshot.applyUsageLimits(update),
          onChatQuota: recordChatQuota,
        },
      ).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: "Failed to build Claude orchestration adapter.",
              cause,
            }),
        ),
      );
      const textGeneration = yield* makeClaudeTextGeneration(
        effectiveConfig,
        processEnv,
        modelCatalog,
      );

      // Per-instance capabilities cache: keyed on binary + resolved HOME so
      // account-specific probes never share auth metadata across instances.
      const capabilitiesProbeCache = yield* Cache.make({
        capacity: 1,
        timeToLive: CAPABILITIES_PROBE_TTL,
        lookup: () =>
          Effect.all([
            probeClaudeCapabilities(effectiveConfig, processEnv, stateDir),
            ClaudeResetCredits.readClaudeOrganizationId(accountConfigPath),
          ]).pipe(
            Effect.map(([capabilities, workspaceId]) =>
              capabilities && workspaceId ? { ...capabilities, workspaceId } : capabilities,
            ),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
          ),
      });
      const capabilitiesCacheKey = yield* makeClaudeCapabilitiesCacheKey(
        effectiveConfig,
        stateDir,
        processEnv,
      );

      // Start the TTL-gated refresh without delaying provider readiness. The
      // next check observes a remote manifest after the background fetch lands.
      const checkProvider = catalogService.refreshInBackground.pipe(
        Effect.andThen(
          modelCatalog.pipe(
            Effect.flatMap((catalog) =>
              checkClaudeProviderStatus(
                effectiveConfig,
                () => Cache.get(capabilitiesProbeCache, capabilitiesCacheKey),
                processEnv,
                stateDir,
                catalog,
                scopedLimitNames,
                (version) =>
                  ClaudeResetCredits.readClaudeResetCredits(configDir, version).pipe(
                    Effect.provideService(HttpClient.HttpClient, httpClient),
                    Effect.provideService(FileSystem.FileSystem, fileSystem),
                    Effect.provideService(Path.Path, path),
                    // A rate-limited read must not make banked resets vanish and reappear.
                    Effect.flatMap((fresh) =>
                      DateTime.now.pipe(
                        Effect.map((time) => {
                          const now = DateTime.toEpochMillis(time);
                          if (fresh) {
                            lastResetCredits = { value: fresh, at: now };
                            return fresh;
                          }
                          const last = lastResetCredits;
                          const live =
                            last &&
                            now - last.at < RESET_CREDITS_GRACE_MS &&
                            (!last.value.nextExpiresAt ||
                              Date.parse(last.value.nextExpiresAt) > now);
                          return live ? last.value : undefined;
                        }),
                      ),
                    ),
                  ),
                (version) =>
                  ClaudeResetCredits.readClaudeOauthUsage(configDir, version).pipe(
                    Effect.provideService(HttpClient.HttpClient, httpClient),
                    Effect.provideService(FileSystem.FileSystem, fileSystem),
                    Effect.provideService(Path.Path, path),
                  ),
              ),
            ),
            Effect.map(stampIdentity),
            Effect.tap((draft) =>
              authEvents.observe({
                authStatus: draft.auth.status,
                connectionIssue: draft.connectionIssue,
              }),
            ),
          ),
        ),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
      );

      const snapshotSettings = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
      const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<ClaudeSettings>>({
        resolveMaintenance,
        getSettings: snapshotSettings.getSettings,
        streamSettings: snapshotSettings.streamSettings,
        haveSettingsChanged: haveProviderSnapshotSettingsChanged,
        initialSnapshot: (settings) =>
          modelCatalog.pipe(
            Effect.flatMap((catalog) => makePendingClaudeProvider(settings.provider, catalog)),
            Effect.map(stampIdentity),
          ),
        checkProvider,
        enrichSnapshot: ({ settings, snapshot, publishSnapshot }) =>
          resolveMaintenance().pipe(
            Effect.flatMap((maintenanceCapabilities) =>
              enrichProviderSnapshotWithVersionAdvisory(snapshot, maintenanceCapabilities, {
                enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
              }),
            ),
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provideService(ProviderLatestVersions.ProviderLatestVersions, latestVersions),
            Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
          ),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build Claude snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      // Same rules as Codex: serialised on the config directory that holds the
      // login, one request id kept until Claude answers (a cooldown or rate
      // limit is an answer), then a re-probe.
      const host = yield* ProviderHost.ProviderHost;
      const pollUsage = Effect.gen(function* () {
        const [genericDemand, instanceDemand] = yield* Effect.all([
          host.shouldRunBackgroundWork({ type: "provider-status" }),
          host.shouldRunBackgroundWork({ type: "provider-status", instanceId }),
        ]);
        const current = yield* snapshot.getSnapshot;
        if (!(genericDemand || instanceDemand) || !current.version) return;
        if (!current.enabled || current.auth.status !== "authenticated") return;
        const response = yield* ClaudeResetCredits.readClaudeOauthUsage(configDir, current.version);
        if (!response?.rate_limits) return;
        const checkedAt = DateTime.formatIso(yield* DateTime.now);
        const { limits } = claudeUsageResponseToLimits({ response, checkedAt });
        if (limits.windows.length > 0) {
          yield* snapshot.applyUsageLimits({ windows: limits.windows, checkedAt });
        }
      }).pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.ignoreCause({ log: true }),
      );
      yield* Effect.sleep(USAGE_POLL_INTERVAL).pipe(
        Effect.andThen(pollUsage),
        Effect.forever,
        Effect.forkScoped,
      );

      const consumeResetCredit: NonNullable<ProviderInstance["consumeResetCredit"]> = () =>
        Effect.gen(function* () {
          const current = yield* snapshot.getSnapshot;
          const grantId = current.usageLimits?.resetCredits?.nextCreditId;
          if (!grantId || !current.version) return "noCredit" as const;
          const version = current.version;
          return yield* resetCreditCoordinator.redeem(
            configDir,
            (requestId) =>
              ClaudeResetCredits.consumeClaudeResetCredit({
                configDir,
                accountConfigPath,
                version,
                grantId,
                requestId,
              }),
            ClaudeResetCredits.isSettledClaudeResetCreditFailure,
          );
        }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: DRIVER_KIND,
                instanceId,
                detail:
                  cause._tag === "ClaudeResetCreditError"
                    ? cause.message
                    : "Claude could not redeem the reset.",
                cause,
              }),
          ),
          // Re-probe after any answer, but only a reset claims the limits
          // changed, so only a reset reports an unconfirmed refresh.
          Effect.tap((outcome) =>
            Effect.gen(function* () {
              const before = (yield* snapshot.getSnapshot).usageLimits?.checkedAt;
              yield* Cache.invalidateAll(capabilitiesProbeCache);
              const refreshed = yield* snapshot.refresh;
              const after = refreshed.usageLimits?.checkedAt;
              if (
                outcome === "reset" &&
                (after === undefined ||
                  after === before ||
                  refreshed.usageLimits?.unavailable?.reason === "probeFailed")
              ) {
                return yield* new ProviderDriverError({
                  driver: DRIVER_KIND,
                  instanceId,
                  detail:
                    "The reset was applied, but Claude could not confirm the new limits. Refresh to check.",
                });
              }
            }),
          ),
        );

      // Browser sign-in: `claude auth login` opens the browser. After it ends,
      // drop the cached probe and re-check so the card turns Ready.
      const authCommands = yield* makeClaudeAuthCommands(
        effectiveConfig,
        processEnv,
        instanceId,
      ).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        Effect.provideService(Path.Path, path),
      );
      const auth = yield* makeClaudeAuth({
        instanceId,
        ...authCommands,
        signOut: authCommands.signOut.pipe(Effect.tap(() => authEvents.record("logout-run"))),
        credentialKey: continuationGroupKey,
        onAuthenticated: Cache.invalidateAll(capabilitiesProbeCache).pipe(
          Effect.andThen(snapshot.refresh),
          Effect.ignore,
          Effect.andThen(authEvents.record("auth-flow-ended")),
        ),
      });

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        auth,
        continuationIdentity: {
          ...fallbackContinuationIdentity,
          continuationKey: continuationGroupKey,
        },
        displayName,
        accentColor,
        enabled,
        snapshot,
        invalidateCaches: Cache.invalidateAll(capabilitiesProbeCache),
        snapshotForCwd: (cwd: string) =>
          snapshot.getSnapshot.pipe(
            Effect.flatMap((machineSnapshot) =>
              probeClaudeWorkspaceSnapshot(effectiveConfig, machineSnapshot, cwd, processEnv),
            ),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
          ),
        orchestrationAdapter,
        textGeneration,
        consumeResetCredit,
      } satisfies ProviderInstance;
    }),
};
