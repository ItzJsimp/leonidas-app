// @effect-diagnostics nodeBuiltinImport:off - state and the published list are small JSON files.
// @effect-diagnostics globalDate:off - schedules compare against wall-clock time.
// @effect-diagnostics globalDateInEffect:off - the scheduler compares stored ISO times with wall-clock time.
// @effect-diagnostics globalFetch:off - the digest reads public feeds with a plain fetch, like Auto-pick skills.
import {
  AutomationError,
  type AutomationEntry,
  type AutomationsListResult,
  type AutomationsRunNowInput,
  type AutomationsRunNowResult,
  type AutomationsSetEnabledInput,
  type AutomationsSetScheduleInput,
  OPENROUTER_DRIVER_KIND,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as ServerConfig from "../config.ts";
import { appendDraft } from "../events/eventsRpc.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as VoiceKeyStore from "../scribe/VoiceKeyStore.ts";
import { forkParked } from "../serverActivation.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { TaskBoardService } from "../taskBoard/TaskBoardService.ts";
import {
  BUILT_INS,
  type BuiltIn,
  nextRun,
  readState,
  runBuiltIn,
  type StateFile,
  toEntry,
  writeState,
} from "./catalog.ts";
import { execFile } from "./check.ts";
import { type FreeStep, makeFreeChat } from "./freeChat.ts";
import { readRegister } from "./register.ts";
import { controlWindowsTask, TASK_PREFIX, type TaskAction } from "./windowsTasks.ts";

/** Groq model Auto-pick skills uses by default (`composerAutoPickGroqModel`). */
const GROQ_FREE_MODEL = "qwen/qwen3.8-27b";
/** The file the AIOS register script reads, so the tab and the register list the same app automations. */
export const PUBLISHED_FILE = "automations/app-automations.json";
/**
 * What each automation last sent, kept in the AIOS, not per install: the live app and the dev
 * copy share one AIOS, so a problem is sent once, not once per running app.
 */
export const NOTIFIED_FILE = "automations/notified.json";
const TICK = "1 minute";

export class AutomationService extends Context.Service<
  AutomationService,
  {
    readonly list: (workspaceId?: string) => Effect.Effect<AutomationsListResult, AutomationError>;
    readonly setEnabled: (
      input: AutomationsSetEnabledInput,
    ) => Effect.Effect<AutomationEntry, AutomationError>;
    readonly setSchedule: (
      input: AutomationsSetScheduleInput,
    ) => Effect.Effect<AutomationEntry, AutomationError>;
    readonly runNow: (
      input: AutomationsRunNowInput,
    ) => Effect.Effect<AutomationsRunNowResult, AutomationError>;
  }
>()("t3/automations/AutomationService") {}

/** The Leonidas checkout under `<aios>/projects/` (Batch 12 renames it to leonidas-app), or null. */
export function builderRepo(aiosRoot: string): string | null {
  for (const name of ["leonidas-app", "leonidas-code"]) {
    const repo = NodePath.join(aiosRoot, "projects", name);
    if (NodeFS.existsSync(NodePath.join(repo, ".git"))) return repo;
  }
  return null;
}

const applicable = (builtIn: BuiltIn, repo: string | null) => !builtIn.builderOnly || repo !== null;

const fetchText = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "Leonidas-Code-frontier-digest", Accept: "*/*" },
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
};

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const projectService = yield* ProjectService.ProjectService;
  const taskBoard = yield* TaskBoardService;
  const settingsService = yield* ServerSettingsService;
  const voiceKeys = yield* Effect.serviceOption(VoiceKeyStore.VoiceKeyStore);
  const stateFile = NodePath.join(config.stateDir, "automations.json");
  const running = new Set<string>();

  const aiosRoot = (workspaceId?: string) =>
    projectService.snapshot.pipe(
      Effect.map((snapshot) => snapshot.projects),
      Effect.orElseSucceed(() => []),
      Effect.flatMap((projects) => taskBoard.aiosRoot(projects, workspaceId)),
    );

  const freeSteps = Effect.gen(function* () {
    const steps: FreeStep[] = [];
    const settings = yield* settingsService.getSettings.pipe(Effect.option);
    if (Option.isSome(settings)) {
      for (const instance of Object.values(settings.value.providerInstances)) {
        // The free router bills $0, so a key saved for chat serves even when chat use is off.
        if (instance.driver !== OPENROUTER_DRIVER_KIND) continue;
        const key = (instance.config as { apiKey?: unknown } | undefined)?.apiKey;
        if (typeof key === "string" && key.trim()) {
          steps.push({ engine: "openrouter", model: "openrouter/free", key: key.trim() });
          break;
        }
      }
    }
    if (Option.isSome(voiceKeys)) {
      const groq = yield* voiceKeys.value.get.pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      );
      if (Option.isSome(groq))
        steps.push({ engine: "groq", model: GROQ_FREE_MODEL, key: groq.value });
    }
    return steps;
  });

  const publish = (root: string, state: StateFile) => {
    const repo = builderRepo(root);
    const entries = BUILT_INS.filter((builtIn) => applicable(builtIn, repo)).map((builtIn) =>
      toEntry(builtIn, state[builtIn.id]),
    );
    try {
      const file = NodePath.join(root, PUBLISHED_FILE);
      NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
      NodeFS.writeFileSync(
        file,
        `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`,
      );
    } catch {
      // A read-only AIOS still runs the watchers; only the register copy is missing.
    }
    return entries;
  };

  const runOne = (builtIn: BuiltIn, root: string, dryRun: boolean) =>
    Effect.gen(function* () {
      if (running.has(builtIn.id)) {
        return yield* new AutomationError({ message: `${builtIn.name} is already running.` });
      }
      running.add(builtIn.id);
      const notifiedFile = NodePath.join(root, NOTIFIED_FILE);
      const sent = readState(notifiedFile)[builtIn.id]?.notified;
      const own = readState(stateFile)[builtIn.id];
      const previous = sent === undefined ? own : { ...own, notified: sent };
      const steps = yield* freeSteps;
      const output = yield* Effect.promise(() =>
        runBuiltIn(
          builtIn,
          previous,
          {
            aiosRoot: root,
            repoPath: builderRepo(root),
            now: Date.now(),
            exec: execFile,
            dryRun,
            lastRunAt: previous?.lastRunAt ? Date.parse(previous.lastRunAt) : null,
          },
          { fetchText, freeChat: makeFreeChat(steps) },
        ),
      ).pipe(Effect.ensuring(Effect.sync(() => running.delete(builtIn.id))));
      if (dryRun) return { entry: toEntry(builtIn, previous), report: output.report, notified: 0 };
      let notified = 0;
      if (output.event !== null) {
        yield* appendDraft(root, output.event).pipe(
          Effect.tap(() => Effect.sync(() => (notified = 1))),
          Effect.catch((error) =>
            Effect.logWarning("automation event not written", { error: error.message }),
          ),
        );
      }
      const { notified: remember, ...own2 } = output.state;
      try {
        writeState(notifiedFile, {
          ...readState(notifiedFile),
          [builtIn.id]: { notified: remember },
        });
      } catch {
        // A read-only AIOS keeps the memory per install only.
      }
      const state = { ...readState(stateFile), [builtIn.id]: { ...own2, notified: remember } };
      writeState(stateFile, state);
      publish(root, state);
      return { entry: toEntry(builtIn, output.state), report: output.report, notified };
    });

  const find = (id: string) => {
    const builtIn = BUILT_INS.find((entry) => entry.id === id);
    return builtIn
      ? Effect.succeed(builtIn)
      : Effect.fail(
          new AutomationError({ message: `Only app automations can change here, not "${id}".` }),
        );
  };

  const windowsTask = (workspaceId: string | undefined, id: string, action: TaskAction) =>
    requireRoot(workspaceId).pipe(
      Effect.flatMap((root) =>
        Effect.tryPromise({
          try: () => controlWindowsTask(root, id, action, execFile),
          catch: (error) =>
            new AutomationError({
              message: error instanceof Error ? error.message : String(error),
            }),
        }),
      ),
    );

  const requireRoot = (workspaceId?: string) =>
    aiosRoot(workspaceId).pipe(
      Effect.flatMap((root) =>
        root === null
          ? Effect.fail(new AutomationError({ message: "No AIOS is connected." }))
          : Effect.succeed(root),
      ),
    );

  const update = (
    id: string,
    workspaceId: string | undefined,
    change: (state: StateFile[string]) => StateFile[string],
  ) =>
    Effect.gen(function* () {
      const builtIn = yield* find(id);
      const root = yield* requireRoot(workspaceId);
      const all = readState(stateFile);
      const next = change(all[id] ?? {});
      const state = { ...all, [id]: next };
      writeState(stateFile, state);
      publish(root, state);
      return toEntry(builtIn, next);
    });

  /** Runs every enabled automation whose next run time has passed. A first sight only sets the time. */
  const tick = Effect.gen(function* () {
    const root = yield* aiosRoot();
    if (root === null) return;
    const repo = builderRepo(root);
    let state = readState(stateFile);
    let changed = false;
    for (const builtIn of BUILT_INS) {
      if (!applicable(builtIn, repo)) continue;
      const current = state[builtIn.id] ?? {};
      if (current.enabled === false) continue;
      const schedule = current.schedule ?? builtIn.schedule;
      if (!current.nextRunAt) {
        // Saved at once: a run below reloads the file and must not drop this time.
        state[builtIn.id] = { ...current, nextRunAt: nextRun(schedule, Date.now()) ?? undefined };
        writeState(stateFile, state);
        changed = true;
        continue;
      }
      if (Date.parse(current.nextRunAt) > Date.now()) continue;
      yield* runOne(builtIn, root, false).pipe(Effect.ignore);
      state = readState(stateFile);
    }
    if (changed) publish(root, state);
  });

  yield* forkParked(
    tick.pipe(
      Effect.catchCause((cause) => Effect.logWarning("automation tick failed", { cause })),
      Effect.repeat(Schedule.spaced(TICK)),
    ),
  );

  return AutomationService.of({
    list: (workspaceId) =>
      Effect.gen(function* () {
        const root = yield* aiosRoot(workspaceId);
        if (root === null) return { entries: [], registerBuiltAt: null };
        const state = readState(stateFile);
        const repo = builderRepo(root);
        const own = BUILT_INS.filter((builtIn) => applicable(builtIn, repo)).map((builtIn) =>
          toEntry(builtIn, state[builtIn.id]),
        );
        const register = readRegister(root);
        const ownIds = new Set(own.map((entry) => entry.id));
        return {
          entries: [...own, ...register.entries.filter((entry) => !ownIds.has(entry.id))],
          registerBuiltAt: register.builtAt,
        };
      }),
    setEnabled: (input) =>
      input.id.startsWith(TASK_PREFIX)
        ? windowsTask(input.workspaceId, input.id, { kind: input.enabled ? "enable" : "disable" })
        : update(input.id, input.workspaceId, (state) => ({
            ...state,
            enabled: input.enabled,
            nextRunAt: input.enabled
              ? (nextRun(
                  state.schedule ?? BUILT_INS.find((b) => b.id === input.id)!.schedule,
                  Date.now(),
                ) ?? undefined)
              : undefined,
          })),
    setSchedule: (input) => {
      const schedule = input.schedule;
      if (input.id.startsWith(TASK_PREFIX)) {
        return schedule.type === "fixed_time"
          ? windowsTask(input.workspaceId, input.id, {
              kind: "time",
              timeOfDay: schedule.timeOfDay,
            })
          : Effect.fail(
              new AutomationError({ message: "A Windows task changes only its start time here." }),
            );
      }
      if (schedule.type !== "interval" && schedule.type !== "fixed_time") {
        return Effect.fail(
          new AutomationError({
            message: "App automations run on an interval or at a fixed time.",
          }),
        );
      }
      return update(input.id, input.workspaceId, (state) => ({
        ...state,
        schedule,
        nextRunAt: nextRun(schedule, Date.now()) ?? undefined,
      }));
    },
    runNow: (input) =>
      Effect.gen(function* () {
        if (input.id.startsWith(TASK_PREFIX)) {
          const entry = yield* windowsTask(input.workspaceId, input.id, { kind: "run" });
          return {
            entry,
            report: [`Started ${entry.name} in Windows Task Scheduler.`],
            notified: 0,
          };
        }
        const builtIn = yield* find(input.id);
        const root = yield* requireRoot(input.workspaceId);
        return yield* runOne(builtIn, root, input.dryRun === true);
      }),
  });
});

export const layer = Layer.effect(AutomationService, make);
