import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentProjects } from "./projects";

const workspaceRoots = Atom.family(
  (environmentId: Parameters<typeof environmentProjects.environmentProjectsAtom>[0]) =>
    Atom.make((get) =>
      JSON.stringify(
        get(environmentProjects.environmentProjectsAtom(environmentId)).map((project) => [
          project.id,
          project.workspaceRoot,
        ]),
      ),
    ),
);

/** Every AIOS folder the server found, with its workspace file state (ADR-0080). */
export const aiosWorkspacesQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:aios-workspaces",
  tag: WS_METHODS.aiosWorkspacesList,
  staleTimeMs: 10_000,
  idleTtlMs: 60_000,
  refreshTrigger: ({ environmentId }) => workspaceRoots(environmentId),
});

/** The setup prompt: writes workspace.json into a listed folder. */
export const aiosWorkspaceInit = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:aios-workspaces:init",
  tag: WS_METHODS.aiosWorkspacesInit,
});

/** Saves the projects the Tasks rail folds into "More" in the workspace's workspace.json. */
export const aiosWorkspaceHiddenProjectsSet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:aios-workspaces:hidden-projects",
  tag: WS_METHODS.aiosWorkspaceHiddenProjectsSet,
});
