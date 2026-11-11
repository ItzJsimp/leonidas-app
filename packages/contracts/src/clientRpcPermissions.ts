import * as Schema from "effect/Schema";
import { GitPreparePullRequestThreadInput, GitRunStackedActionInput } from "./git.ts";
import {
  AuthOrchestrationOperateScope,
  AuthFilesystemReadScope,
  AuthFilesystemWriteScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  AuthTerminalOperateScope,
  type AuthEnvironmentScope,
} from "./auth.ts";
import { ORCHESTRATION_V2_WS_METHODS } from "./orchestrationV2.ts";
import { WS_METHODS } from "./rpc.ts";

/** Incremental client enforcement; the server still authorizes every request. */
export const CLIENT_GUARDED_RPC_SCOPES = {
  [WS_METHODS.aiosLimitSet]: AuthOrchestrationOperateScope,
  [WS_METHODS.voiceLimitSet]: AuthOrchestrationOperateScope,
  [WS_METHODS.voiceLogMemoryApprove]: AuthFilesystemWriteScope,
  [WS_METHODS.marketingDecide]: AuthFilesystemWriteScope,
  [WS_METHODS.contentMove]: AuthFilesystemWriteScope,
  [WS_METHODS.contentSaveScript]: AuthFilesystemWriteScope,
  [WS_METHODS.contentPairingAccept]: AuthFilesystemWriteScope,
  [WS_METHODS.contentPairingStart]: AuthFilesystemWriteScope,
  [WS_METHODS.contentSync]: AuthFilesystemWriteScope,
  [WS_METHODS.contentDecideDeal]: AuthFilesystemWriteScope,
  [WS_METHODS.contentCreateDeal]: AuthFilesystemWriteScope,
  [WS_METHODS.voiceSetGroqKey]: AuthSettingsWriteScope,
  [WS_METHODS.voiceClearGroqKey]: AuthSettingsWriteScope,
  [WS_METHODS.voiceTranscribe]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeStart]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeStop]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeRetry]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeDeleteHistory]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeMeetings]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeMeetingsDiscord]: AuthSettingsWriteScope,
  [WS_METHODS.scribePutDictionary]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribeRejectSuggestion]: AuthOrchestrationOperateScope,
  [WS_METHODS.scribePatchSettings]: AuthSettingsWriteScope,
  [WS_METHODS.scribeGetGroqKey]: AuthSettingsWriteScope,
  [WS_METHODS.scribeSetGroqKey]: AuthSettingsWriteScope,
  [WS_METHODS.scribeClearGroqKey]: AuthSettingsWriteScope,
  [WS_METHODS.savedItemsCreate]: AuthOrchestrationOperateScope,
  [WS_METHODS.subagentsRespondSpawnApproval]: AuthOrchestrationOperateScope,
  [WS_METHODS.subagentsUpdate]: AuthOrchestrationOperateScope,
  [WS_METHODS.subagentsCreate]: AuthOrchestrationOperateScope,
  [WS_METHODS.focusUpdate]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsUpdate]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsTransition]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsImport]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsLaunch]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsSchedule]: AuthOrchestrationOperateScope,
  [WS_METHODS.savedItemsSaveTask]: AuthOrchestrationOperateScope,
  [WS_METHODS.projectsCancelPromptPrediction]: AuthFilesystemReadScope,
  // Stopping a server signals its processes, as closing a terminal does.
  [WS_METHODS.previewStopLocalServer]: AuthTerminalOperateScope,
  [WS_METHODS.previewClose]: AuthPreviewOperateScope,
  [WS_METHODS.serverRunStorageCleanup]: AuthSettingsWriteScope,
  [WS_METHODS.serverCheckOtlpEndpoint]: AuthSettingsWriteScope,
  [WS_METHODS.pullRequestsRunAction]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsUpdate]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsComment]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsUpdateComment]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsSubmitReview]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsReplyToThread]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsSetThreadResolution]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsSetReaction]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsSetFilesViewed]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsRequestReviewers]: AuthSourceControlWriteScope,
  [WS_METHODS.pullRequestsSetLabels]: AuthSourceControlWriteScope,
  // Writing a guide runs a model on this environment's providers, which reading one does not.
  [WS_METHODS.pullRequestsGenerateReviewGuide]: AuthOrchestrationOperateScope,
  [WS_METHODS.sourceControlCloneRepository]: AuthSourceControlWriteScope,
  [WS_METHODS.sourceControlPublishRepository]: AuthSourceControlWriteScope,
  [WS_METHODS.projectCloneStart]: AuthSourceControlWriteScope,
  [WS_METHODS.projectCloneCancel]: AuthSourceControlWriteScope,
  [WS_METHODS.projectCloneRetry]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsPull]: AuthSourceControlWriteScope,
  [WS_METHODS.gitRunStackedAction]: AuthSourceControlWriteScope,
  [WS_METHODS.gitPreparePullRequestThread]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsCreateWorktree]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsRemoveWorktree]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsCreateRef]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsSwitchRef]: AuthSourceControlWriteScope,
  [WS_METHODS.vcsInit]: AuthSourceControlWriteScope,

  [WS_METHODS.localVmConnect]: AuthOrchestrationOperateScope,
  [WS_METHODS.localVmPause]: AuthOrchestrationOperateScope,
  [WS_METHODS.localVmRelease]: AuthOrchestrationOperateScope,
  [WS_METHODS.localVmInput]: AuthOrchestrationOperateScope,
  [WS_METHODS.scheduledTasksUpsert]: AuthOrchestrationOperateScope,
  [WS_METHODS.scheduledTasksSetEnabled]: AuthOrchestrationOperateScope,
  [WS_METHODS.scheduledTasksDelete]: AuthOrchestrationOperateScope,
  [WS_METHODS.scheduledTasksRunNow]: AuthOrchestrationOperateScope,
  [WS_METHODS.scheduledTasksRotateWebhookToken]: AuthOrchestrationOperateScope,
  [ORCHESTRATION_V2_WS_METHODS.stopWorkflow]: AuthOrchestrationOperateScope,
  [WS_METHODS.calendarAddLink]: AuthSettingsWriteScope,
  [WS_METHODS.calendarRemove]: AuthSettingsWriteScope,
  [WS_METHODS.calendarGoogleSetClient]: AuthSettingsWriteScope,
  [WS_METHODS.calendarGoogleConnect]: AuthSettingsWriteScope,
  [WS_METHODS.calendarGoogleSelect]: AuthSettingsWriteScope,
  [WS_METHODS.hardwareSetLimit]: AuthSettingsWriteScope,
  [WS_METHODS.hardwareSetDeepSensors]: AuthSettingsWriteScope,
  [WS_METHODS.hardwareAcknowledgeAlert]: AuthOrchestrationOperateScope,
  [WS_METHODS.hardwarePrepareAgent]: AuthOrchestrationOperateScope,
  [WS_METHODS.imagesGenerate]: AuthOrchestrationOperateScope,
  [WS_METHODS.imagesCancel]: AuthOrchestrationOperateScope,
  [WS_METHODS.imagesKeep]: AuthOrchestrationOperateScope,
  [WS_METHODS.imagesRetry]: AuthOrchestrationOperateScope,
  [WS_METHODS.imagesSetBaseUrl]: AuthSettingsWriteScope,
  [WS_METHODS.localModelsPull]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsCancelPull]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsRun]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsStop]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsSpeedTest]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsStartOllama]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsCompare]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsComparePick]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsTokenReport]: AuthOrchestrationOperateScope,
  [WS_METHODS.localModelsDelete]: AuthOrchestrationOperateScope,
  [WS_METHODS.filesDelete]: AuthOrchestrationOperateScope,
} as const;
export type ClientGuardedRpcTag = keyof typeof CLIENT_GUARDED_RPC_SCOPES;

const decodePrepareThread = Schema.decodeUnknownSync(GitPreparePullRequestThreadInput);
const decodeStackedAction = Schema.decodeUnknownSync(GitRunStackedActionInput);

export function clientRpcRequiredScopes(
  method: string,
  input: unknown,
): readonly AuthEnvironmentScope[] {
  if (method === WS_METHODS.gitPreparePullRequestThread && input !== undefined) {
    const payload = decodePrepareThread(input);
    if (payload.mode === "worktree" && payload.threadId !== undefined)
      return [AuthSourceControlWriteScope, AuthOrchestrationOperateScope];
  }
  if (method === WS_METHODS.gitRunStackedAction && input !== undefined) {
    const payload = decodeStackedAction(input);
    if (
      payload.threadId !== undefined &&
      (payload.action === "create_pr" || payload.action === "commit_push_pr")
    )
      return [AuthSourceControlWriteScope, AuthOrchestrationReadScope];
  }
  return Object.hasOwn(CLIENT_GUARDED_RPC_SCOPES, method)
    ? [CLIENT_GUARDED_RPC_SCOPES[method as ClientGuardedRpcTag]]
    : [];
}
