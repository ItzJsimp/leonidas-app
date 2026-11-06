import {
  isProviderAvailable,
  isProviderTextGenerationCapable,
  VoiceLogDraft,
  VoiceLogMemoryError,
  type VoiceLogMemoryApproveInput,
  type VoiceLogMemoryReview,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as TaskBoardService from "../taskBoard/TaskBoardService.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ScribeEngine from "./ScribeEngine.ts";
import { voiceLogTexts, voiceLogWindow } from "./voiceLogMemory.logic.ts";
import { PerfMonitor } from "../diagnostics/perfMonitor.ts";

const Stored = Schema.Struct({
  lastDay: Schema.NullOr(Schema.String),
  draft: Schema.NullOr(VoiceLogDraft),
});
const decodeStored = Schema.decodeUnknownSync(Schema.fromJsonString(Stored));
const isMemoryError = Schema.is(VoiceLogMemoryError);
const failure = () =>
  new VoiceLogMemoryError({
    message: "Voice-log memory could not finish. Check the draft and try again later.",
  });

export class VoiceLogMemory extends Context.Service<
  VoiceLogMemory,
  {
    readonly review: Effect.Effect<VoiceLogMemoryReview, VoiceLogMemoryError>;
    readonly tick: Effect.Effect<void, VoiceLogMemoryError>;
    readonly approve: (
      input: VoiceLogMemoryApproveInput,
    ) => Effect.Effect<VoiceLogMemoryReview, VoiceLogMemoryError>;
  }
>()("t3/scribe/VoiceLogMemory") {}

/** Construct without starting the nightly loop, so tests use the same service. */
export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const settings = yield* ServerSettings.ServerSettingsService;
  const providers = yield* ProviderRegistry.ProviderRegistry;
  const projects = yield* ProjectService.ProjectService;
  const board = yield* TaskBoardService.TaskBoardService;
  const generation = yield* TextGeneration.TextGeneration;
  const engine = yield* ScribeEngine.ScribeEngine;
  const lock = yield* Semaphore.make(1);
  const storePath = path.join(config.stateDir, "voice-log-memory.json");
  let problem: string | null = null;
  let perf: PerfMonitor | undefined;
  const write = (filePath: string, contents: string) =>
    writeFileStringAtomically({ filePath, contents }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
  const load = Effect.gen(function* () {
    if (!(yield* fs.exists(storePath))) return { lastDay: null, draft: null } as typeof Stored.Type;
    const stat = yield* fs.stat(storePath);
    if (Number(stat.size) > 32_000) return yield* failure();
    const text = yield* fs.readFileString(storePath);
    return yield* Effect.try({ try: () => decodeStored(text), catch: failure });
  });
  const save = (state: typeof Stored.Type) => write(storePath, JSON.stringify(state));
  const root = projects.snapshot.pipe(
    Effect.flatMap((snapshot) => board.aiosRoot(snapshot.projects)),
  );
  const review = Effect.gen(function* () {
    const current = yield* settings.getSettings;
    const state = yield* load;
    return {
      enabled: current.voiceLogMemory.enabled,
      canApprove: current.voiceLogMemory.enabled && (yield* root) !== null,
      draft: state.draft,
      problem,
    } satisfies VoiceLogMemoryReview;
  }).pipe(Effect.mapError(failure));
  const tick = lock.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* settings.getSettings;
      if (!current.voiceLogMemory.enabled) return;
      const now = yield* Clock.currentTimeMillis;
      const night = voiceLogWindow(now);
      const state = yield* load;
      if (state.lastDay === night.day || state.draft !== null) return;
      // Claim the night before generation so a restart cannot bill it twice.
      yield* save({ lastDay: night.day, draft: null });
      const texts: string[] = [];
      let before: string | undefined;
      for (let page = 0; page < 20; page++) {
        const history = yield* engine.listPublicHistory({
          limit: 500,
          ...(before ? { before } : {}),
        });
        texts.push(
          ...voiceLogTexts(
            history.items,
            current.voiceLogMemory.skipApps,
            night.since,
            night.until,
          ),
        );
        if (
          history.next === null ||
          texts.length >= 200 ||
          history.items.some((item) => Date.parse(item.at) < night.since)
        )
          break;
        if (before === history.next) return yield* failure();
        before = history.next;
      }
      const bounded: string[] = [];
      let remaining = 40_000;
      for (const text of texts.slice(0, 200)) {
        if (remaining <= 0) break;
        bounded.push(text.slice(0, remaining));
        remaining -= bounded[bounded.length - 1]!.length;
      }
      if (bounded.length === 0) {
        problem = null;
        return;
      }
      const connected = yield* providers.getProviders;
      const picked = current.textGenerationModelSelection;
      const provider = connected.find(
        (candidate) =>
          candidate.instanceId === picked.instanceId &&
          candidate.auth.status === "authenticated" &&
          isProviderAvailable(candidate) &&
          isProviderTextGenerationCapable(candidate),
      );
      const decision = provider
        ? {
            modelSelection: picked,
            providerLabel: provider.displayName ?? provider.driver,
            reason: "Your text generation model",
          }
        : null;
      if (!decision || !generation.generateVoiceLogDraft)
        return yield* new VoiceLogMemoryError({
          message: "Connect the account of your text generation model to draft voice-log memories.",
        });
      // Recheck consent after history paging, immediately before sending text.
      if (!(yield* settings.getSettings).voiceLogMemory.enabled) return;
      const generated = yield* generation.generateVoiceLogDraft({
        cwd: config.stateDir,
        texts: bounded,
        modelSelection: decision.modelSelection,
      });
      if (!(yield* settings.getSettings).voiceLogMemory.enabled) return;
      const lines = [
        ...new Set(
          generated.lines
            .map((line) =>
              line
                .replace(/[\r\n]+/g, " ")
                .replace(/\u2014/g, ", ")
                .trim(),
            )
            .filter(Boolean),
        ),
      ]
        .slice(0, 20)
        .map((line) => line.slice(0, 500));
      yield* save({
        lastDay: night.day,
        draft:
          lines.length === 0
            ? null
            : {
                id: `voice-log-${night.day}`,
                day: night.day,
                lines,
                modelSelection: decision.modelSelection,
                providerLabel: decision.providerLabel,
                reason: decision.reason,
              },
      });
      problem = null;
      perf ??= new PerfMonitor("leonidas-code");
      perf.record("voice-log.draft.total_ms", (yield* Clock.currentTimeMillis) - now);
    }).pipe(
      Effect.mapError((error) => {
        problem = isMemoryError(error) ? error.message : failure().message;
        return new VoiceLogMemoryError({ message: problem });
      }),
    ),
  );
  const approve = (input: VoiceLogMemoryApproveInput) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        if (!(yield* settings.getSettings).voiceLogMemory.enabled)
          return yield* new VoiceLogMemoryError({
            message: "Enable voice-log memory before approving a draft.",
          });
        const state = yield* load;
        if (!state.draft || state.draft.id !== input.draftId)
          return yield* new VoiceLogMemoryError({
            message: "This draft changed. Refresh before approving it.",
          });
        const indexes = [...new Set(input.selected)];
        if (
          indexes.some(
            (index) => !Number.isInteger(index) || index < 0 || index >= state.draft!.lines.length,
          )
        )
          return yield* failure();
        if (indexes.length > 0) {
          const aios = yield* root;
          if (!aios)
            return yield* new VoiceLogMemoryError({
              message: "Connect an AIOS folder before approving this draft.",
            });
          const target = path.join(aios, "memory", "observed", "voice-log.md");
          const previous = (yield* fs.exists(target))
            ? yield* fs.readFileString(target)
            : "# Voice-log memories\n";
          const marker = `<!-- ${state.draft.id} -->`;
          if (!previous.includes(marker))
            yield* write(
              target,
              `${previous.trimEnd()}\n\n${marker}\n## ${state.draft.day}\n\n${indexes.map((index) => `- ${state.draft!.lines[index]}`).join("\n")}\n`,
            );
        }
        yield* save({ lastDay: state.lastDay, draft: null });
        return yield* review;
      }).pipe(Effect.mapError((error) => (isMemoryError(error) ? error : failure()))),
    );
  return VoiceLogMemory.of({ review, tick, approve });
});

export const layer = Layer.effect(
  VoiceLogMemory,
  Effect.gen(function* () {
    const service = yield* make;
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* service.tick.pipe(
            Effect.catch((error) =>
              Effect.logWarning("voice-log.memory.failed", { message: error.message }),
            ),
          );
          yield* Effect.sleep("1 minute");
        }),
      ),
    );
    return service;
  }),
);
