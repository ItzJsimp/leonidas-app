/**
 * Plain engine behind the Models tab. It talks to Ollama over HTTP and keeps the download state.
 * `LocalModelsService` wraps it for RPC. The engine has no Effect code so tests can drive it directly.
 */
import {
  LocalModelsError,
  type LocalModelPull,
  type LocalModelRow,
  type LocalModelsState,
} from "@t3tools/contracts";

import type { CapacityVolume, LocalModelCapacity } from "../hardwareWatch/localModelCapacity.ts";
import {
  downloadGate,
  fitFor,
  parsePullLine,
  releaseLoadedModels,
  type LoadedModelMemory,
} from "../hardwareWatch/localModelFit.ts";
import { isEmbeddingModel } from "../provider/ollamaModelCatalog.ts";
import type { ModelAnswer } from "./ModelCompare.ts";
import { STARTER_MODELS } from "./starterModels.ts";

/** How long Run keeps the model in memory. Matches the keep-alive of the Ollama setup. */
const RUN_KEEP_ALIVE = "30m";
const REQUEST_TIMEOUT_MS = 4_000;
/** A loaded model also holds a context cache and compute buffers: about 20% on top of the file. */
const LOADED_VRAM_OVERHEAD = 1.2;
/** Do not publish a pull progress change more often than this. */
const PROGRESS_PUBLISH_MS = 500;
/** The speed test asks for this many new tokens. */
const SPEED_TEST_TOKENS = 200;
/** A compare answer may be longer, so the two answers can be judged. */
const ANSWER_TOKENS = 800;
const SPEED_TEST_PROMPT =
  "Write a TypeScript function that debounces a callback, with a short explanation.";

export interface LocalModelsHardware {
  readonly capacity: LocalModelCapacity;
  readonly volumes: ReadonlyArray<CapacityVolume>;
}

export interface LocalModelsEngineDeps {
  readonly baseUrl: () => string;
  readonly fetch: typeof fetch;
  readonly hardware: () => LocalModelsHardware | null;
  /** Real path of the Ollama model folder, or null when unknown. */
  readonly modelDir: () => string | null;
  /** Start `ollama serve` in the background. Rejects when Ollama cannot be found. */
  readonly startOllama: () => Promise<void>;
  /** Name of the program that listens on the Ollama port, or null when the port is free. */
  readonly portHolder: () => Promise<string | null>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly onChange: () => void;
  readonly now: () => number;
}

interface InstalledModel {
  readonly id: string;
  readonly sizeBytes: number | null;
}

interface PullEntry {
  readonly controller: AbortController;
  readonly layers: Map<string, { total: number; completed: number }>;
  status: string;
  error: string | null;
  running: boolean;
}

const normalizeMount = (value: string): string =>
  value.replace(/\\/g, "/").replace(/\/+$/, "").toUpperCase();

/** The volume with the longest mount that is a prefix of the path. */
function volumeForPath(
  path: string | null,
  volumes: ReadonlyArray<CapacityVolume>,
): CapacityVolume | null {
  if (path === null) return null;
  const target = normalizeMount(path);
  let best: CapacityVolume | null = null;
  for (const volume of volumes) {
    const mount = normalizeMount(volume.mount);
    if (!(target === mount || target.startsWith(`${mount}/`))) continue;
    if (best === null || mount.length > normalizeMount(best.mount).length) best = volume;
  }
  return best;
}

type TagsBody = { models?: ReadonlyArray<Record<string, unknown>> };

const modelId = (entry: Record<string, unknown>): string | null => {
  const id = typeof entry["model"] === "string" ? entry["model"] : entry["name"];
  return typeof id === "string" && id.length > 0 ? id : null;
};

export class LocalModelsEngine {
  private installed: ReadonlyArray<InstalledModel> = [];
  private loaded: ReadonlySet<string> = new Set();
  private loadedMemory: ReadonlyArray<LoadedModelMemory> = [];
  private running = false;
  private warning: string | null = null;
  private readonly pulls = new Map<string, PullEntry>();
  private lastPublish = 0;
  /** Speed measured in this session, by model tag. Wins over the value in the approved list. */
  private readonly speeds = new Map<string, number>();

  private readonly deps: LocalModelsEngineDeps;

  constructor(deps: LocalModelsEngineDeps) {
    this.deps = deps;
  }

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const base = this.deps.baseUrl().replace(/\/+$/, "").replace(/\/v1$/, "");
    return this.deps.fetch(`${base}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** Read the installed and loaded models. Sets `running` false when Ollama does not answer. */
  async refresh(): Promise<void> {
    try {
      const tags = await this.call("/api/tags");
      if (!tags.ok) throw new Error(`tags ${tags.status}`);
      const body = (await tags.json()) as TagsBody;
      this.installed = (body.models ?? []).flatMap((entry) => {
        const id = modelId(entry);
        if (id === null) return [];
        const details = entry["details"] as Record<string, unknown> | undefined;
        if (isEmbeddingModel(id, details?.["family"])) return [];
        const size = entry["size"];
        return [{ id, sizeBytes: typeof size === "number" && size > 0 ? size : null }];
      });
      const ps = await this.call("/api/ps");
      const psBody: TagsBody = ps.ok ? ((await ps.json()) as TagsBody) : {};
      const loadedEntries = psBody.models ?? [];
      this.loaded = new Set(loadedEntries.flatMap((entry) => modelId(entry) ?? []));
      this.loadedMemory = loadedEntries.flatMap((entry) => this.memoryOf(entry));
      this.running = true;
      this.warning = null;
    } catch {
      this.running = false;
      this.warning = await this.portWarning();
      this.installed = [];
      this.loaded = new Set();
      this.loadedMemory = [];
    }
    this.deps.onChange();
  }

  /** When Ollama does not answer, tell the person if another program holds its port. */
  private async portWarning(): Promise<string | null> {
    let holder: string | null = null;
    try {
      holder = await this.deps.portHolder();
    } catch {
      return null;
    }
    if (holder === null) return null;
    if (/wsl/i.test(holder)) {
      return "WSL holds the Ollama port (11434), so the Windows Ollama cannot start. Stop Ollama inside WSL, then try again.";
    }
    return `Another program (${holder}) holds the Ollama port (11434) but does not answer like Ollama.`;
  }

  /** Start Ollama and wait up to 15 s for it to answer. */
  async startOllama(): Promise<void> {
    if (this.running) return;
    await this.refresh();
    if (this.running) return;
    if (this.warning !== null) {
      throw new LocalModelsError({ reason: "not_allowed", detail: this.warning });
    }
    try {
      await this.deps.startOllama();
    } catch (cause) {
      throw new LocalModelsError({
        reason: "ollama_down",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    for (let attempt = 0; attempt < 15 && !this.running; attempt += 1) {
      await this.deps.sleep(1_000);
      await this.refresh();
    }
    if (!this.running) {
      throw new LocalModelsError({
        reason: "ollama_down",
        detail: "Ollama was started but does not answer yet. Wait a moment and try again.",
      });
    }
  }

  /**
   * What a loaded model holds. The file size from /api/tags is the truth: /api/ps reports a
   * wrong size for some models (0.9 GB for a 7 GB model on Ollama 0.40.5). From /api/ps only
   * the share that sits in video memory is used.
   */
  private memoryOf(entry: Record<string, unknown>): ReadonlyArray<LoadedModelMemory> {
    const id = modelId(entry);
    const fileSize = this.installed.find((model) => model.id === id)?.sizeBytes ?? null;
    const psSize = typeof entry["size"] === "number" ? entry["size"] : null;
    const sizeBytes = fileSize ?? psSize;
    if (sizeBytes === null) return [];
    const psVram = typeof entry["size_vram"] === "number" ? entry["size_vram"] : null;
    const inVram =
      psSize !== null && psSize > 0 && psVram !== null ? Math.min(1, psVram / psSize) : 1;
    return [{ sizeBytes, vramBytes: sizeBytes * inVram * LOADED_VRAM_OVERHEAD }];
  }

  private modelDrive(): CapacityVolume | null {
    const hardware = this.deps.hardware();
    return hardware ? volumeForPath(this.deps.modelDir(), hardware.volumes) : null;
  }

  private pullView(entry: PullEntry | undefined): LocalModelPull | null {
    if (entry === undefined) return null;
    let total = 0;
    let completed = 0;
    for (const layer of entry.layers.values()) {
      total += layer.total;
      completed += Math.min(layer.completed, layer.total);
    }
    return {
      status: entry.status,
      completedBytes: Math.round(completed),
      totalBytes: Math.round(total),
      error: entry.error,
    };
  }

  snapshot(): LocalModelsState {
    const hardware = this.deps.hardware();
    const drive = this.modelDrive();
    const capacity = hardware ? releaseLoadedModels(hardware.capacity, this.loadedMemory) : null;
    const installedIds = new Set(this.installed.map((model) => model.id));
    const starters = new Map(STARTER_MODELS.map((model) => [model.id, model]));
    const gateFor = (sizeBytes: number | null, installed: boolean) => {
      if (installed || sizeBytes === null) {
        return { allowed: true, reason: null, needsConfirm: false };
      }
      const result = downloadGate({ sizeBytes, volume: drive, ollamaRunning: this.running });
      return result.allowed
        ? { allowed: true, reason: null, needsConfirm: result.needsConfirm }
        : { allowed: false, reason: result.reason, needsConfirm: false };
    };
    const row = (
      id: string,
      sizeBytes: number | null,
      installed: boolean,
      name: string,
    ): LocalModelRow => ({
      id,
      name,
      installed,
      loaded: this.loaded.has(id),
      sizeBytes: sizeBytes === null ? null : Math.round(sizeBytes),
      fit: capacity ? fitFor(sizeBytes, capacity) : "unknown",
      tokensPerSecond: this.speeds.get(id) ?? starters.get(id)?.tokensPerSecond ?? null,
      benchLm: starters.get(id)?.benchLm ?? null,
      gate: gateFor(sizeBytes, installed),
      pull: this.pullView(this.pulls.get(id)),
    });
    const rows: LocalModelRow[] = [
      ...this.installed.map((model) =>
        row(model.id, model.sizeBytes, true, starters.get(model.id)?.name ?? model.id),
      ),
      ...STARTER_MODELS.filter((model) => !installedIds.has(model.id)).map((model) =>
        row(model.id, model.sizeBytes, false, model.name),
      ),
    ];
    return {
      ollama: { running: this.running, baseUrl: this.deps.baseUrl(), warning: this.warning },
      hardware: {
        gpuName: hardware?.capacity.gpu?.name ?? null,
        vramBytes: hardware?.capacity.gpu?.vramTotalBytes ?? 0,
        ramBytes: hardware?.capacity.ramTotalBytes ?? 0,
      },
      modelDrive: drive
        ? { mount: drive.mount, mediaType: drive.mediaType, freeBytes: Math.round(drive.freeBytes) }
        : null,
      rows,
      now: this.deps.now(),
    };
  }

  /** True while any download runs. The service polls faster then. */
  get pulling(): boolean {
    return [...this.pulls.values()].some((entry) => entry.running);
  }

  /**
   * Start a download. Throws at once when the model is not allowed. The returned promise
   * settles when the download ends; the caller need not wait for it.
   */
  pull(model: string, confirmed: boolean): Promise<void> {
    const starter = STARTER_MODELS.find((candidate) => candidate.id === model);
    if (starter === undefined) {
      throw new LocalModelsError({
        reason: "invalid_input",
        detail: "This model is not on the approved list.",
      });
    }
    if (this.pulls.get(model)?.running) {
      throw new LocalModelsError({
        reason: "invalid_input",
        detail: "This model is already downloading.",
      });
    }
    const gate = downloadGate({
      sizeBytes: starter.sizeBytes,
      volume: this.modelDrive(),
      ollamaRunning: this.running,
    });
    if (!gate.allowed) throw new LocalModelsError({ reason: "not_allowed", detail: gate.reason });
    if (gate.needsConfirm && !confirmed) {
      throw new LocalModelsError({
        reason: "not_allowed",
        detail: "Confirm this large download first.",
      });
    }
    const entry: PullEntry = {
      controller: new AbortController(),
      layers: new Map(),
      status: "starting",
      error: null,
      running: true,
    };
    this.pulls.set(model, entry);
    this.deps.onChange();
    return this.runPull(model, entry);
  }

  private async runPull(model: string, entry: PullEntry): Promise<void> {
    try {
      const response = await this.call("/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
        signal: entry.controller.signal,
      });
      if (!response.ok || response.body === null) {
        throw new Error(`Ollama answered ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (line: string) => {
        const parsed = parsePullLine(line);
        if (parsed === null) return;
        if (parsed.error !== null) {
          entry.error = parsed.error;
          return;
        }
        entry.status = parsed.status;
        if (parsed.totalBytes !== null) {
          entry.layers.set(parsed.status, {
            total: parsed.totalBytes,
            completed: parsed.completedBytes ?? 0,
          });
        }
        const now = this.deps.now();
        if (now - this.lastPublish >= PROGRESS_PUBLISH_MS) {
          this.lastPublish = now;
          this.deps.onChange();
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
      }
      handle(buffer);
    } catch (cause) {
      if (!entry.controller.signal.aborted) {
        entry.error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    entry.running = false;
    if (entry.controller.signal.aborted || entry.error === null) this.pulls.delete(model);
    await this.refresh();
  }

  cancelPull(model: string): void {
    const entry = this.pulls.get(model);
    if (entry === undefined) return;
    if (entry.running) entry.controller.abort();
    else this.pulls.delete(model);
    this.deps.onChange();
  }

  private requireInstalled(model: string): void {
    if (!this.installed.some((candidate) => candidate.id === model)) {
      throw new LocalModelsError({ reason: "not_found", detail: "This model is not installed." });
    }
  }

  private async post(path: string, init: RequestInit): Promise<void> {
    try {
      const response = await this.call(path, init);
      if (!response.ok) throw new Error(`Ollama answered ${response.status}.`);
    } catch (cause) {
      throw new LocalModelsError({
        reason: "ollama_down",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  /** Load the model into memory and keep it there, so the first chat turn is fast. */
  async run(model: string): Promise<void> {
    this.requireInstalled(model);
    await this.post("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: RUN_KEEP_ALIVE }),
      // Loading a big model from disk can take minutes.
      signal: AbortSignal.timeout(10 * 60_000),
    });
    await this.refresh();
  }

  async stop(model: string): Promise<void> {
    this.requireInstalled(model);
    await this.post("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    await this.refresh();
  }

  /** Ask one installed model a question and measure the answer speed. */
  async answer(model: string, prompt: string): Promise<ModelAnswer> {
    this.requireInstalled(model);
    const started = this.deps.now();
    let body: Record<string, unknown>;
    try {
      const response = await this.call("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          keep_alive: RUN_KEEP_ALIVE,
          options: { num_predict: ANSWER_TOKENS },
        }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!response.ok) throw new Error(`Ollama answered ${response.status}.`);
      body = (await response.json()) as Record<string, unknown>;
    } catch (cause) {
      throw new LocalModelsError({
        reason: "ollama_down",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const tokens = body["eval_count"];
    const nanos = body["eval_duration"];
    const speed =
      typeof tokens === "number" && typeof nanos === "number" && nanos > 0 && tokens > 0
        ? Math.round((tokens / (nanos / 1e9)) * 10) / 10
        : null;
    const raw = typeof body["response"] === "string" ? body["response"] : "";
    // Some models write their reasoning inline; the compare shows the answer only.
    const text = raw
      .replace(/^[\s\S]*?<\/think>/, "")
      .replace(/<think>[\s\S]*$/, "")
      .trim();
    return {
      text,
      tokensPerSecond: speed,
      seconds: Math.max(0, Math.round((this.deps.now() - started) / 100) / 10),
    };
  }

  /** Generate a short answer and measure the speed of the answer in tokens per second. */
  async speedTest(model: string): Promise<void> {
    this.requireInstalled(model);
    let body: Record<string, unknown>;
    try {
      const response = await this.call("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: SPEED_TEST_PROMPT,
          stream: false,
          keep_alive: RUN_KEEP_ALIVE,
          options: { num_predict: SPEED_TEST_TOKENS },
        }),
        // Loading a big model from disk can take minutes.
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!response.ok) throw new Error(`Ollama answered ${response.status}.`);
      body = (await response.json()) as Record<string, unknown>;
    } catch (cause) {
      throw new LocalModelsError({
        reason: "ollama_down",
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const tokens = body["eval_count"];
    const nanos = body["eval_duration"];
    if (typeof tokens !== "number" || typeof nanos !== "number" || !(nanos > 0) || tokens <= 0) {
      throw new LocalModelsError({
        reason: "invalid_input",
        detail: "Ollama gave no speed numbers for this model.",
      });
    }
    this.speeds.set(model, Math.round((tokens / (nanos / 1e9)) * 10) / 10);
    await this.refresh();
  }

  async remove(model: string): Promise<void> {
    this.requireInstalled(model);
    await this.post("/api/delete", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    });
    await this.refresh();
  }
}
