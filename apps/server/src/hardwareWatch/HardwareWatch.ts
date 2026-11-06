// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalDateInEffect:off preferSchemaOverJson:off
// Samples carry wall-clock timestamps because they are persisted and compared across restarts.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";

import {
  HardwareWatchError,
  type HardwareAcknowledgeAlertInput,
  type HardwareAlert,
  type HardwareDeepSensorsState,
  type HardwareGpuSample,
  type HardwareHistory,
  type HardwareHistoryRange,
  type HardwareInventory,
  type HardwareLimit,
  type HardwareLiveEvent,
  type HardwareSample,
  type HardwareSetLimitInput,
  type HardwareWatchStatus,
  type ThreadId,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  DRIFT_LEARNING_MS,
  applyLimitOverrides,
  defaultLimits,
  emptyAlertEngineState,
  evaluateAlerts,
  findTemperatureDrift,
  metricInfo,
  sampleMetrics,
  type AlertEngineState,
  type LimitOverride,
} from "@t3tools/shared/hardwareWatch";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as HostPowerMonitor from "../background/HostPowerMonitor.ts";
import * as ServerConfig from "../config.ts";
import * as DeepSensors from "./deepSensors.ts";
import { makeHistory } from "./history.ts";
import {
  NVIDIA_SMI_FIELDS,
  TYPEPERF_COUNTERS,
  WINDOWS_DRIVE_TEMPS_SCRIPT,
  WINDOWS_INVENTORY_SCRIPT,
  basicInventory,
  parseDeepSensors,
  parseDriveTemps,
  parseNvidiaSmiLine,
  parseTypeperfRow,
  parseWindowsInventory,
  parseWindowsVolumes,
  type CounterReading,
  type DeepSensorReadings,
  type HostBasics,
  type VolumeRef,
} from "./parsers.ts";

const LIVE_CADENCE_MS = 1_000;
const BACKGROUND_CADENCE_MS = 15_000;
const SAVER_CADENCE_MS = 60_000;
const DRIVE_TEMPS_EVERY_MS = 5 * 60_000;
const VOLUMES_EVERY_MS = 30_000;
const HEARTBEAT_EVERY_MS = 30_000;
/** The first inventory pass waits so it does not compete with server startup. */
const INVENTORY_START_DELAY = "15 seconds";

export interface AgentContext {
  readonly inventory: HardwareInventory;
  readonly sample: HardwareSample | null;
  readonly limits: ReadonlyArray<HardwareLimit>;
  readonly alerts: ReadonlyArray<HardwareAlert>;
  readonly alert: HardwareAlert | null;
  readonly history: HardwareHistory;
  readonly historyDir: string;
}

export class HardwareWatch extends Context.Service<
  HardwareWatch,
  {
    readonly inventory: (refresh: boolean) => Effect.Effect<HardwareInventory>;
    readonly history: (range: HardwareHistoryRange) => Effect.Effect<HardwareHistory>;
    readonly limits: Effect.Effect<ReadonlyArray<HardwareLimit>>;
    readonly setLimit: (
      input: HardwareSetLimitInput,
    ) => Effect.Effect<ReadonlyArray<HardwareLimit>, HardwareWatchError>;
    readonly acknowledge: (
      input: HardwareAcknowledgeAlertInput,
    ) => Effect.Effect<HardwareAlert, HardwareWatchError>;
    readonly setDeepSensors: (enabled: boolean) => Effect.Effect<HardwareWatchStatus>;
    /** `live` subscribers raise sampling to once a second; others get status and alert changes only. */
    readonly subscribe: (live: boolean) => Stream.Stream<HardwareLiveEvent>;
    readonly agentContext: (
      alertId: string | undefined,
    ) => Effect.Effect<AgentContext, HardwareWatchError>;
    readonly linkThread: (alertId: string, threadId: ThreadId) => Effect.Effect<void>;
    /** The newest reading, or null before the first one. */
    readonly latestSample: Effect.Effect<HardwareSample | null>;
    readonly systemCareProjectId: Effect.Effect<string | null>;
    readonly setSystemCareProjectId: (projectId: string) => Effect.Effect<void>;
  }
>()("t3/hardwareWatch/HardwareWatch") {}

interface Settings {
  readonly overrides: Record<string, LimitOverride>;
  readonly deepSensors: boolean;
  readonly systemCareProjectId: string | null;
}

const defaultSettings: Settings = { overrides: {}, deepSensors: false, systemCareProjectId: null };

interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

function readCpuTimes(): CpuTimes[] {
  return NodeOS.cpus().map(({ times }) => ({
    idle: times.idle,
    total: times.user + times.nice + times.sys + times.idle + times.irq,
  }));
}

function cpuLoad(previous: CpuTimes[], current: CpuTimes[]) {
  if (previous.length !== current.length) return { total: null, cores: [] as number[] };
  let idle = 0;
  let total = 0;
  const cores = current.map((core, index) => {
    const before = previous[index]!;
    const dTotal = core.total - before.total;
    const dIdle = core.idle - before.idle;
    idle += dIdle;
    total += dTotal;
    return dTotal > 0 ? Math.round(Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100))) : 0;
  });
  return { total: total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : null, cores };
}

/** GPUs LHM reports that nvidia-smi does not cover (AMD, Intel), mapped to the same sample shape. */
function gpusFromDeepSensors(deep: DeepSensorReadings, startIndex: number): HardwareGpuSample[] {
  const byHardware = new Map<string, DeepSensorReadings["sensors"][number][]>();
  for (const sensor of deep.sensors) {
    const match = /^\/gpu-(amd|intel)\/\d+/.exec(sensor.id)?.[0];
    if (!match) continue;
    const list = byHardware.get(match) ?? [];
    list.push(sensor);
    byHardware.set(match, list);
  }
  return [...byHardware.values()].map((sensors, offset) => {
    const find = (kind: string, name: RegExp) =>
      sensors.find((sensor) => sensor.kind === kind && name.test(sensor.name))?.value ?? null;
    const usedMb = find("SmallData", /^(GPU|D3D) Memory Used$/);
    const totalMb = find("SmallData", /^(GPU|D3D) Memory Total$/);
    return {
      index: startIndex + offset,
      name: sensors[0]!.hardware,
      loadPct: find("Load", /^(GPU Core|D3D 3D)$/),
      memoryControllerPct: find("Load", /^GPU Memory Controller$/),
      vramUsedBytes: usedMb === null ? null : usedMb * 1024 * 1024,
      vramTotalBytes: totalMb === null ? null : totalMb * 1024 * 1024,
      tempC: find("Temperature", /^GPU Core$/),
      hotspotC: find("Temperature", /^GPU Hot Spot$/),
      slowdownTempC: null,
      coreClockMhz: find("Clock", /^GPU Core$/),
      memoryClockMhz: find("Clock", /^GPU Memory$/),
      powerW: find("Power", /^GPU (Package|Core|Power)$/),
      powerLimitW: null,
      fanPct: find("Control", /^GPU Fan/),
      thermalThrottling: false,
      powerThrottling: false,
    };
  });
}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = yield* HostProcess.Platform;
  const architecture = yield* HostProcess.Architecture;
  const environment = yield* HostProcess.Environment;
  const power = yield* HostPowerMonitor.HostPowerMonitor;
  // Deep sensors helpers run on demand from RPC handlers, so they carry the layer's services.
  const services = yield* Effect.context<
    ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
  >();
  const scope = yield* Effect.scope;
  const windows = platform === "win32";

  const dir = path.join(config.stateDir, "hardware");
  yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.ignore);
  const settingsFile = path.join(dir, "settings.json");
  const alertsFile = path.join(dir, "alerts.json");
  const deepPaths = DeepSensors.resolveDeepSensorsPaths(
    dir,
    environment.ProgramData ?? "C:\\ProgramData",
    path,
  );
  const bundledLhmDir = [
    environment.T3CODE_LHM_DIR,
    path.resolve(import.meta.dirname, "hardware-sensors"),
    path.resolve(import.meta.dirname, "../hardware-sensors"),
  ];

  const readJson = <A>(file: string, fallback: A) =>
    fs.readFileString(file).pipe(
      Effect.map((text) => ({ ...fallback, ...(JSON.parse(text) as A) })),
      Effect.orElseSucceed(() => fallback),
    );
  const settings = yield* Ref.make(yield* readJson<Settings>(settingsFile, defaultSettings));
  const saveSettings = Effect.flatMap(Ref.get(settings), (value) =>
    fs.writeFileString(settingsFile, JSON.stringify(value, null, 2)).pipe(Effect.ignore),
  );
  const engine = yield* Ref.make<AlertEngineState>(
    yield* readJson<AlertEngineState>(alertsFile, emptyAlertEngineState).pipe(
      // Breach timers restart after a restart; only alerts and cooldowns persist.
      Effect.map((state) => ({ ...state, breaches: {} })),
    ),
  );
  const saveAlerts = Effect.flatMap(Ref.get(engine), ({ alerts, resolvedAt }) =>
    fs.writeFileString(alertsFile, JSON.stringify({ alerts, resolvedAt })).pipe(Effect.ignore),
  );
  const history = yield* makeHistory(path.join(dir, "history"));

  // ── Inventory ──────────────────────────────────────────────────────────
  const host = (): HostBasics => ({
    platform,
    hostname: NodeOS.hostname(),
    architecture,
    osRelease: NodeOS.release(),
    cpuModel: NodeOS.cpus()[0]?.model.trim() ?? "Unknown CPU",
    threads: NodeOS.cpus().length,
    totalMemoryBytes: NodeOS.totalmem(),
    bootedAt: Date.now() - NodeOS.uptime() * 1000,
  });
  const inventoryRef = yield* Ref.make<HardwareInventory>(basicInventory(host(), Date.now()));
  const volumesRef = yield* Ref.make<VolumeRef[]>(
    windows ? [] : [{ mount: "/", label: null, mediaType: "unknown" as const }],
  );
  const inventoryLoaded = yield* Ref.make(false);
  const inventoryLock = yield* Semaphore.make(1);
  const powershell = (script: string) =>
    spawner
      .string(
        ChildProcess.make("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
          stdin: "ignore",
          stderr: "ignore",
        }),
      )
      .pipe(
        Effect.timeout("60 seconds"),
        Effect.orElseSucceed(() => ""),
      );
  const loadInventory = inventoryLock.withPermits(1)(
    Effect.gen(function* () {
      if (!windows) {
        yield* Ref.set(inventoryRef, basicInventory(host(), Date.now()));
      } else {
        const raw = yield* powershell(WINDOWS_INVENTORY_SCRIPT);
        yield* Ref.set(inventoryRef, parseWindowsInventory(raw, host(), Date.now()));
        const volumes = parseWindowsVolumes(raw);
        if (volumes.length > 0) yield* Ref.set(volumesRef, volumes);
      }
      yield* Ref.set(inventoryLoaded, true);
      return yield* Ref.get(inventoryRef);
    }),
  );
  const inventory = (refresh: boolean) =>
    Effect.gen(function* () {
      if (refresh || !(yield* Ref.get(inventoryLoaded))) return yield* loadInventory;
      return yield* Ref.get(inventoryRef);
    });

  // ── Probes ─────────────────────────────────────────────────────────────
  const gpus = yield* Ref.make(new Map<number, HardwareGpuSample>());
  const counters = yield* Ref.make<CounterReading | null>(null);
  const driveTemps = yield* Ref.make<Array<{ diskId: string; tempC: number }>>([]);
  const volumeSamples = yield* Ref.make<HardwareSample["volumes"]>([]);
  const deep = yield* Ref.make<DeepSensorReadings | null>(null);
  const deepState = yield* Ref.make<HardwareDeepSensorsState>("off");
  const deepMessage = yield* Ref.make<string | null>(null);

  const exitsCleanly = (command: string, args: string[]) =>
    spawner
      .exitCode(
        ChildProcess.make(command, args, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }),
      )
      .pipe(
        Effect.timeout("15 seconds"),
        Effect.map((code) => Number(code) === 0),
        Effect.orElseSucceed(() => false),
      );
  const hasNvidiaSmi = yield* exitsCleanly("nvidia-smi", ["-L"]);
  const hasTypeperf = windows;

  /** Streams stdout lines of a long-lived process until it exits or the fiber is interrupted. */
  const streamLines = (
    command: string,
    args: string[],
    onLine: (line: string) => Effect.Effect<void>,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* Effect.acquireRelease(
          spawner.spawn(
            ChildProcess.make(command, args, { stdin: "ignore", stdout: "pipe", stderr: "ignore" }),
          ),
          (child) => child.kill().pipe(Effect.ignore),
        );
        yield* handle.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => onLine(line)),
        );
      }),
    ).pipe(
      Effect.ignore,
      // A crashed probe comes back after a pause instead of spinning.
      Effect.andThen(Effect.sleep("30 seconds")),
      Effect.forever,
    );

  const probesFiber = yield* Ref.make<Fiber.Fiber<unknown> | null>(null);
  const probeCadence = yield* Ref.make(0);
  const startProbes = (cadenceMs: number) =>
    Effect.gen(function* () {
      if ((yield* Ref.get(probeCadence)) === cadenceMs) return;
      yield* Ref.set(probeCadence, cadenceMs);
      const previous = yield* Ref.get(probesFiber);
      if (previous) yield* Fiber.interrupt(previous);
      const probes: Effect.Effect<void>[] = [];
      if (hasNvidiaSmi)
        probes.push(
          streamLines(
            "nvidia-smi",
            [
              `--query-gpu=${NVIDIA_SMI_FIELDS.join(",")}`,
              "--format=csv,noheader,nounits",
              `-lms=${cadenceMs}`,
            ],
            (line) =>
              Effect.sync(() => parseNvidiaSmiLine(line)).pipe(
                Effect.flatMap((gpu) =>
                  gpu ? Ref.update(gpus, (map) => new Map(map).set(gpu.index, gpu)) : Effect.void,
                ),
              ),
          ),
        );
      if (hasTypeperf)
        probes.push(
          streamLines(
            "typeperf",
            [...TYPEPERF_COUNTERS, "-si", String(Math.max(1, Math.round(cadenceMs / 1000)))],
            (line) => {
              const reading = parseTypeperfRow(line);
              return reading ? Ref.set(counters, reading) : Effect.void;
            },
          ),
        );
      const fiber = yield* Effect.forkIn(
        Effect.all(probes, { concurrency: "unbounded", discard: true }),
        scope,
      );
      yield* Ref.set(probesFiber, fiber);
    });

  const refreshDriveTemps = windows
    ? Effect.flatMap(powershell(WINDOWS_DRIVE_TEMPS_SCRIPT), (raw) =>
        Ref.set(driveTemps, parseDriveTemps(raw)),
      )
    : Effect.void;

  const refreshVolumes = Effect.gen(function* () {
    const volumes = yield* Ref.get(volumesRef);
    const samples: Array<HardwareSample["volumes"][number]> = [];
    for (const volume of volumes) {
      const stats = yield* Effect.tryPromise(() =>
        NodeFS.promises.statfs(windows ? `${volume.mount}\\` : volume.mount),
      ).pipe(Effect.option);
      if (stats._tag === "None") continue;
      const total = stats.value.blocks * stats.value.bsize;
      const free = stats.value.bavail * stats.value.bsize;
      samples.push({
        mount: volume.mount,
        label: volume.label,
        mediaType: volume.mediaType,
        usedBytes: total - free,
        totalBytes: total,
      });
    }
    yield* Ref.set(volumeSamples, samples);
  });

  // ── Deep sensors ───────────────────────────────────────────────────────
  const writeControl = (cadenceMs: number, stop = false) =>
    fs
      .writeFileString(
        deepPaths.controlFile,
        JSON.stringify({ intervalMs: cadenceMs, heartbeatAt: Date.now(), stop }),
      )
      .pipe(Effect.ignore);

  const readDeep = Effect.gen(function* () {
    const state = yield* Ref.get(deepState);
    if (state !== "on" && state !== "starting") return;
    const raw = yield* fs.readFileString(deepPaths.outputFile).pipe(Effect.option);
    const parsed = raw._tag === "Some" ? parseDeepSensors(raw.value) : null;
    const fresh = parsed !== null && Date.now() - parsed.writtenAt < 90_000;
    yield* Ref.set(deep, fresh ? parsed : null);
    if (fresh && state === "starting") yield* Ref.set(deepState, "on");
  });

  const startDeepSensors = Effect.gen(function* () {
    if (!windows) {
      yield* Ref.set(deepState, "unavailable");
      yield* Ref.set(deepMessage, "Deep sensors are available on Windows only.");
      return;
    }
    yield* writeControl(yield* currentCadence);
    if (!(yield* DeepSensors.taskInstalled)) {
      const user = `${environment.USERDOMAIN ?? NodeOS.hostname()}\\${environment.USERNAME ?? NodeOS.userInfo().username}`;
      const staged = yield* DeepSensors.stageLibrary(
        deepPaths,
        bundledLhmDir.find((candidate) => candidate && NodeFS.existsSync(candidate)) ?? null,
      ).pipe(Effect.orElseSucceed(() => false));
      if (!staged) {
        yield* Ref.set(deepState, "error");
        yield* Ref.set(
          deepMessage,
          "Could not prepare LibreHardwareMonitor. Check your connection and try again.",
        );
        return;
      }
      const result = yield* DeepSensors.install(deepPaths, user).pipe(
        Effect.orElseSucceed(() => "error" as const),
      );
      if (result !== "on") {
        yield* Ref.set(deepState, result);
        yield* Ref.set(
          deepMessage,
          result === "needs-admin"
            ? "Windows needs your approval to read CPU temperatures. Turn Deep sensors on again and choose Yes."
            : result === "driver-missing"
              ? "The PawnIO sensor driver is not installed. Install it from https://pawnio.eu, then turn Deep sensors on again."
              : "Deep sensors setup failed.",
        );
        if (result === "needs-admin")
          yield* Ref.update(settings, (s) => ({ ...s, deepSensors: false }));
        yield* saveSettings;
        return;
      }
    }
    yield* Ref.set(deepState, "starting");
    yield* Ref.set(deepMessage, null);
    if (!(yield* DeepSensors.startTask)) {
      yield* Ref.set(deepState, "error");
      yield* Ref.set(deepMessage, "The Deep sensors task did not start.");
    }
  });

  const setDeepSensors = (enabled: boolean): Effect.Effect<HardwareWatchStatus> =>
    Effect.gen(function* () {
      yield* Ref.update(settings, (value) => ({ ...value, deepSensors: enabled }));
      yield* saveSettings;
      if (enabled) yield* startDeepSensors;
      else {
        yield* writeControl(yield* currentCadence, true);
        yield* Ref.set(deep, null);
        yield* Ref.set(deepMessage, null);
        if (windows && (yield* DeepSensors.taskInstalled))
          yield* DeepSensors.uninstall(deepPaths).pipe(Effect.ignore);
        yield* Ref.set(deepState, "off");
      }
      return yield* status;
    }).pipe(Effect.provideContext(services));

  // ── Sampling ───────────────────────────────────────────────────────────
  const liveSubscribers = yield* Ref.make(0);
  const currentCadence = Effect.gen(function* () {
    if ((yield* Ref.get(liveSubscribers)) > 0) return LIVE_CADENCE_MS;
    const snapshot = yield* power.snapshot;
    return snapshot.onBattery === "true" || snapshot.lowPowerMode === "true"
      ? SAVER_CADENCE_MS
      : BACKGROUND_CADENCE_MS;
  });

  const latest = yield* Ref.make<HardwareSample | null>(null);
  const status: Effect.Effect<HardwareWatchStatus> = Effect.gen(function* () {
    const oldest = history.oldestAt();
    const deepReadings = yield* Ref.get(deep);
    const deepGpus = deepReadings ? gpusFromDeepSensors(deepReadings, 0).length > 0 : false;
    return {
      supported: true,
      cadenceMs: yield* currentCadence,
      gpuSource: hasNvidiaSmi ? "nvidia-smi" : deepGpus ? "deep-sensors" : "unavailable",
      counterSource:
        hasTypeperf && (yield* Ref.get(counters)) !== null ? "typeperf" : "unavailable",
      deepSensors: yield* Ref.get(deepState),
      deepSensorsMessage: yield* Ref.get(deepMessage),
      baselineReadyAt: oldest === null ? null : oldest + DRIFT_LEARNING_MS,
    };
  });

  const limitsFor = (sample: HardwareSample) =>
    Effect.gen(function* () {
      const inv = yield* Ref.get(inventoryRef);
      return applyLimitOverrides(defaultLimits(sample, inv), (yield* Ref.get(settings)).overrides);
    });

  const events = yield* PubSub.sliding<HardwareLiveEvent>(16);
  const currentEvent = Effect.gen(function* () {
    return {
      status: yield* status,
      sample: yield* Ref.get(latest),
      alerts: (yield* Ref.get(engine)).alerts,
    } satisfies HardwareLiveEvent;
  });
  const publish = Effect.flatMap(currentEvent, (event) => PubSub.publish(events, event));

  let previousCpu = readCpuTimes();
  const buildSample = Effect.gen(function* () {
    const now = Date.now();
    const cpuTimes = readCpuTimes();
    const load = cpuLoad(previousCpu, cpuTimes);
    previousCpu = cpuTimes;
    const inv = yield* Ref.get(inventoryRef);
    const reading = yield* Ref.get(counters);
    const deepReadings = yield* Ref.get(deep);
    const nvidia = [...(yield* Ref.get(gpus)).values()].toSorted((a, b) => a.index - b.index);
    const withHotspot = nvidia.map((gpu) => ({
      ...gpu,
      hotspotC:
        deepReadings?.gpuHotspotC.find((entry) =>
          entry.hardware.includes(gpu.name.replace(/^NVIDIA /, "")),
        )?.tempC ?? gpu.hotspotC,
    }));
    const otherGpus = deepReadings ? gpusFromDeepSensors(deepReadings, withHotspot.length) : [];
    const totalMemory = NodeOS.totalmem();
    const inventoryDisks = new Map(inv.disks.map((disk) => [disk.id, disk.model]));
    return {
      at: now,
      cpu: {
        loadPct: load.total,
        coreLoadPct: load.cores,
        clockMhz:
          reading?.performancePct != null && inv.cpu.baseClockMhz
            ? Math.round((inv.cpu.baseClockMhz * reading.performancePct) / 100)
            : null,
        packageTempC: deepReadings?.cpuPackageTempC ?? null,
        maxCoreTempC: deepReadings?.cpuMaxCoreTempC ?? null,
        tjMaxC: deepReadings?.cpuTjMaxC ?? null,
        powerW: deepReadings?.cpuPowerW ?? null,
      },
      memory: { usedBytes: totalMemory - NodeOS.freemem(), totalBytes: totalMemory },
      gpus: [...withHotspot, ...otherGpus],
      disk: {
        readBytesPerSec: reading?.readBytesPerSec ?? null,
        writeBytesPerSec: reading?.writeBytesPerSec ?? null,
        activePct: reading?.activePct ?? null,
      },
      volumes: yield* Ref.get(volumeSamples),
      driveTemps: (yield* Ref.get(driveTemps)).map((drive) => ({
        ...drive,
        model: inventoryDisks.get(drive.diskId) ?? `Drive ${drive.diskId}`,
      })),
      sensors: deepReadings?.sensors ?? [],
    } satisfies HardwareSample;
  });

  const applyDrift = (now: number) =>
    Effect.gen(function* () {
      const oldest = history.oldestAt();
      if (oldest === null || now - oldest < DRIFT_LEARNING_MS) return false;
      const findings = findTemperatureDrift(history.hours(), now);
      const inv = yield* Ref.get(inventoryRef);
      const sample = yield* Ref.get(latest);
      let changed = false;
      yield* Ref.update(engine, (state) => {
        const alerts = state.alerts.map((alert) => {
          if (alert.severity !== "drift" || alert.resolvedAt !== null) return alert;
          if (findings.some((finding) => finding.metric === alert.metric)) return alert;
          changed = true;
          return { ...alert, resolvedAt: now, lastSeenAt: now };
        });
        for (const finding of findings) {
          if (
            alerts.some(
              (alert) =>
                alert.metric === finding.metric &&
                alert.severity === "drift" &&
                alert.resolvedAt === null,
            )
          )
            continue;
          const info = metricInfo(finding.metric, inv, sample);
          changed = true;
          alerts.push({
            id: `${finding.metric}@drift@${now}`,
            metric: finding.metric,
            label: info.label,
            severity: "drift",
            unit: info.unit,
            value: finding.recent,
            peak: finding.recent,
            limit: finding.baseline,
            message: `${info.label} at idle is ${Math.round(finding.recent - finding.baseline)} °C above this machine's normal (${Math.round(finding.baseline)} °C). Cooling may be getting worse: dust, a failing fan or old thermal paste.`,
            startedAt: now,
            lastSeenAt: now,
            resolvedAt: null,
            acknowledged: false,
            threadId: null,
          });
        }
        return { ...state, alerts };
      });
      return changed;
    });

  let lastSampleAt = 0;
  let lastDriveTempsAt = 0;
  let lastVolumesAt = 0;
  let lastHeartbeatAt = 0;
  const tick = Effect.gen(function* () {
    const cadence = yield* currentCadence;
    yield* startProbes(cadence);
    const now = Date.now();
    if (now - lastSampleAt < cadence - 50) return;
    lastSampleAt = now;
    if (now - lastDriveTempsAt >= DRIVE_TEMPS_EVERY_MS) {
      lastDriveTempsAt = now;
      yield* Effect.forkIn(refreshDriveTemps, scope);
    }
    if (now - lastVolumesAt >= VOLUMES_EVERY_MS) {
      lastVolumesAt = now;
      yield* refreshVolumes;
    }
    if ((yield* Ref.get(settings)).deepSensors && now - lastHeartbeatAt >= HEARTBEAT_EVERY_MS) {
      lastHeartbeatAt = now;
      yield* writeControl(cadence);
    }
    yield* readDeep;
    const sample = yield* buildSample;
    yield* Ref.set(latest, sample);
    const metrics = sampleMetrics(sample);
    const hourClosed = yield* history.record(now, metrics);
    const limits = yield* limitsFor(sample);
    const result = evaluateAlerts(yield* Ref.get(engine), metrics, limits, now);
    yield* Ref.set(engine, result.state);
    const drifted = hourClosed ? yield* applyDrift(now) : false;
    if (result.transitions.length > 0 || drifted) yield* saveAlerts;
    yield* publish;
  });

  // Sampling starts after the inventory pass so clocks and drive names resolve from the first tick.
  yield* Effect.forkIn(
    Effect.gen(function* () {
      yield* Effect.sleep(INVENTORY_START_DELAY);
      yield* loadInventory;
      if ((yield* Ref.get(settings)).deepSensors && windows) {
        // Never prompt on startup: only start a task the user already approved.
        if (yield* DeepSensors.taskInstalled) {
          yield* writeControl(yield* currentCadence);
          yield* Ref.set(deepState, "starting");
          yield* DeepSensors.startTask;
        } else yield* Ref.set(deepState, "needs-admin");
      }
      return yield* tick.pipe(
        Effect.catchCause((cause) => Effect.logWarning("Hardware sample failed", cause)),
        Effect.andThen(Effect.sleep("1 second")),
        Effect.forever,
      );
    }),
    scope,
  );

  // Stop the elevated task when the server stops; it would end on its own after the heartbeat lapses.
  yield* Effect.addFinalizer(() =>
    Effect.flatMap(Ref.get(settings), (value) =>
      value.deepSensors ? writeControl(BACKGROUND_CADENCE_MS, true) : Effect.void,
    ),
  );

  const sameAlerts = (a: HardwareLiveEvent, b: HardwareLiveEvent) =>
    a.status.deepSensors === b.status.deepSensors &&
    a.status.deepSensorsMessage === b.status.deepSensorsMessage &&
    a.alerts.length === b.alerts.length &&
    a.alerts.every((alert, index) => {
      const other = b.alerts[index]!;
      return (
        alert.id === other.id &&
        alert.severity === other.severity &&
        alert.resolvedAt === other.resolvedAt &&
        alert.acknowledged === other.acknowledged &&
        alert.threadId === other.threadId
      );
    });

  const subscribe = (live: boolean): Stream.Stream<HardwareLiveEvent> => {
    const stream = Stream.concat(Stream.fromEffect(currentEvent), Stream.fromPubSub(events));
    if (!live)
      return stream.pipe(
        Stream.map((event) => ({ ...event, sample: null })),
        Stream.changesWith(sameAlerts),
      );
    return Stream.unwrap(
      Ref.update(liveSubscribers, (count) => count + 1).pipe(
        // Take the first live sample now rather than waiting out the background interval.
        Effect.andThen(Effect.sync(() => (lastSampleAt = 0))),
        Effect.as(stream),
      ),
    ).pipe(Stream.ensuring(Ref.update(liveSubscribers, (count) => Math.max(0, count - 1))));
  };

  const updateAlert = (alertId: string, update: (alert: HardwareAlert) => HardwareAlert) =>
    Effect.gen(function* () {
      const state = yield* Ref.get(engine);
      const alert = state.alerts.find((candidate) => candidate.id === alertId);
      if (!alert) return yield* new HardwareWatchError({ reason: "not_found", detail: alertId });
      const next = update(alert);
      yield* Ref.set(engine, {
        ...state,
        alerts: state.alerts.map((candidate) => (candidate.id === alertId ? next : candidate)),
      });
      yield* saveAlerts;
      yield* publish;
      return next;
    });

  return HardwareWatch.of({
    inventory,
    history: history.read,
    limits: Effect.flatMap(Ref.get(latest), (sample) =>
      sample ? limitsFor(sample) : Effect.succeed([] as HardwareLimit[]),
    ),
    setLimit: (input) =>
      Effect.gen(function* () {
        if (input.warn !== null && input.critical !== null && input.warn > input.critical)
          return yield* new HardwareWatchError({
            reason: "invalid_input",
            detail: "The warning line must be at or below the critical line.",
          });
        yield* Ref.update(settings, (value) => {
          const overrides = { ...value.overrides };
          if (input.warn === null && input.critical === null) delete overrides[input.metric];
          else overrides[input.metric] = { warn: input.warn, critical: input.critical };
          return { ...value, overrides };
        });
        yield* saveSettings;
        const sample = yield* Ref.get(latest);
        return sample ? yield* limitsFor(sample) : [];
      }),
    acknowledge: (input) =>
      updateAlert(input.alertId, (alert) => ({ ...alert, acknowledged: input.acknowledged })),
    setDeepSensors,
    subscribe,
    agentContext: (alertId) =>
      Effect.gen(function* () {
        const alerts = (yield* Ref.get(engine)).alerts;
        const alert = alertId
          ? (alerts.find((candidate) => candidate.id === alertId) ?? null)
          : null;
        if (alertId && !alert)
          return yield* new HardwareWatchError({ reason: "not_found", detail: alertId });
        const sample = yield* Ref.get(latest);
        return {
          inventory: yield* inventory(false),
          sample,
          limits: sample ? yield* limitsFor(sample) : [],
          alerts,
          alert,
          history: yield* history.read("24h"),
          historyDir: path.join(dir, "history"),
        };
      }),
    linkThread: (alertId, threadId) =>
      updateAlert(alertId, (alert) => ({ ...alert, threadId, acknowledged: true })).pipe(
        Effect.ignore,
      ),
    latestSample: Ref.get(latest),
    systemCareProjectId: Effect.map(Ref.get(settings), (value) => value.systemCareProjectId),
    setSystemCareProjectId: (projectId) =>
      Ref.update(settings, (value) => ({ ...value, systemCareProjectId: projectId })).pipe(
        Effect.andThen(saveSettings),
      ),
  });
});

export const layer = Layer.effect(HardwareWatch, make);
