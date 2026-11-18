import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";
import { useEffect } from "react";

import { APP_VERSION } from "~/branding";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { serverEnvironment } from "~/state/server";
import { resolveVersionMismatch } from "~/versionSkew";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  closeFinishedUpdateRun,
  getUpdateEverythingToastView,
  type UpdateEverythingResult,
  type UpdateEverythingRun,
  type UpdateRunMachine,
} from "./updateEverything.logic";

const updateEverythingRunAtom = Atom.make<UpdateEverythingRun | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("update-everything-run"),
);

function setUpdateEverythingRun(
  update: (run: UpdateEverythingRun | null) => UpdateEverythingRun | null,
): void {
  appAtomRegistry.update(updateEverythingRunAtom, update);
}

function updateRunMachines(update: (machine: UpdateRunMachine) => UpdateRunMachine): void {
  setUpdateEverythingRun(
    (run) => run && closeFinishedUpdateRun({ ...run, machines: run.machines.map(update) }),
  );
}

function settleUpdateRunMachine(
  environmentId: EnvironmentId,
  failure: string | null,
  {
    serverUpdated = false,
    providerFailure,
  }: { readonly serverUpdated?: boolean; readonly providerFailure?: string | null } = {},
): void {
  updateRunMachines((machine) =>
    machine.environmentId === environmentId
      ? {
          ...machine,
          result: failure === null ? "done" : "failed",
          failure,
          ...(serverUpdated ? { server: null } : {}),
          ...(providerFailure === undefined ? {} : { providerFailure }),
        }
      : machine,
  );
}

const SAVED_RESULT_KEY = "t3code:update-everything-result:v1";
const SAVED_RESULT_MAX_AGE_MS = 10 * 60 * 1000;
// Covers a background service's 30-minute trial start, like the server update itself.
const HANDOFF_TIMEOUT_MS = 32 * 60 * 1000;

const HandedOffServer = Schema.Struct({
  environmentId: EnvironmentId,
  label: Schema.String,
  targetVersion: Schema.String,
  startedAt: Schema.Number,
});
type HandedOffServer = typeof HandedOffServer.Type;

const SavedResult = Schema.Struct({
  savedAt: Schema.Number,
  localVersion: Schema.NullOr(Schema.String),
  updatedServers: Schema.Number,
  updatedProviders: Schema.Number,
  failures: Schema.Array(Schema.String),
  handedOff: Schema.optional(Schema.Array(HandedOffServer)),
});
const decodeSavedResult = Schema.decodeUnknownOption(Schema.fromJsonString(SavedResult));

function takeSavedUpdateEverythingResult(): typeof SavedResult.Type | null {
  try {
    const raw = window.localStorage.getItem(SAVED_RESULT_KEY);
    if (raw === null) return null;
    window.localStorage.removeItem(SAVED_RESULT_KEY);
    return Option.getOrNull(
      Option.filter(
        decodeSavedResult(raw),
        (saved) => Date.now() - saved.savedAt < SAVED_RESULT_MAX_AGE_MS,
      ),
    );
  } catch {
    return null;
  }
}

function showUpdateEverythingResult(result: UpdateEverythingResult): void {
  const view = getUpdateEverythingToastView(result, APP_VERSION);
  if (!view) return;
  toastManager.add(
    stackedThreadToast({
      type: view.type,
      title: view.title,
      ...(view.description
        ? { description: <span className="whitespace-pre-line">{view.description}</span> }
        : {}),
    }),
  );
}

function followHandedOffServers(servers: ReadonlyArray<HandedOffServer>): void {
  if (servers.length === 0) return;
  setUpdateEverythingRun(() => ({
    localVersion: null,
    phase: "servers",
    restartAt: null,
    machines: servers.map((server) => ({
      environmentId: server.environmentId,
      label: server.label,
      updatesProviders: false,
      server: null,
      handedOffVersion: server.targetVersion,
      startedAt: server.startedAt,
      result: null,
      failure: null,
      providerFailure: null,
    })),
  }));
  let remaining = servers.length;
  let updatedServers = 0;
  const failures: string[] = [];
  for (const server of servers) {
    let settled = false;
    const settle = (failure: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      queueMicrotask(() => unsubscribe());
      settleUpdateRunMachine(server.environmentId, failure);
      if (failure === null) updatedServers += 1;
      else failures.push(`${server.label}: ${failure}`);
      remaining -= 1;
      if (remaining === 0) {
        showUpdateEverythingResult({
          localVersion: null,
          updatedServers,
          updatedProviders: 0,
          failures,
          restarting: [],
        });
      }
    };
    const timer = setTimeout(
      () => settle(`Not back after ${HANDOFF_TIMEOUT_MS / 60_000} minutes`),
      server.startedAt + HANDOFF_TIMEOUT_MS - Date.now(),
    );
    const unsubscribe = appAtomRegistry.subscribe(
      serverEnvironment.configValueAtom(server.environmentId),
      (config) => {
        if (
          config !== null &&
          resolveVersionMismatch(config.environment.serverVersion, server.targetVersion) === null
        ) {
          settle(null);
        }
      },
      { immediate: true },
    );
  }
}

let notifiedNotAppliedVersion: string | null = null;

export function DesktopUpdateLaunchNotice() {
  const notAppliedVersion = useDesktopUpdateState()?.notAppliedVersion ?? null;

  useEffect(() => {
    const saved = takeSavedUpdateEverythingResult();
    if (!saved) return;
    const handedOff = saved.handedOff ?? [];
    showUpdateEverythingResult({ ...saved, restarting: handedOff.map((server) => server.label) });
    followHandedOffServers(handedOff);
  }, []);

  useEffect(() => {
    if (notAppliedVersion === null || notifiedNotAppliedVersion === notAppliedVersion) return;
    notifiedNotAppliedVersion = notAppliedVersion;
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Update did not apply",
        description: `Leonidas is still on ${APP_VERSION}. Install ${notAppliedVersion} again from the update button.`,
      }),
    );
  }, [notAppliedVersion]);

  return null;
}
