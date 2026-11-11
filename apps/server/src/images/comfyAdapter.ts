// @effect-diagnostics globalFetch:off globalTimers:off globalTimersInEffect:off globalRandom:off globalDate:off globalDateInEffect:off - Plain async adapter for a local HTTP server, outside the orchestration runtime.
/**
 * The ComfyUI adapter for the Image Source interface.
 *
 * Flow for one image: `POST /prompt`, poll `GET /history/<id>`, read the picture with `GET /view`.
 * The user runs ComfyUI. The app only connects to it.
 */
import type { ImageModel } from "@t3tools/contracts";

import {
  COMFY_WORKFLOWS,
  COMFY_WORKFLOW_SETTINGS,
  IMAGE_SIZE,
  isComfyModelId,
  type ComfyWorkflow,
} from "./comfyWorkflows.ts";
import { COMFY_MODELS } from "./imageModels.ts";
import { flux2kleinEdit } from "./comfyEdits.ts";
import {
  ImageCancelledError,
  type GenerateHooks,
  type GenerateRequest,
  type GeneratedImage,
  type ImageSource,
  type SourceStatus,
} from "./imageSource.ts";

export const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";

/** Accepts a web address from the settings field. Returns null when it cannot work. */
export function normalizeBaseUrl(input: string): string | null {
  const text = input.trim();
  if (text.length === 0) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export interface ComfyAdapterOptions {
  readonly progressSocket?: (url: string) => ProgressSocket;
  /** Read on every call, so a change in settings applies at once. */
  readonly baseUrl: () => string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Wait between history polls. */
  readonly pollMs?: number;
  /** Stops waiting for an image after this long. */
  readonly maxWaitMs?: number;
  /** Longest wait for one answer. A cold ComfyUI is silent while it loads a model. */
  readonly requestTimeoutMs?: number;
}

interface ProgressSocket {
  readonly ready?: Promise<void>;
  readonly onMessage: (receive: (data: unknown) => void) => void;
  readonly close: () => void;
}

function progressSocket(url: string): ProgressSocket {
  const socket = new WebSocket(url);
  socket.addEventListener("error", () => undefined);
  const ready = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1500);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.addEventListener("open", finish, { once: true });
    socket.addEventListener("error", finish, { once: true });
    socket.addEventListener("close", finish, { once: true });
  });
  return {
    ready,
    onMessage: (receive) => socket.addEventListener("message", (event) => receive(event.data)),
    close: () => socket.close(),
  };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const shorten = (text: string, max = 300) =>
  text.length > max ? `${text.slice(0, max)}...` : text;

type HistoryImage = { filename: string; subfolder?: string; type?: string };
type HistoryEntry = {
  status?: { status_str?: string; messages?: ReadonlyArray<readonly [string, unknown]> };
  outputs?: Record<string, { images?: ReadonlyArray<HistoryImage> }>;
};

/** Reads a ComfyUI error body into one plain sentence. */
export function describeComfyError(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; details?: string } | string;
      node_errors?: Record<
        string,
        { errors?: ReadonlyArray<{ message?: string; details?: string }> }
      >;
    };
    const parts: string[] = [];
    if (typeof json.error === "string") parts.push(json.error);
    else if (json.error?.message) parts.push(json.error.message);
    const firstNode = Object.values(json.node_errors ?? {})[0]?.errors?.[0];
    if (firstNode) parts.push([firstNode.message, firstNode.details].filter(Boolean).join(": "));
    if (parts.length > 0) return shorten(`ComfyUI said: ${parts.join(". ")}`);
  } catch {
    // Not JSON. Fall through to the raw text.
  }
  return shorten(`ComfyUI answered ${String(status)}${body ? `: ${body}` : ""}`);
}

/** Reads the failure reason out of a ComfyUI history entry. */
function describeHistoryFailure(entry: HistoryEntry): { cancelled: boolean; text: string } {
  const messages = entry.status?.messages ?? [];
  for (const [kind, data] of messages) {
    if (kind === "execution_interrupted") return { cancelled: true, text: "Stopped." };
    if (kind === "execution_error") {
      const detail = data as { exception_message?: string; node_type?: string };
      const where = detail.node_type ? ` (${detail.node_type})` : "";
      return {
        cancelled: false,
        text: shorten(`ComfyUI failed${where}: ${detail.exception_message ?? "unknown error"}`),
      };
    }
  }
  return { cancelled: false, text: "ComfyUI could not make this image." };
}

/** Why a call to ComfyUI got no answer. "timeout" means ComfyUI is busy. "unreachable" means nothing listens. */
class ComfyConnectionError extends Error {
  readonly kind: "timeout" | "unreachable";

  constructor(kind: "timeout" | "unreachable", address: string) {
    super(
      kind === "timeout"
        ? "ComfyUI did not answer in time. It may be loading a model. Try again."
        : `Cannot reach ComfyUI at ${address}. Start ComfyUI, then try again.`,
    );
    this.name = "ComfyConnectionError";
    this.kind = kind;
  }
}

/** A cold ComfyUI does not answer while it loads a model, so a slow answer is not a failure. */
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [1_000, 2_000] as const;

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

const MAX_IMAGE_BYTES = 32 * 1024 ** 2;

async function readImageBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("ComfyUI sent no picture.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error("The image exceeds the 32 MB limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createComfyAdapter(options: ComfyAdapterOptions): ImageSource {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const pollMs = options.pollMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 30 * 60_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const clientId = `leonidas-code-${Math.random().toString(36).slice(2, 10)}`;
  let currentPromptId: string | null = null;

  const base = () => options.baseUrl().replace(/\/+$/, "");

  const call = async (init: RequestInit, path: string, timeoutMs: number): Promise<Response> => {
    try {
      return await doFetch(`${base()}${path}`, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new ComfyConnectionError(isTimeout(cause) ? "timeout" : "unreachable", base());
    }
  };

  const post = (path: string, body: unknown, timeoutMs = requestTimeoutMs) =>
    call(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      path,
      timeoutMs,
    );

  const get = (path: string, timeoutMs = requestTimeoutMs, signal?: AbortSignal) =>
    call(signal ? { signal } : {}, path, timeoutMs);

  /** Reading a picture twice is safe. Image submissions use no automatic retry. */
  const retrying = async <T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await action();
      } catch (error) {
        const retryable = error instanceof ComfyConnectionError;
        if (!retryable || attempt >= MAX_RETRIES) throw error;
        await sleep(BACKOFF_MS[attempt] ?? 2_000);
        if (signal?.aborted) throw new ImageCancelledError();
      }
    }
  };

  const status = async (): Promise<SourceStatus> => {
    try {
      const response = await call({}, "/system_stats", 2_500);
      if (!response.ok) {
        return { online: false, message: `ComfyUI answered ${String(response.status)}.` };
      }
      const stats: unknown = await response.json();
      if (
        !stats ||
        typeof stats !== "object" ||
        !("system" in stats) ||
        !stats.system ||
        typeof stats.system !== "object" ||
        !("comfyui_version" in stats.system) ||
        typeof stats.system.comfyui_version !== "string" ||
        !("devices" in stats) ||
        !Array.isArray(stats.devices)
      )
        return { online: false, message: "This address did not answer as ComfyUI." };
      return { online: true, message: null };
    } catch (error) {
      if (error instanceof ComfyConnectionError && error.kind === "timeout") {
        return { online: false, timedOut: true, message: "ComfyUI did not answer in time." };
      }
      return { online: false, message: `Cannot reach ComfyUI at ${base()}.` };
    }
  };

  const listModels = async (): Promise<ReadonlyArray<ImageModel>> => COMFY_MODELS;

  const uploadImage = async (
    bytes: Uint8Array,
    label: "reference" | "mask",
    signal?: AbortSignal,
  ) => {
    if (bytes.byteLength > (label === "mask" ? 256 * 1024 : MAX_IMAGE_BYTES))
      throw new Error("The image exceeds its upload size limit.");
    const form = new FormData();
    form.set(
      "image",
      new Blob([bytes.slice().buffer], { type: "image/png" }),
      `leonidas-${clientId}-${label}.png`,
    );
    form.set("type", "input");
    // The queue has one worker. Reuse its two input files between edits.
    form.set("overwrite", "true");
    const upload = await call(
      { method: "POST", body: form, ...(signal ? { signal } : {}) },
      "/upload/image",
      requestTimeoutMs,
    );
    if (!upload.ok) throw new Error(describeComfyError(upload.status, await upload.text()));
    const result: unknown = await upload.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("name" in result) ||
      typeof result.name !== "string" ||
      !/^[a-zA-Z0-9_.-]+\.png$/.test(result.name)
    )
      throw new Error("ComfyUI did not accept the reference image.");
    return result.name;
  };

  const generate = async (
    request: GenerateRequest,
    hooks: GenerateHooks = {},
  ): Promise<GeneratedImage> => {
    if (!isComfyModelId(request.modelId)) {
      throw new Error(`Unknown model: ${request.modelId}.`);
    }
    const workflowInput = {
      prompt: request.prompt,
      seed: request.seed,
      width: request.width ?? IMAGE_SIZE,
      height: request.height ?? IMAGE_SIZE,
    };
    let referenceName: string | undefined;
    if (request.referenceImage) {
      if (
        request.modelId !== "flux2klein" &&
        request.modelId !== "birefnet" &&
        request.modelId !== "upscale"
      )
        throw new Error("Image edits need FLUX.2 klein 4B.");
      referenceName = await uploadImage(request.referenceImage, "reference", hooks.signal);
    }
    if (request.maskImage && (!referenceName || request.modelId !== "flux2klein"))
      throw new Error("A brush mask needs a reference image and FLUX.2 klein 4B.");
    const maskName = request.maskImage
      ? await uploadImage(request.maskImage, "mask", hooks.signal)
      : undefined;
    const workflow: ComfyWorkflow =
      referenceName && request.modelId === "flux2klein"
        ? flux2kleinEdit({
            ...workflowInput,
            image: referenceName,
            ...(maskName ? { mask: maskName } : {}),
          })
        : COMFY_WORKFLOWS[request.modelId]({
            ...workflowInput,
            ...(referenceName ? { referenceImageName: referenceName } : {}),
          });
    let promptId: string | null = null;
    let progress: ProgressSocket | null = null;
    const earlyEvents: string[] = [];
    let reportedStart = false;
    const receiveProgress = (raw: unknown) => {
      if (typeof raw !== "string") return;
      if (promptId === null) {
        if (earlyEvents.length < 16) earlyEvents.push(raw);
        return;
      }
      let event: { type?: unknown; data?: { prompt_id?: unknown; value?: unknown; max?: unknown } };
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      const data = event?.data;
      if (data?.prompt_id !== promptId) return;
      if (!reportedStart && (event.type === "execution_start" || event.type === "executing")) {
        reportedStart = true;
        const steps =
          COMFY_WORKFLOW_SETTINGS[request.modelId as keyof typeof COMFY_WORKFLOW_SETTINGS].steps;
        if (typeof steps === "number") hooks.onProgress?.(0, steps);
      }
      if (event.type !== "progress") return;
      const { value, max } = data;
      if (
        typeof value === "number" &&
        typeof max === "number" &&
        Number.isInteger(value) &&
        Number.isInteger(max) &&
        max > 0 &&
        value >= 0 &&
        value <= max
      ) {
        reportedStart = true;
        hooks.onProgress?.(value, max);
      }
    };
    try {
      if (hooks.onProgress) {
        const address = new URL(`${base()}/ws`);
        address.protocol = address.protocol === "https:" ? "wss:" : "ws:";
        address.searchParams.set("clientId", clientId);
        progress = (options.progressSocket ?? progressSocket)(address.href);
        progress.onMessage(receiveProgress);
        await progress.ready;
      }
      if (hooks.signal?.aborted) throw new ImageCancelledError();
      // A lost response can still leave a queued job. Never submit that job twice.
      const queued = await post("/prompt", { prompt: workflow, client_id: clientId });
      if (!queued.ok) throw new Error(describeComfyError(queued.status, await queued.text()));
      const result: unknown = await queued.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("prompt_id" in result) ||
        typeof result.prompt_id !== "string" ||
        !result.prompt_id
      )
        throw new Error("ComfyUI did not return an image job id.");
      promptId = result.prompt_id;
      currentPromptId = promptId;
      for (const event of earlyEvents.splice(0)) receiveProgress(event);
      const deadline = Date.now() + maxWaitMs;
      let refusals = 0;
      for (;;) {
        if (hooks.signal?.aborted) throw new ImageCancelledError();
        let response: Response | null = null;
        try {
          response = await get(
            `/history/${encodeURIComponent(promptId)}`,
            requestTimeoutMs,
            hooks.signal,
          );
          refusals = 0;
        } catch (error) {
          // A timeout means ComfyUI is busy, for example while it loads a model. Keep waiting.
          if (!(error instanceof ComfyConnectionError)) throw error;
          if (error.kind === "unreachable") {
            refusals += 1;
            if (refusals > MAX_RETRIES) throw error;
            await sleep(BACKOFF_MS[refusals - 1] ?? 2_000);
            continue;
          }
        }
        if (response?.ok) {
          const history = (await response.json()) as Record<string, HistoryEntry>;
          const entry = history[promptId];
          if (entry) {
            if (entry.status?.status_str !== "success") {
              const failure = describeHistoryFailure(entry);
              if (failure.cancelled) throw new ImageCancelledError();
              throw new Error(failure.text);
            }
            const picture = Object.values(entry.outputs ?? {})
              .flatMap((output) => output.images ?? [])
              .at(0);
            if (!picture) throw new Error("ComfyUI finished but sent no image.");
            const query = new URLSearchParams({
              filename: picture.filename,
              subfolder: picture.subfolder ?? "",
              type: picture.type ?? "output",
            }).toString();
            const view = await retrying(
              () => get(`/view?${query}`, requestTimeoutMs, hooks.signal),
              hooks.signal,
            );
            if (!view.ok) throw new Error(describeComfyError(view.status, await view.text()));
            return {
              bytes: await readImageBytes(view),
              mimeType: "image/png",
              settings: {
                ...COMFY_WORKFLOW_SETTINGS[request.modelId],
                width: (request.width ?? IMAGE_SIZE) * (request.modelId === "upscale" ? 2 : 1),
                height: (request.height ?? IMAGE_SIZE) * (request.modelId === "upscale" ? 2 : 1),
                ...(maskName && request.referenceImage
                  ? {
                      width: new DataView(
                        request.referenceImage.buffer,
                        request.referenceImage.byteOffset,
                        request.referenceImage.byteLength,
                      ).getUint32(16),
                      height: new DataView(
                        request.referenceImage.buffer,
                        request.referenceImage.byteOffset,
                        request.referenceImage.byteLength,
                      ).getUint32(20),
                    }
                  : {}),
              },
            };
          }
        }
        if (Date.now() > deadline) throw new Error("ComfyUI took too long to make this image.");
        await sleep(pollMs);
      }
    } catch (error) {
      if (hooks.signal?.aborted) {
        await interrupt();
        throw new ImageCancelledError();
      }
      throw error;
    } finally {
      progress?.close();
      currentPromptId = null;
    }
  };

  const interrupt = async (): Promise<void> => {
    const promptId = currentPromptId;
    if (promptId === null) return;
    // ComfyUI may run another tool's image. Interrupt only when ours runs. Else remove ours from the queue.
    const running = await get("/queue", 5_000)
      .then((response) => response.json() as Promise<{ queue_running?: ReadonlyArray<unknown[]> }>)
      .then((queue) => (queue.queue_running ?? []).some((entry) => entry[1] === promptId))
      .catch(() => false);
    if (running) {
      await post("/interrupt", { prompt_id: promptId }, 5_000).catch(() => undefined);
    } else {
      await post("/queue", { delete: [promptId] }, 5_000).catch(() => undefined);
    }
  };

  /** The reply body of `/free` is empty, so it is never read as JSON. A 12 GB card stalls without this call. */
  const freeMemory = async (): Promise<void> => {
    await post("/free", { unload_models: true, free_memory: true }, 10_000).catch(() => undefined);
  };

  return {
    id: "comfyui",
    label: "ComfyUI",
    address: base,
    listModels,
    generate,
    status,
    interrupt,
    freeMemory,
  };
}
