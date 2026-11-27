import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { arrayElementsEqual } from "@t3tools/client-runtime/state/entities";
import {
  createEnvironmentThreadDetailAtoms,
  createEnvironmentThreadShellAtoms,
  createEnvironmentThreadStateAtoms,
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
  createThreadEnvironmentAtoms,
} from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { hasHoldingTaskCommand } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSnapshotAtom } from "./shell";

export const threadEnvironment = createThreadEnvironmentAtoms(
  connectionAtomRuntime,
  environmentSnapshotAtom,
);
const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);
export const environmentThreadDetails = createEnvironmentThreadDetailAtoms(
  environmentThreads.stateAtom,
);
export const environmentThreadShells = createEnvironmentThreadShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: threadEnvironment.snapshotAtom,
});

const EMPTY_THREAD_STATE_ATOM = Atom.make(AsyncResult.success(EMPTY_ENVIRONMENT_THREAD_STATE)).pipe(
  Atom.withLabel("web-environment-thread:empty"),
);

export function useEnvironmentThread(
  environmentId: EnvironmentId | null,
  threadId: ThreadId | null,
): EnvironmentThreadState {
  const result = useAtomValue(
    environmentId !== null && threadId !== null
      ? environmentThreads.stateAtom(environmentId, threadId)
      : EMPTY_THREAD_STATE_ATOM,
  );
  const state = Option.getOrElse(
    AsyncResult.value(result),
    () => EMPTY_ENVIRONMENT_THREAD_STATE,
  ) as EnvironmentThreadState;
  return state;
}

const isRunning = (status: string) =>
  status === "preparing" || status === "queued" || status === "starting" || status === "running";

export const isInterruptedByRestart = (
  thread: Pick<OrchestrationV2ThreadShell, "status" | "pendingBackgroundTasks">,
  holdTaskCommands?: boolean,
) =>
  isRunning(thread.status) ||
  hasHoldingTaskCommand(thread.pendingBackgroundTasks ?? [], holdTaskCommands);

type KeptThreads = ReadonlyMap<EnvironmentId, ReadonlySet<ThreadId>>;

function isDetailDone<E>(result: AsyncResult.AsyncResult<EnvironmentThreadState, E>): boolean {
  if (!AsyncResult.isSuccess(result)) return true;
  const { status, data, error } = result.value;
  if (status === "deleted" || Option.isSome(error)) return true;
  return (
    status === "live" &&
    !Option.exists(data, (thread) => thread.runs.some((run) => isRunning(run.status)))
  );
}

// Keeps its identity until a thread starts or stops, so ordinary shell
// updates do not rebuild the keep-alive set.
function createRunningThreadIdsAtom(
  threadsAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "status">>>,
) {
  return Atom.family((environmentId: EnvironmentId) => {
    let previous: ReadonlyArray<ThreadId> = [];
    return Atom.make((get) => {
      const running = get(threadsAtom(environmentId)).flatMap((thread) =>
        isRunning(thread.status) ? [thread.id] : [],
      );
      if (arrayElementsEqual(previous, running)) return previous;
      previous = running;
      return running;
    }).pipe(Atom.withLabel(`web-running-thread-ids:${environmentId}`));
  });
}

/**
 * The shell and detail streams are independent, so the shell can report a stop
 * before the detail loads or catches up. A stopped thread stays mounted until
 * its own detail is live and shows the stop too.
 */
export function createRunningThreadKeepAliveAtom<E>(input: {
  readonly environmentIdsAtom: Atom.Atom<ReadonlyArray<EnvironmentId>>;
  readonly threadsAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "status">>>;
  readonly stateAtom: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
  ) => Atom.Atom<AsyncResult.AsyncResult<EnvironmentThreadState, E>>;
}) {
  const runningThreadIdsAtom = createRunningThreadIdsAtom(input.threadsAtom);

  return Atom.make((get): KeptThreads => {
    const previous = Option.getOrUndefined(get.self<KeptThreads>());
    const kept = new Map<EnvironmentId, ReadonlySet<ThreadId>>();
    for (const environmentId of get(input.environmentIdsAtom)) {
      const threadIds = new Set(get(runningThreadIdsAtom(environmentId)));
      for (const threadId of previous?.get(environmentId) ?? []) {
        if (threadIds.has(threadId)) continue;
        const stateAtom = input.stateAtom(environmentId, threadId);
        // `once`, not `get`: a dependency on a stopped thread would hold its
        // stream open until some other change rebuilds this atom.
        if (isDetailDone(get.once(stateAtom))) continue;
        threadIds.add(threadId);
        get.subscribe(stateAtom, (state) => {
          if (isDetailDone(state)) get.refreshSelf();
        });
      }
      for (const threadId of threadIds) get.mount(input.stateAtom(environmentId, threadId));
      kept.set(environmentId, threadIds);
    }
    return kept;
  }).pipe(Atom.withLabel("web-running-thread-keep-alive"));
}

const enabledEnvironmentIdsAtom = Atom.map(environmentCatalog.catalogValueAtom, (catalog) => [
  ...enabledEnvironmentIds(catalog),
]);

/** Mounted by `RunningThreadKeepAlive` on desktop, for every enabled environment. */
export const runningThreadKeepAliveAtom = createRunningThreadKeepAliveAtom({
  environmentIdsAtom: enabledEnvironmentIdsAtom,
  threadsAtom: environmentThreadShells.environmentThreadsAtom,
  stateAtom: environmentThreads.stateAtom,
});

/**
 * Threads an app restart would interrupt, across every enabled environment: preparing, starting
 * or running, plus stopped threads whose task command is still live.
 */
export interface LiveTaskCommand {
  readonly key: string;
  readonly threadTitle: string;
  readonly command: string;
}

export function liveTaskCommandsOf(
  environmentId: EnvironmentId,
  thread: Pick<OrchestrationV2ThreadShell, "id" | "title" | "pendingBackgroundTasks">,
  holdTaskCommands?: boolean,
): ReadonlyArray<LiveTaskCommand> {
  return (thread.pendingBackgroundTasks ?? []).flatMap((task) =>
    task.kind === "command" && hasHoldingTaskCommand([task], holdTaskCommands)
      ? [
          {
            key: `${environmentId}:${thread.id}:${task.taskId}`,
            threadTitle: thread.title,
            command: task.description ?? "Command",
          },
        ]
      : [],
  );
}

/** The task commands a restart would stop, for the restart check. Services are left out. */
export const liveTaskCommandsAtom = Atom.make((get) =>
  get(enabledEnvironmentIdsAtom).flatMap((environmentId) =>
    get(environmentThreadShells.environmentThreadsAtom(environmentId)).flatMap((thread) =>
      liveTaskCommandsOf(environmentId, thread),
    ),
  ),
).pipe(Atom.withLabel("web-live-task-commands"));

export const runningThreadCountAtom = Atom.make((get) =>
  get(enabledEnvironmentIdsAtom).reduce(
    (count, environmentId) =>
      count +
      get(environmentThreadShells.environmentThreadsAtom(environmentId)).filter((thread) =>
        isInterruptedByRestart(thread),
      ).length,
    0,
  ),
).pipe(Atom.withLabel("web-running-thread-count"));
