import {
  deriveThreadActivityRun,
  deriveThreadRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useMemo, useRef } from "react";

import { deriveAgentActivity } from "~/agentActivity";
import { isLatestRunSettled } from "~/session-logic";
import { useThreadProjection } from "~/state/entities";

import { type LiveArea, liveArea, shellAiosFiles } from "./liveArea";

/** @public Test module mocks read this through importActual. */
export const IDLE: LiveArea = { area: null, path: null, written: [] };

const same = (a: LiveArea, b: LiveArea) =>
  a.area === b.area && a.path === b.path && a.written.join() === b.written.join();

/**
 * The live area of the open chat's current turn. It reads the projection the chat already
 * holds, and returns the same object until the area or file changes, so the rails do not
 * render again for each streamed word.
 */
export function useLiveArea(place: ScopedThreadRef | null): LiveArea {
  const projection = useThreadProjection(place)?.projection ?? null;
  const last = useRef(IDLE);

  return useMemo(() => {
    const run = projection === null ? null : deriveThreadActivityRun(projection);
    if (projection === null || run === null) return IDLE;
    const running = !isLatestRunSettled(run, deriveThreadRuntime(projection));
    const tools = deriveAgentActivity({
      runId: run.runId,
      items: projection.turnItems,
      plan: null,
    }).aios;
    const commands = projection.turnItems.flatMap((item) =>
      item.runId === run.runId && item.type === "command_execution" ? [item.input] : [],
    );
    const files = [...tools, ...shellAiosFiles(commands)];
    const next = liveArea(files, running);
    if (!same(next, last.current)) last.current = next;
    return last.current;
  }, [projection]);
}
