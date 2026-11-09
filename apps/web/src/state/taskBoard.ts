import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";

export const taskBoardQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board",
  tag: WS_METHODS.taskBoardList,
  staleTimeMs: 5_000,
  idleTtlMs: 30_000,
});

export const taskBoardWorkspaceQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:workspace",
  tag: WS_METHODS.taskBoardWorkspace,
  staleTimeMs: 3_000,
  idleTtlMs: 30_000,
});

export const taskBoardCardUpdate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:card-update",
  tag: WS_METHODS.taskBoardCardUpdate,
});

export const taskBoardApplyChangeSet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:apply-change-set",
  tag: WS_METHODS.taskBoardApplyChangeSet,
});

/** Sets one project's open-task limit and warning in its project.md. */
export const taskBoardCapSet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:cap-set",
  tag: WS_METHODS.taskBoardCapSet,
});

export const aiosLimitsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:aios-limits",
  tag: WS_METHODS.aiosLimits,
  staleTimeMs: 3_000,
  idleTtlMs: 30_000,
});

export const aiosLimitSet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:aios-limit-set",
  tag: WS_METHODS.aiosLimitSet,
});

export const voiceLimitQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:voice-limit",
  tag: WS_METHODS.voiceLimitGet,
  staleTimeMs: 3_000,
  idleTtlMs: 30_000,
});

export const voiceLimitSet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:voice-limit-set",
  tag: WS_METHODS.voiceLimitSet,
});

export const taskBoardCardCreate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:card-create",
  tag: WS_METHODS.taskBoardCardCreate,
});

export const taskBoardShare = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:share",
  tag: WS_METHODS.taskBoardShare,
});

export const taskBoardCreate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:create",
  tag: WS_METHODS.taskBoardCreate,
});

export const taskBoardClaim = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:claim",
  tag: WS_METHODS.taskBoardClaim,
});

export const taskBoardRelease = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:release",
  tag: WS_METHODS.taskBoardRelease,
});

export const taskBoardComplete = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:complete",
  tag: WS_METHODS.taskBoardComplete,
});

export const taskBoardUpdate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:update",
  tag: WS_METHODS.taskBoardUpdate,
});

export const inboxDrop = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:inbox:drop",
  tag: WS_METHODS.inboxDrop,
});

export const inboxUndo = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:inbox:undo",
  tag: WS_METHODS.inboxUndo,
});

export const taskBoardAiosDetectQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:aios-detect",
  tag: WS_METHODS.taskBoardAiosDetect,
  staleTimeMs: 30_000,
  idleTtlMs: 30_000,
});

export const taskBoardHomeQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:home",
  tag: WS_METHODS.taskBoardHome,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

/** Ticks or clears one priority line in today's brief file. */
export const taskBoardHomePriorityToggle = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:home-priority-toggle",
  tag: WS_METHODS.taskBoardHomePriorityToggle,
});

/** The notes in one AIOS folder (decisions, logs, wiki), newest first. */
export const aiosFolderListQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:aios-folder-list",
  tag: WS_METHODS.aiosFolderList,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const aiosUsageShapeQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:aios-usage-shape",
  tag: WS_METHODS.aiosUsageShape,
  staleTimeMs: 10 * 60_000,
  idleTtlMs: 60_000,
});

export const taskBoardHomeWeatherQuery = createEnvironmentRpcQueryAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:task-board:home-weather",
    tag: WS_METHODS.taskBoardHomeWeather,
    staleTimeMs: 10 * 60_000,
    idleTtlMs: 10 * 60_000,
  },
);

export const taskBoardHomeNewsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:home-news",
  tag: WS_METHODS.taskBoardHomeNews,
  staleTimeMs: 15 * 60_000,
  idleTtlMs: 15 * 60_000,
});

export const ponytailUsageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:ponytail:usage",
  tag: WS_METHODS.ponytailUsage,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

/** Lists Ponytail's Codex hooks, or approves them when the user clicks Approve. */
export const ponytailCodexHooks = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:ponytail:codex-hooks",
  tag: WS_METHODS.ponytailCodexHooks,
});

export const layaUsageQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:laya:usage",
  tag: WS_METHODS.layaUsage,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const taskBoardAiosConfirm = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:aios-confirm",
  tag: WS_METHODS.taskBoardAiosConfirm,
});

/** Recent task completions: the current list on subscribe, then a new list after each one. */
export const taskBoardCompletionsLive = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:task-board:completions",
    tag: WS_METHODS.taskBoardSubscribeCompletions,
  },
);

/** The focus list: the file on subscribe, then a fresh list after each change made in the app or by an agent. */
export const focusLive = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:focus",
  tag: WS_METHODS.focusSubscribe,
});

export const focusUpdate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:focus:update",
  tag: WS_METHODS.focusUpdate,
});

/** One file attached to a note, read on demand. */
export const focusAttachmentRead = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:focus:attachment",
  tag: WS_METHODS.focusAttachment,
});

export const aiosDirectionQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:aios-direction",
  tag: WS_METHODS.aiosDirection,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

/** The org record (Departments, Areas, Members) of a business workspace. `org` is null otherwise. */
export const workspaceOrgQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:task-board:workspace-org",
  tag: WS_METHODS.workspacePackOrg,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

/** A change to the org record: applied at once when it narrows access, a proposal when it widens. */
export const workspaceOrgChange = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:workspace-org-change",
  tag: WS_METHODS.workspacePackOrgChange,
});

/** An Owner approves or rejects a waiting proposal. */
export const workspaceOrgDecide = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-board:workspace-org-decide",
  tag: WS_METHODS.workspacePackOrgDecide,
});

/** Cards a workspace pack adds to the Command Home. `[]` for a personal workspace. */
export const workspacePackWidgetsQuery = createEnvironmentRpcQueryAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:task-board:workspace-pack-widgets",
    tag: WS_METHODS.workspacePackWidgets,
    staleTimeMs: 30_000,
    idleTtlMs: 60_000,
  },
);
