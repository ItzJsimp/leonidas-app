import { GameModeActionInput, GameModeStatus } from "./gameMode.ts";
import { ReleaseStatus } from "./releaseStatus.ts";
import {
  OrchestrationV2SearchThreadError,
  OrchestrationV2SearchThreadInput,
  OrchestrationV2SearchThreadResult,
} from "./orchestrationV2.ts";
import { OrchestrationDispatchCommandError } from "./orchestrationDispatch.ts";
import {
  MarketingDecideInput,
  MarketingDecideOutput,
  MarketingListInput,
  MarketingListResult,
  MarketingRpcError,
} from "./marketing.ts";
import {
  ContentHistoryInput,
  ContentHistoryResult,
  ContentListInput,
  ContentListResult,
  ContentMoveInput,
  ContentRpcError,
  ContentSaveScriptInput,
  ContentPairingAcceptInput,
  ContentPairingStartInput,
  ContentSyncInput,
  ContentDecideDealInput,
  ContentCreateDealInput,
  ContentWriteResult,
  ContentPairingAcceptResult,
  ContentPairingCode,
  ContentSyncResult,
  ContentDecideDealResult,
  ContentDealWriteResult,
} from "./content.ts";
import { EventsAppendInput, EventsSubscribeInput, FeedEventError, FeedUpdate } from "./events.ts";
import {
  AutomationError,
  AutomationsListInput,
  AutomationsListResult,
  AutomationsRunNowInput,
  AutomationsRunNowResult,
  AutomationsSetEnabledInput,
  AutomationsSetScheduleInput,
  AutomationEntry,
} from "./automations.ts";
import {
  McpAppCallToolInput,
  McpAppCallToolResult,
  McpAppReadResourceInput,
  McpAppReadResourceResult,
  McpAppRequestError,
  McpAppToolInfo,
  McpAppToolInfoInput,
  McpAppUpdateModelContextInput,
} from "./mcpApps.ts";
import {
  ChatGptReconnectProfileInput,
  ChatGptReconnectProfile,
  ChatGptImportProfileInput,
  ChatGptHandoffInput,
  ChatGptHandoffState,
} from "./providerSetup.ts";
import {
  TaskBoardSnapshot,
  TaskBoardReadError,
  TaskBoardTask,
  TaskBoardListInput,
  TaskBoardCreateInput,
  TaskBoardClaimInput,
  TaskBoardReleaseInput,
  TaskBoardCompleteInput,
  TaskBoardCompletions,
  FocusAttachment,
  FocusAttachmentInput,
  FocusSnapshot,
  AiosUsageShape,
  FocusSubscribeInput,
  AiosDirection,
  FocusUpdateInput,
  TaskBoardUpdateInput,
  TaskBoardOperationError,
  TaskBoardWorkspaceInput,
  TaskBoardWorkspaceSnapshot,
  TaskBoardCardUpdateInput,
  TaskBoardCapSetInput,
  AiosLimit,
  AiosLimitSetInput,
  TaskBoardChangeSetInput,
  TaskBoardChangeSetResult,
  TaskBoardCardCreateInput,
  InboxDrop,
  InboxDropInput,
  InboxUndoInput,
  TaskBoardShareInput,
  TaskBoardAiosConfirmInput,
  TaskBoardAiosDetectInput,
  TaskBoardAiosDetectResult,
  TaskBoardHome,
  TaskBoardHomeInput,
  TaskBoardHomePriorityToggleInput,
  TaskBoardHomePriorityToggleResult,
  AiosFolderListInput,
  AiosFolderList,
  AiosWorkspaceScopeInput,
  AiosWorkspacesListResult,
  WorkspacePackWidgetsResult,
  WorkspaceOrgResult,
  WorkspaceOrgChangeInput,
  WorkspaceOrgDecideInput,
  WorkspaceOrgActionResult,
  AiosWorkspaceSummary,
  AiosWorkspaceInitInput,
  AiosProjectScaffoldInput,
  AiosProjectScaffoldResult,
  AiosWorkspaceHiddenProjectsInput,
  TaskBoardHomeNews,
  PonytailCodexHooks,
  PonytailCodexHooksInput,
  PonytailUsage,
  TaskBoardHomeWeather,
  TaskBoardHomeWeatherInput,
} from "./taskBoard.ts";
import {
  WorkspacePictureError,
  WorkspacePictureRemoveInput,
  WorkspacePicturesListResult,
  WorkspacePictureSetInput,
} from "./workspacePictures.ts";
import {
  AreaSyncJoinResult,
  AreaSyncScopeInput,
  AreaSyncStatusResult,
  AreaSyncSyncResult,
} from "./areaSync.ts";
import {
  HardwareAcknowledgeAlertInput,
  HardwareAlert,
  HardwareHistory,
  HardwareHistoryInput,
  HardwareInventory,
  HardwareInventoryInput,
  HardwareLimitsResult,
  HardwareLiveEvent,
  HardwareSetDeepSensorsInput,
  HardwareSetLimitInput,
  HardwarePrepareAgentInput,
  HardwarePrepareAgentResult,
  HardwarePcStatus,
  HardwareWatchError,
  HardwareWatchStatus,
} from "./hardwareWatch.ts";
import { DevPreviewError, DevPreviewInput, DevPreviewState } from "./devPreview.ts";
import {
  FilesDeleteInput,
  FilesDeleteResult,
  FilesError,
  FilesListInput,
  FilesListResult,
  SubagentRunsError,
  SubagentRunsInput,
  SubagentRunsResult,
} from "./archive.ts";
import {
  ImagesCancelInput,
  ImagesError,
  ImagesGenerateInput,
  ImagesGenerateResult,
  ImagesKeepInput,
  ImagesRetryInput,
  ImagesSetBaseUrlInput,
  ImagesState,
  ImagesSubscribeInput,
} from "./images.ts";
import {
  LocalModelsActionResult,
  LocalModelsAdvice,
  LocalModelsCompareInput,
  LocalModelsCompareResult,
  LocalModelsError,
  LocalModelsModelInput,
  LocalModelsPickInput,
  LocalModelsPickResult,
  LocalModelsTokenReport,
  LocalModelsTokenReportInput,
  LocalModelsPullInput,
  LocalModelsStartInput,
  LocalModelsState,
} from "./localModels.ts";
import * as Schema from "effect/Schema";
import { ReplyStylesListInput, ReplyStylesListResult } from "./replyStyle.ts";
import {
  SavedItem,
  SavedItemError,
  SavedItemCreateInput,
  SavedItemGetInput,
  SavedItemImportInput,
  SavedItemLaunchInput,
  SavedItemListInput,
  SavedItemListResult,
  SavedItemScheduleInput,
  SavedItemTaskInput,
  SavedItemTransitionInput,
  SavedItemUpdateInput,
} from "./savedItem.ts";
import {
  resourceTelemetryRetryScopes,
  assetCreateUrlScopes,
  settingsUpdateScopes,
  projectMutationScopes,
  preparePullRequestThreadScopes,
  stackedActionScopes,
  defineWsRpc,
} from "./rpcPolicy.ts";
import {
  AuthAccessReadScope,
  AuthDiagnosticsReadScope,
  AuthEnvironmentMaintainScope,
  AuthFilesystemReadScope,
  AuthFilesystemWriteScope,
  AuthGameModeControlScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthProvidersManageScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  AuthReleaseReadScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
  AuthAccessStreamError,
  AuthAccessStreamEvent,
  EnvironmentAuthorizationError,
} from "./auth.ts";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMiddleware from "effect/rpc/RpcMiddleware";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  CodexAuthCallbackInput,
  CodexAuthCallbackState,
  ProviderAuthCancelInput,
  ProviderAuthCompleteInput,
  ProviderAuthState,
  ProviderAuthStartInput,
  ProviderAuthRespondInput,
  ProviderInstallCancelInput,
  ProviderInstallState,
  ProviderSetupError,
  ProviderSetupInput,
} from "./providerSetup.ts";

import {
  AcpRegistryAcceptUrlAuthInput,
  AcpRegistryAcceptUrlAuthResult,
  AcpRegistryDeleteSessionInput,
  AcpRegistryDeleteSessionResult,
  AcpRegistryDisableProviderInput,
  AcpRegistryDisableProviderResult,
  AcpRegistryImportSessionInput,
  AcpRegistryImportSessionResult,
  AcpRegistryListSessionsInput,
  AcpRegistryListSessionsResult,
  AcpRegistryListProvidersInput,
  AcpRegistryListProvidersResult,
  AcpRegistryLogoutInput,
  AcpRegistryLogoutResult,
  AcpRegistryManagedBinaryUninstallInput,
  AcpRegistryManagedBinaryUninstallResult,
  AcpRegistryOperationError,
  AcpRegistryPrepareInput,
  AcpRegistryPrepareResult,
  AcpRegistrySearchInput,
  AcpRegistrySearchResult,
  AcpRegistrySetProviderInput,
  AcpRegistrySetProviderResult,
} from "./acpRegistry.ts";
import { ExternalLauncherError, LaunchEditorInput } from "./editor.ts";
import {
  BackgroundPolicySnapshot,
  ClientActivityReportInput,
  HostPowerSnapshot,
} from "./background.ts";
import {
  FilesystemGetMetadataInput,
  FilesystemGetMetadataResult,
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  FilesystemBrowseError,
  FilesystemInspectFolderInput,
  FilesystemInspectFolderResult,
} from "./filesystem.ts";
import { LayaSetupInput, LayaSetupResult, LayaUsage } from "./laya.ts";
import {
  ThreadHandoffInput,
  ThreadHandoffResult,
  ThreadSweepInput,
  ThreadSweepResult,
} from "./threadSweep.ts";
import {
  AgentSessionImportInput,
  AgentSessionImportProjectChangedError,
  AgentSessionImportProjectNotFoundError,
  AgentSessionImportResult,
  AgentSessionScanInput,
  AgentSessionScanResult,
  AgentSessionScanError,
} from "./agentSessions.ts";
import {
  AssetAccessError,
  AssetCreateUrlInput,
  AssetCreateUrlResult,
  AttachmentCreateUploadUrlInput,
  AttachmentCreateUploadUrlResult,
  AttachmentDeleteInput,
  AttachmentUploadSigningKeyError,
} from "./assets.ts";
import {
  PersistChatAttachmentsError,
  PersistChatAttachmentsInput,
  PersistChatAttachmentsResult,
} from "./chatAttachment.ts";
import {
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetTurnDiffError,
} from "./checkpointDiff.ts";
import {
  WorktreeSetupCancelInput,
  WorktreeSetupCancelResult,
  WorktreeSetupStreamEvent,
  WorktreeSetupSubscribeInput,
} from "./worktreeSetup.ts";
import {
  GitActionProgressEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
  GitCommandError,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsInitInput,
  VcsListRefsInput,
  VcsListRefsResult,
  GitManagerServiceError,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  VcsPullInput,
  GitPullRequestRefInput,
  VcsPullResult,
  VcsRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  VcsStatusInput,
  VcsStatusSubscriptionInput,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "./git.ts";
import {
  ReviewDiffFileContentsInput,
  ReviewDiffFileContentsResult,
  ReviewDiffPreviewError,
  ReviewDiffPreviewInput,
  ReviewDiffPreviewResult,
} from "./review.ts";
import { KeybindingsConfigError } from "./keybindings.ts";
import {
  OrchestrationSearchThreadsError,
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
} from "./threadSearch.ts";
import {
  ProviderUploadFeedbackError,
  ProviderUploadFeedbackInput,
  ProviderUploadFeedbackResult,
} from "./provider.ts";
import { ProviderInstanceId, ProviderInstanceMutation } from "./providerInstance.ts";
import { PullRequestReviewGuideResult } from "./pullRequestReviewGuide.ts";
import {
  TradingAppendInput,
  TradingAppendResult,
  TradingImportInput,
  TradingImportResult,
  TradingImportsResult,
  TradingPackConsentInput,
  TradingRiskRulesResult,
  TradingStateError,
  TradingSettings,
  TradingSettingsSaveInput,
  TradingCrewInput,
  TradingCrewResult,
  TradingStateInput,
  TradingStateResult,
  TradingDayReadInput,
  TradingDayReadResult,
  TradingDaySaveInput,
  TradingScreenshotReadInput,
  TradingScreenshotReadResult,
  TradingScreenshotSaveInput,
  TradingScreenshotSaveResult,
  TradingTradeAddInput,
  TradingTradeAddResult,
  TradingLibraryIndexResult,
  TradingLibraryInput,
  TradingLibraryPageInput,
  TradingLibraryPageResult,
  TradingLibrarySearchInput,
  TradingLibrarySearchResult,
  TradingResourceListResult,
  TradingResourceSaveInput,
  TradingResourceSaveResult,
} from "./trading.ts";
import {
  PullRequestActionInput,
  PullRequestActivity,
  PullRequestChangeBreakdown,
  PullRequestCommentInput,
  PullRequestCommentUpdateInput,
  PullRequestDetail,
  PullRequestPreview,
  PullRequestChecks,
  PullRequestDiffFileContentsInput,
  PullRequestDiffFileContentsResult,
  PullRequestFilesViewedResult,
  PullRequestInvalidateInput,
  PullRequestReportStateInput,
  PullRequestListInput,
  PullRequestListResult,
  PullRequestListStatsInput,
  PullRequestListStatsResult,
  PullRequestOperationError,
  PullRequestReactionInput,
  PullRequestRef,
  PullRequestRoutingResult,
  PullRequestRoutingIdentityInput,
  PullRequestRoutingIdentityResult,
  PullRequestStack,
  PullRequestLinkedThreadsResult,
  PullRequestSummary,
  PullRequestReviewerCandidateList,
  PullRequestReviewerRequestInput,
  PullRequestLabelCandidateList,
  PullRequestLabelChangeInput,
  PullRequestSetFilesViewedInput,
  PullRequestSubmitReviewInput,
  PullRequestThreadCommentsInput,
  PullRequestThreadCommentsResult,
  PullRequestThreadReplyInput,
  PullRequestThreadResolutionInput,
  PullRequestUnavailableError,
  PullRequestUpdateInput,
} from "./pullRequest.ts";
import {
  RelayClientInstallFailedError,
  RelayClientInstallProgressEventSchema,
  RelayClientStatusSchema,
} from "./relayClient.ts";
import {
  ORCHESTRATION_V2_WS_METHODS,
  OrchestrationGetWorkflowScriptError,
  OrchestrationV2StopBackgroundCommandError,
  OrchestrationV2StopWorkflowError,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2GetShellSnapshotError,
  OrchestrationV2CommandOutputError,
  OrchestrationV2GetThreadProjectionError,
  OrchestrationV2RpcSchemas,
  OrchestrationV2ThreadLaunchError,
} from "./orchestrationV2.ts";
import { ThreadContextBreakdownError } from "./contextBreakdown.ts";
import {
  ProjectCreateNewInput,
  ProjectCreateNewResult,
  ProjectEnsureScratchResult,
  ProjectListEntriesError,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectListIgnoredFilesInput,
  ProjectListIgnoredFilesResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchContentsError,
  ProjectSearchContentsInput,
  ProjectSearchContentsResult,
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project.ts";
import {
  TerminalAttachInput,
  TerminalObserveInput,
  TerminalAttachStreamEvent,
  TerminalClearInput,
  TerminalCloseInput,
  TerminalError,
  TerminalEvent,
  TerminalMetadataStreamEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal.ts";
import {
  DiscoveredLocalServerList,
  ConfiguredLocalServerUrls,
  PreviewCloseInput,
  PreviewError,
  PreviewEvent,
  PreviewListInput,
  PreviewListResult,
  PreviewClearProfileError,
  PreviewClearProfileInput,
  PreviewReportProfilesInput,
  PreviewNavigateInput,
  PreviewStopLocalServerError,
  PreviewStopLocalServerInput,
  PreviewOpenInput,
  PreviewRefreshInput,
  PreviewReportStatusInput,
  PreviewResizeInput,
  PreviewAdjustInput,
  PreviewSessionSnapshot,
} from "./preview.ts";
import {
  LocalVmConnectInput,
  LocalVmPauseInput,
  LocalVmTarget,
  LocalVmInput,
  LocalVmState,
  LocalVmSession,
  LocalVmScreenshotResult,
  LocalVmError,
} from "./localVm.ts";
import {
  DeviceActionInput,
  DeviceCloseInput,
  DeviceConfigureInput,
  DeviceDetail,
  DeviceDetailInput,
  DeviceError,
  DeviceListInput,
  SshDeviceHostConfig,
  DeviceEasAccount,
  DeviceEasAccountError,
  DeviceEasAccountInput,
  DeviceHostSummary,
  DeviceOpenInput,
  DeviceServiceState,
  DeviceSession,
  DeviceShutdownInput,
} from "./device.ts";
import {} from "./previewAutomation.ts";
import {
  ServerConfigStreamEvent,
  DesktopUpdateCommitInput,
  OtlpEndpointCheckInput,
  OtlpEndpointCheckResult,
  ServerConfig,
  ServerProviderUpdateError,
  ServerProviderUpdateInput,
  ServerLifecycleStreamEvent,
  ServerRemoveKeybindingInput,
  ServerRemoveKeybindingResult,
  ServerProviderUpdatedPayload,
  ServerSelfUpdateError,
  ServerSelfUpdateInput,
  ServerSelfUpdateProgressEvent,
  ServerSelfUpdateResult,
  ServerTraceDiagnosticsResult,
  ServerProcessDiagnosticsResult,
  ServerProcessResourceHistoryInput,
  ServerProcessResourceHistoryResult,
  ServerSignalProcessInput,
  ServerSignalProcessResult,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import {
  HostResourcesSnapshot,
  ResourceTelemetryHistory,
  ResourceTelemetryHistoryInput,
  ResourceTelemetryRetryResult,
  ResourceTelemetrySnapshot,
} from "./resourceTelemetry.ts";
import {
  UsageLimitSourceError,
  ProviderConsumeResetCreditInput,
  ProviderConsumeResetCreditResult,
} from "./providerUsageLimits.ts";
import { ChatQuota, ChatQuotaInput, ChatQuotaReport, ChatQuotaReportInput } from "./chatQuota.ts";
import { UsagePricing, UsageReadError, UsageSummary, UsageSummaryInput } from "./usage.ts";
import { TestApiKeyInput, TestApiKeyResult } from "./apiKeys.ts";
import {
  CalendarActionResult,
  CalendarAddLinkInput,
  CalendarEventsInput,
  CalendarEventsResult,
  CalendarGoogleClientInput,
  CalendarGoogleConnectResult,
  CalendarGoogleSelectInput,
  CalendarLinkInput,
  CalendarRemoveInput,
} from "./calendar.ts";
import {
  ModelBenchmarkCatalog,
  ModelBenchmarkReport,
  ModelBenchmarkReportInput,
  ModelRunStats,
} from "./modelBenchmarks.ts";
import {
  AutoPickEngine,
  AutoPickModelSlug,
  StorageCleanupReport,
  DatabaseStorageStatus,
  ServerSettings,
  ServerSettingsError,
  ServerSettingsPatch,
} from "./settings.ts";
import {
  ScheduledTaskDeleteInput,
  ScheduledTaskDeleteResult,
  ScheduledTaskError,
  ScheduledTaskListInput,
  ScheduledTaskListResult,
  ScheduledTaskRunNowInput,
  ScheduledTaskRotateWebhookTokenInput,
  ScheduledTaskListWebhookDeliveriesInput,
  ScheduledTaskListWebhookDeliveriesResult,
  ScheduledTaskGetWebhookDeliveryInput,
  ScheduledTaskGetWebhookDeliveryResult,
  ScheduledTaskRunNowResult,
  ScheduledTaskSetEnabledInput,
  ScheduledTaskUpsertInput,
  ScheduledTaskMutationResult,
} from "./scheduledTask.ts";
import { SecretRequestAnswerInput, SecretRequestError } from "./secretRequest.ts";
import {
  SubagentCatalog,
  SubagentCatalogEntry,
  SubagentCreateInput,
  SubagentDeleteInput,
  SubagentDeleteResult,
  SubagentDraftInput,
  SubagentDraftResult,
  SubagentDuplicateInput,
  SubagentEditError,
  SubagentSpawnApprovalError,
  SubagentSpawnApprovals,
  SubagentSpawnRespondInput,
  SubagentUpdateInput,
} from "./subagentSpawn.ts";
import {
  ProjectCloneActionInput,
  ProjectCloneActionResult,
  ProjectCloneListEvent,
  ProjectCloneStartInput,
  ProjectCloneStartResult,
  ProjectCloneSubscribeInput,
} from "./projectClone.ts";
import {
  SourceControlCloneRepositoryInput,
  SourceControlCloneRepositoryResult,
  SourceControlDiscoveryResult,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryError,
  SourceControlRepositoryInfo,
  SourceControlRepositoryLookupInput,
} from "./sourceControl.ts";
import { VcsError } from "./vcs.ts";
import { Project, ProjectMutation, ProjectMutationError } from "./project.ts";
import {
  VoiceError,
  VoiceSetGroqKeyInput,
  VoiceStatus,
  VoiceTranscribeInput,
  VoiceTranscribeResult,
} from "./voice.ts";
import {
  VoiceLogMemoryReview,
  VoiceLogMemoryApproveInput,
  VoiceLogMemoryError,
} from "./voiceLogMemory.ts";
import {
  ScribeCommandResult,
  ScribeDeleteHistoryInput,
  ScribeDeleteHistoryResult,
  ScribeMeetingsInput,
  ScribeMeetingsResult,
  ScribeDevices,
  ScribeDictionary,
  ScribeEngineError,
  ScribeGoals,
  ScribeGroqKey,
  ScribeHistoryPage,
  ScribeInsights,
  ScribeListHistoryInput,
  ScribeLiveEvent,
  ScribeRejectSuggestionInput,
  ScribePatchSettingsInput,
  ScribePatchSettingsResult,
  ScribeRejectSuggestionResult,
  ScribeSetGroqKeyInput,
  ScribeSettings,
  ScribeStartInput,
  ScribeStatsInput,
  ScribeStopInput,
  ScribeSuggestionList,
} from "./scribe.ts";

export const ScribeStatusSnapshot = Schema.Struct({
  service: Schema.Literal("leonidas-scribe"),
  apiVersion: Schema.Literal(1),
  state: Schema.Literals(["ready", "listening", "processing", "mic_error"]),
  sampledAt: Schema.String,
});

export const ScribeStatusResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("available"), snapshot: ScribeStatusSnapshot }),
  Schema.Struct({
    status: Schema.Literal("unavailable"),
    reason: Schema.Literals(["offline", "timeout", "invalid_response", "stale", "http_error"]),
  }),
]);
export type ScribeStatusResult = typeof ScribeStatusResult.Type;

export const WS_METHODS = {
  scribeGetStatus: "scribe.getStatus",
  scribeStart: "scribe.start",
  scribeStop: "scribe.stop",
  scribeRetry: "scribe.retry",
  voiceLogMemoryReview: "voiceLogMemory.review",
  voiceLogMemoryApprove: "voiceLogMemory.approve",
  scribeListHistory: "scribe.listHistory",
  scribeDeleteHistory: "scribe.deleteHistory",
  scribeMeetings: "scribe.meetings",
  scribeMeetingsDiscord: "scribe.meetingsDiscord",
  scribeGetInsights: "scribe.getInsights",
  scribeGetGoals: "scribe.getGoals",
  scribeGetDictionary: "scribe.getDictionary",
  scribePutDictionary: "scribe.putDictionary",
  scribeListSuggestions: "scribe.listSuggestions",
  scribeRejectSuggestion: "scribe.rejectSuggestion",
  scribeGetSettings: "scribe.getSettings",
  scribePatchSettings: "scribe.patchSettings",
  scribeListDevices: "scribe.listDevices",
  scribeGetGroqKey: "scribe.getGroqKey",
  scribeSetGroqKey: "scribe.setGroqKey",
  scribeClearGroqKey: "scribe.clearGroqKey",
  scribeSubscribeEvents: "scribe.subscribeEvents",
  voiceGetStatus: "voice.getStatus",
  voiceSetGroqKey: "voice.setGroqKey",
  voiceClearGroqKey: "voice.clearGroqKey",
  voiceTranscribe: "voice.transcribe",
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsListEntries: "projects.listEntries",
  projectsListIgnoredFiles: "projects.listIgnoredFiles",
  projectsReadFile: "projects.readFile",
  taskBoardList: "taskBoard.list",
  taskBoardCreate: "taskBoard.create",
  taskBoardClaim: "taskBoard.claim",
  taskBoardRelease: "taskBoard.release",
  taskBoardComplete: "taskBoard.complete",
  taskBoardSubscribeCompletions: "taskBoard.subscribeCompletions",
  subagentsSubscribeSpawnApprovals: "subagents.subscribeSpawnApprovals",
  subagentsRespondSpawnApproval: "subagents.respondSpawnApproval",
  subagentsList: "subagents.list",
  subagentsUpdate: "subagents.update",
  subagentsCreate: "subagents.create",
  subagentsDelete: "subagents.delete",
  subagentsDuplicate: "subagents.duplicate",
  subagentsDraft: "subagents.draft",
  taskBoardUpdate: "taskBoard.update",
  taskBoardWorkspace: "taskBoard.workspace",
  taskBoardCardUpdate: "taskBoard.cardUpdate",
  taskBoardCardCreate: "taskBoard.cardCreate",
  taskBoardApplyChangeSet: "taskBoard.applyChangeSet",
  taskBoardCapSet: "taskBoard.capSet",
  aiosLimits: "aiosLimits.list",
  aiosLimitSet: "aiosLimits.set",
  voiceLimitGet: "voiceLimit.get",
  voiceLimitSet: "voiceLimit.set",
  taskBoardShare: "taskBoard.share",
  taskBoardAiosDetect: "taskBoard.aiosDetect",
  taskBoardAiosConfirm: "taskBoard.aiosConfirm",
  taskBoardHome: "taskBoard.home",
  taskBoardHomePriorityToggle: "taskBoard.homePriorityToggle",
  aiosFolderList: "taskBoard.aiosFolderList",
  aiosUsageShape: "taskBoard.aiosUsageShape",
  aiosDirection: "taskBoard.aiosDirection",
  aiosWorkspacesList: "aiosWorkspaces.list",
  aiosWorkspacesInit: "aiosWorkspaces.init",
  aiosProjectsScaffold: "aiosProjects.scaffold",
  aiosWorkspacePicturesList: "aiosWorkspaces.picturesList",
  aiosWorkspacePictureSet: "aiosWorkspaces.pictureSet",
  aiosWorkspacePictureRemove: "aiosWorkspaces.pictureRemove",
  aiosWorkspaceHiddenProjectsSet: "aiosWorkspaces.hiddenProjectsSet",
  areaSyncJoin: "areaSync.join",
  areaSyncSync: "areaSync.sync",
  areaSyncStatus: "areaSync.status",
  workspacePackWidgets: "workspacePack.widgets",
  workspacePackOrg: "workspacePack.org",
  workspacePackOrgChange: "workspacePack.orgChange",
  workspacePackOrgDecide: "workspacePack.orgDecide",
  taskBoardHomeWeather: "taskBoard.homeWeather",
  taskBoardHomeNews: "taskBoard.homeNews",
  tradingImports: "trading.imports",
  tradingImport: "trading.import",
  tradingPackConsent: "trading.packConsent",
  tradingState: "trading.state",
  tradingAppend: "trading.append",
  tradingSettingsSave: "trading.settingsSave",
  tradingCrew: "trading.crew",
  tradingCrewSync: "trading.crewSync",
  tradingTradeAdd: "trading.tradeAdd",
  tradingDayRead: "trading.dayRead",
  tradingDaySave: "trading.daySave",
  tradingScreenshotSave: "trading.screenshotSave",
  tradingScreenshotRead: "trading.screenshotRead",
  tradingRiskRules: "trading.riskRules",
  tradingLibraryIndex: "trading.libraryIndex",
  tradingLibraryPage: "trading.libraryPage",
  tradingLibrarySearch: "trading.librarySearch",
  tradingResourceSave: "trading.resourceSave",
  tradingResourceList: "trading.resourceList",
  releaseStatusRuns: "releaseStatus.runs",
  gameModeStatus: "gameMode.status",
  gameModeRun: "gameMode.run",
  layaUsage: "laya.usage",
  ponytailUsage: "ponytail.usage",
  calendarEvents: "calendar.events",
  calendarTestLink: "calendar.testLink",
  calendarAddLink: "calendar.addLink",
  calendarRemove: "calendar.remove",
  calendarGoogleSetClient: "calendar.googleSetClient",
  calendarGoogleConnect: "calendar.googleConnect",
  calendarGoogleSelect: "calendar.googleSelect",
  ponytailCodexHooks: "ponytail.codexHooks",
  focusSubscribe: "focus.subscribe",
  eventsSubscribe: "events.subscribe",
  eventsAppend: "events.append",
  automationsList: "automations.list",
  automationsSetEnabled: "automations.setEnabled",
  automationsSetSchedule: "automations.setSchedule",
  automationsRunNow: "automations.runNow",
  marketingList: "marketing.list",
  marketingDecide: "marketing.decide",
  contentList: "content.list",
  contentHistory: "content.history",
  contentMove: "content.move",
  contentSaveScript: "content.saveScript",
  contentPairingAccept: "content.pairingAccept",
  contentPairingStart: "content.pairingStart",
  contentSync: "content.sync",
  contentDecideDeal: "content.decideDeal",
  contentCreateDeal: "content.createDeal",
  focusUpdate: "focus.update",
  focusAttachment: "focus.attachment",
  hardwareGetInventory: "hardware.getInventory",
  hardwareGetHistory: "hardware.getHistory",
  hardwareGetLimits: "hardware.getLimits",
  hardwareSetLimit: "hardware.setLimit",
  hardwareAcknowledgeAlert: "hardware.acknowledgeAlert",
  hardwareSetDeepSensors: "hardware.setDeepSensors",
  hardwarePrepareAgent: "hardware.prepareAgent",
  hardwareGetStatus: "hardware.getStatus",
  inboxDrop: "inbox.drop",
  inboxUndo: "inbox.undo",
  devPreviewStatus: "devPreview.status",
  devPreviewStart: "devPreview.start",
  devPreviewStop: "devPreview.stop",
  imagesSubscribe: "images.subscribe",
  imagesGenerate: "images.generate",
  imagesCancel: "images.cancel",
  imagesKeep: "images.keep",
  imagesRetry: "images.retry",
  imagesSetBaseUrl: "images.setBaseUrl",
  localModelsSubscribe: "localModels.subscribe",
  localModelsPull: "localModels.pull",
  localModelsCancelPull: "localModels.cancelPull",
  localModelsRun: "localModels.run",
  localModelsStop: "localModels.stop",
  localModelsSpeedTest: "localModels.speedTest",
  localModelsStartOllama: "localModels.startOllama",
  localModelsAdvice: "localModels.advice",
  localModelsCompare: "localModels.compare",
  localModelsComparePick: "localModels.comparePick",
  localModelsTokenReport: "localModels.tokenReport",
  localModelsDelete: "localModels.delete",
  filesList: "files.list",
  filesDelete: "files.delete",
  subagentRunsList: "subagentRuns.list",
  projectsPromptCandidates: "projects.promptCandidates",
  projectsPredictPrompt: "projects.predictPrompt",
  projectsPickSkills: "projects.pickSkills",
  projectsCancelPromptPrediction: "projects.cancelPromptPrediction",
  projectsSearchContents: "projects.searchContents",
  projectsSearchEntries: "projects.searchEntries",
  replyStylesList: "replyStyles.list",
  projectsWriteFile: "projects.writeFile",
  projectsMutate: "projects.mutate",
  projectsEnsureScratch: "projects.ensureScratch",
  projectsCreateNew: "projects.createNew",

  shellOpenInEditor: "shell.openInEditor",

  filesystemBrowse: "filesystem.browse",
  filesystemGetMetadata: "filesystem.getMetadata",
  filesystemInspectFolder: "filesystem.inspectFolder",
  layaSetup: "laya.setup",
  threadSweepRun: "threadSweep.run",
  threadSweepHandoff: "threadSweep.handoff",
  agentSessionsScan: "agentSessions.scan",
  agentSessionsImport: "agentSessions.import",
  assetsCreateUrl: "assets.createUrl",
  assetsPersistChatAttachments: "assets.persistChatAttachments",
  attachmentsCreateUploadUrl: "attachments.createUploadUrl",
  attachmentsDelete: "attachments.delete",

  mcpAppsCallTool: "mcpApps.callTool",
  mcpAppsToolInfo: "mcpApps.toolInfo",
  mcpAppsReadResource: "mcpApps.readResource",
  mcpAppsUpdateModelContext: "mcpApps.updateModelContext",

  providerUploadFeedback: "provider.uploadFeedback",
  providerAuthStart: "provider.auth.start",
  providerConsumeResetCredit: "provider.consumeResetCredit",
  providerAuthComplete: "provider.auth.complete",
  chatGptReconnectProfile: "provider.chatgpt.reconnect-profile",
  chatGptImportProfile: "provider.chatgpt.import-profile",
  chatGptHandoffSubscribe: "provider.chatgpt.handoff.subscribe",
  codexAuthCallbackSubscribe: "provider.codex.auth-callback.subscribe",
  providerAuthRespond: "provider.auth.respond",
  providerAuthCancel: "provider.auth.cancel",
  providerAuthLogout: "provider.auth.logout",
  providerAuthSubscribe: "provider.auth.subscribe",
  providerInstallStart: "provider.install.start",
  providerInstallCancel: "provider.install.cancel",
  providerInstallSubscribe: "provider.install.subscribe",
  providerInstallRemove: "provider.install.remove",

  vcsPull: "vcs.pull",
  vcsRefreshStatus: "vcs.refreshStatus",
  vcsListRefs: "vcs.listRefs",
  vcsCreateWorktree: "vcs.createWorktree",
  vcsRemoveWorktree: "vcs.removeWorktree",
  vcsCreateRef: "vcs.createRef",
  vcsSwitchRef: "vcs.switchRef",
  vcsInit: "vcs.init",

  gitRunStackedAction: "git.runStackedAction",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  reviewGetDiffPreview: "review.getDiffPreview",
  reviewGetDiffFileContents: "review.getDiffFileContents",

  terminalOpen: "terminal.open",
  terminalAttach: "terminal.attach",
  terminalObserve: "terminal.observe",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  previewOpen: "preview.open",
  previewNavigate: "preview.navigate",
  previewResize: "preview.resize",
  previewAdjust: "preview.adjust",
  previewRefresh: "preview.refresh",
  previewClose: "preview.close",
  previewList: "preview.list",
  previewClearProfile: "preview.clearProfile",
  previewReportProfiles: "preview.reportProfiles",
  previewReportStatus: "preview.reportStatus",
  previewStopLocalServer: "preview.stopLocalServer",

  localVmList: "localVm.list",
  localVmConnect: "localVm.connect",
  localVmPause: "localVm.pause",
  localVmRelease: "localVm.release",
  localVmScreenshot: "localVm.screenshot",
  localVmInput: "localVm.input",
  // Device methods
  deviceConfigure: "device.configure",
  deviceList: "device.list",
  deviceTestHost: "device.testHost",
  deviceEasAccount: "device.easAccount",
  deviceOpen: "device.open",
  deviceClose: "device.close",
  deviceShutdown: "device.shutdown",
  deviceDetail: "device.detail",
  deviceAction: "device.action",

  serverProbe: "server.probe",
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpdateProvider: "server.updateProvider",
  serverUpdateServer: "server.updateServer",
  serverUpdateServerWithProgress: "server.updateServerWithProgress",
  serverCommitDesktopUpdate: "server.commitDesktopUpdate",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverRemoveKeybinding: "server.removeKeybinding",
  serverRunStorageCleanup: "server.runStorageCleanup",
  serverGetStorageCleanupReport: "server.getStorageCleanupReport",
  serverGetDatabaseStorage: "server.getDatabaseStorage",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverTestApiKey: "server.testApiKey",
  serverDiscoverSourceControl: "server.discoverSourceControl",
  serverSearchAcpRegistry: "server.searchAcpRegistry",
  serverPrepareAcpRegistryAgent: "server.prepareAcpRegistryAgent",
  serverUninstallAcpRegistryManagedBinary: "server.uninstallAcpRegistryManagedBinary",
  serverAcceptAcpRegistryUrlAuth: "server.acceptAcpRegistryUrlAuth",
  serverListAcpRegistrySessions: "server.listAcpRegistrySessions",
  serverImportAcpRegistrySession: "server.importAcpRegistrySession",
  serverDeleteAcpRegistrySession: "server.deleteAcpRegistrySession",
  serverListAcpRegistryProviders: "server.listAcpRegistryProviders",
  serverSetAcpRegistryProvider: "server.setAcpRegistryProvider",
  serverDisableAcpRegistryProvider: "server.disableAcpRegistryProvider",
  serverLogoutAcpRegistry: "server.logoutAcpRegistry",
  serverGetTraceDiagnostics: "server.getTraceDiagnostics",
  serverGetProcessDiagnostics: "server.getProcessDiagnostics",
  serverGetHostResources: "server.getHostResources",
  serverGetProcessResourceHistory: "server.getProcessResourceHistory",
  serverGetResourceTelemetryHistory: "server.getResourceTelemetryHistory",
  serverRetryResourceTelemetry: "server.retryResourceTelemetry",
  serverCheckOtlpEndpoint: "server.checkOtlpEndpoint",
  serverSignalProcess: "server.signalProcess",
  serverReportClientActivity: "server.reportClientActivity",
  serverReportHostPowerState: "server.reportHostPowerState",
  serverGetBackgroundPolicy: "server.getBackgroundPolicy",
  serverGetUsageSummary: "server.getUsageSummary",
  serverGetChatQuota: "server.getChatQuota",
  serverGetChatQuotaReport: "server.getChatQuotaReport",
  serverRefreshUsageRates: "server.refreshUsageRates",
  serverGetModelBenchmarks: "server.getModelBenchmarks",
  serverGetModelBenchmarkCatalog: "server.getModelBenchmarkCatalog",
  serverGetModelRunStats: "server.getModelRunStats",

  scheduledTasksList: "scheduledTasks.list",
  savedItemsList: "savedItems.list",
  savedItemsGet: "savedItems.get",
  savedItemsCreate: "savedItems.create",
  savedItemsUpdate: "savedItems.update",
  savedItemsTransition: "savedItems.transition",
  savedItemsImport: "savedItems.import",
  savedItemsLaunch: "savedItems.launch",
  savedItemsSchedule: "savedItems.schedule",
  savedItemsSaveTask: "savedItems.saveTask",
  scheduledTasksSubscribe: "scheduledTasks.subscribe",
  scheduledTasksUpsert: "scheduledTasks.upsert",
  scheduledTasksSetEnabled: "scheduledTasks.setEnabled",
  scheduledTasksDelete: "scheduledTasks.delete",
  scheduledTasksRunNow: "scheduledTasks.runNow",
  scheduledTasksRotateWebhookToken: "scheduledTasks.rotateWebhookToken",
  secretsAnswerRequest: "secrets.answerRequest",
  scheduledTasksListWebhookDeliveries: "scheduledTasks.listWebhookDeliveries",
  scheduledTasksGetWebhookDelivery: "scheduledTasks.getWebhookDelivery",

  cloudGetRelayClientStatus: "cloud.getRelayClientStatus",
  cloudInstallRelayClient: "cloud.installRelayClient",

  pullRequestsList: "pullRequests.list",
  pullRequestsListStats: "pullRequests.listStats",
  pullRequestsSummary: "pullRequests.summary",
  pullRequestsRouting: "pullRequests.routing",
  pullRequestsRoutingIdentity: "pullRequests.routingIdentity",
  pullRequestsStack: "pullRequests.stack",
  pullRequestsLinkedThreads: "pullRequests.linkedThreads",
  pullRequestsDetail: "pullRequests.detail",
  pullRequestsPreview: "pullRequests.preview",
  pullRequestsChecks: "pullRequests.checks",
  pullRequestsActivity: "pullRequests.activity",
  pullRequestsReviewGuide: "pullRequests.reviewGuide",
  pullRequestsGenerateReviewGuide: "pullRequests.generateReviewGuide",
  pullRequestsThreadComments: "pullRequests.threadComments",
  pullRequestsDiffFileContents: "pullRequests.diffFileContents",
  pullRequestsFilesViewed: "pullRequests.filesViewed",
  pullRequestsChangeBreakdown: "pullRequests.changeBreakdown",
  pullRequestsSetFilesViewed: "pullRequests.setFilesViewed",
  pullRequestsRunAction: "pullRequests.runAction",
  pullRequestsUpdate: "pullRequests.update",
  pullRequestsComment: "pullRequests.comment",
  pullRequestsUpdateComment: "pullRequests.updateComment",
  pullRequestsSubmitReview: "pullRequests.submitReview",
  pullRequestsReplyToThread: "pullRequests.replyToThread",
  pullRequestsSetThreadResolution: "pullRequests.setThreadResolution",
  pullRequestsSetReaction: "pullRequests.setReaction",
  pullRequestsInvalidate: "pullRequests.invalidate",
  pullRequestsReportState: "pullRequests.reportState",
  pullRequestsSubscribeRefreshes: "pullRequests.subscribeRefreshes",
  pullRequestsReviewerCandidates: "pullRequests.reviewerCandidates",
  pullRequestsRequestReviewers: "pullRequests.requestReviewers",
  pullRequestsLabelCandidates: "pullRequests.labelCandidates",
  pullRequestsSetLabels: "pullRequests.setLabels",

  sourceControlLookupRepository: "sourceControl.lookupRepository",
  sourceControlCloneRepository: "sourceControl.cloneRepository",
  sourceControlPublishRepository: "sourceControl.publishRepository",
  projectCloneStart: "projectClone.start",
  projectCloneCancel: "projectClone.cancel",
  projectCloneRetry: "projectClone.retry",
  subscribeProjectClones: "subscribeProjectClones",

  subscribeVcsStatus: "subscribeVcsStatus",
  subscribeWorktreeSetup: "subscribeWorktreeSetup",
  worktreeSetupCancel: "worktreeSetup.cancel",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeTerminalMetadata: "subscribeTerminalMetadata",
  subscribePreviewEvents: "subscribePreviewEvents",
  subscribeDiscoveredLocalServers: "subscribeDiscoveredLocalServers",
  subscribeDeviceState: "subscribeDeviceState",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeAuthAccess: "subscribeAuthAccess",
  subscribeBackgroundPolicy: "subscribeBackgroundPolicy",
  subscribeResourceTelemetry: "subscribeResourceTelemetry",
  subscribeHardware: "subscribeHardware",
} as const;

const WsServerUpsertKeybindingRpc = defineWsRpc(WS_METHODS.serverUpsertKeybinding, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: Schema.Union([KeybindingsConfigError, EnvironmentAuthorizationError]),
});

const WsServerRemoveKeybindingRpc = defineWsRpc(WS_METHODS.serverRemoveKeybinding, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: ServerRemoveKeybindingInput,
  success: ServerRemoveKeybindingResult,
  error: Schema.Union([KeybindingsConfigError, EnvironmentAuthorizationError]),
});

const WsServerProbeRpc = defineWsRpc(WS_METHODS.serverProbe, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
  error: EnvironmentAuthorizationError,
});

const WsServerGetConfigRpc = defineWsRpc(WS_METHODS.serverGetConfig, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerRefreshProvidersRpc = defineWsRpc(WS_METHODS.serverRefreshProviders, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({
    instanceId: Schema.optional(ProviderInstanceId),
    cwd: Schema.optional(TrimmedNonEmptyString),
    fresh: Schema.optional(Schema.Boolean),
    /** Explicit user request: bypass T3-owned caches and rediscover models.
     * Background status refreshes must not open agent sessions. */
    refreshModels: Schema.optional(Schema.Boolean),
  }),
  success: ServerProviderUpdatedPayload,
  error: Schema.Union([EnvironmentAuthorizationError, ProviderSetupError]),
});

const WsServerUpdateProviderRpc = defineWsRpc(WS_METHODS.serverUpdateProvider, {
  scope: AuthProvidersManageScope,
  category: "server",
  payload: ServerProviderUpdateInput,
  success: ServerProviderUpdatedPayload,
  error: Schema.Union([ServerProviderUpdateError, EnvironmentAuthorizationError]),
});

const ProviderSetupRpcError = Schema.Union([ProviderSetupError, EnvironmentAuthorizationError]);

const WsProviderConsumeResetCreditRpc = defineWsRpc(WS_METHODS.providerConsumeResetCredit, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderConsumeResetCreditInput,
  success: ProviderConsumeResetCreditResult,
  error: Schema.Union([ProviderSetupError, UsageLimitSourceError, EnvironmentAuthorizationError]),
});

const WsProviderAuthStartRpc = defineWsRpc(WS_METHODS.providerAuthStart, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderAuthStartInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthRespondRpc = defineWsRpc(WS_METHODS.providerAuthRespond, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderAuthRespondInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthCompleteRpc = defineWsRpc(WS_METHODS.providerAuthComplete, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderAuthCompleteInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsChatGptReconnectProfileRpc = defineWsRpc(WS_METHODS.chatGptReconnectProfile, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ChatGptReconnectProfileInput,
  success: Schema.NullOr(ChatGptReconnectProfile),
  error: ProviderSetupRpcError,
});
const WsChatGptImportProfileRpc = defineWsRpc(WS_METHODS.chatGptImportProfile, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ChatGptImportProfileInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});
const WsChatGptHandoffSubscribeRpc = defineWsRpc(WS_METHODS.chatGptHandoffSubscribe, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ChatGptHandoffInput,
  success: ChatGptHandoffState,
  error: ProviderSetupRpcError,
  stream: true,
});
const WsCodexAuthCallbackSubscribeRpc = defineWsRpc(WS_METHODS.codexAuthCallbackSubscribe, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: CodexAuthCallbackInput,
  success: CodexAuthCallbackState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderAuthCancelRpc = defineWsRpc(WS_METHODS.providerAuthCancel, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderAuthCancelInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthLogoutRpc = defineWsRpc(WS_METHODS.providerAuthLogout, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderSetupInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
});

const WsProviderAuthSubscribeRpc = defineWsRpc(WS_METHODS.providerAuthSubscribe, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderSetupInput,
  success: ProviderAuthState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderInstallStartRpc = defineWsRpc(WS_METHODS.providerInstallStart, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

const WsProviderInstallCancelRpc = defineWsRpc(WS_METHODS.providerInstallCancel, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderInstallCancelInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

const WsProviderInstallSubscribeRpc = defineWsRpc(WS_METHODS.providerInstallSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "provider",
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
  stream: true,
});

const WsProviderInstallRemoveRpc = defineWsRpc(WS_METHODS.providerInstallRemove, {
  scope: AuthProvidersManageScope,
  category: "provider",
  payload: ProviderSetupInput,
  success: ProviderInstallState,
  error: ProviderSetupRpcError,
});

const WsServerUpdateServerRpc = defineWsRpc(WS_METHODS.serverUpdateServer, {
  scope: AuthEnvironmentMaintainScope,
  category: "server",
  payload: ServerSelfUpdateInput,
  success: ServerSelfUpdateResult,
  error: Schema.Union([ServerSelfUpdateError, EnvironmentAuthorizationError]),
});

const WsServerUpdateServerWithProgressRpc = defineWsRpc(WS_METHODS.serverUpdateServerWithProgress, {
  scope: AuthEnvironmentMaintainScope,
  category: "server",
  payload: ServerSelfUpdateInput,
  success: ServerSelfUpdateProgressEvent,
  error: Schema.Union([ServerSelfUpdateError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsServerCommitDesktopUpdateRpc = defineWsRpc(WS_METHODS.serverCommitDesktopUpdate, {
  scope: AuthEnvironmentMaintainScope,
  category: "server",
  payload: DesktopUpdateCommitInput,
  success: ServerSelfUpdateResult,
  error: Schema.Union([ServerSelfUpdateError, EnvironmentAuthorizationError]),
});

const WsServerRunStorageCleanupRpc = defineWsRpc(WS_METHODS.serverRunStorageCleanup, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: Schema.Struct({}),
  success: StorageCleanupReport,
  error: Schema.Union([ServerSettingsError, EnvironmentAuthorizationError]),
});
const WsServerGetStorageCleanupReportRpc = defineWsRpc(WS_METHODS.serverGetStorageCleanupReport, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: Schema.NullOr(StorageCleanupReport),
  stream: true,
  error: EnvironmentAuthorizationError,
});

const WsServerGetDatabaseStorageRpc = defineWsRpc(WS_METHODS.serverGetDatabaseStorage, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: Schema.NullOr(DatabaseStorageStatus),
  stream: true,
  error: EnvironmentAuthorizationError,
});

const WsServerGetSettingsRpc = defineWsRpc(WS_METHODS.serverGetSettings, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerTestApiKeyRpc = defineWsRpc(WS_METHODS.serverTestApiKey, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: TestApiKeyInput,
  success: TestApiKeyResult,
  error: EnvironmentAuthorizationError,
});

const WsServerUpdateSettingsRpc = defineWsRpc(WS_METHODS.serverUpdateSettings, {
  scope: AuthSettingsWriteScope,
  category: "server",
  scopesFor: settingsUpdateScopes,
  payload: Schema.Struct({
    patch: ServerSettingsPatch,
    providerInstanceMutation: Schema.optionalKey(ProviderInstanceMutation),
  }),
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, EnvironmentAuthorizationError]),
});

const WsServerDiscoverSourceControlRpc = defineWsRpc(WS_METHODS.serverDiscoverSourceControl, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: SourceControlDiscoveryResult,
  error: EnvironmentAuthorizationError,
});

const WsServerSearchAcpRegistryRpc = defineWsRpc(WS_METHODS.serverSearchAcpRegistry, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: AcpRegistrySearchInput,
  success: AcpRegistrySearchResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerPrepareAcpRegistryAgentRpc = defineWsRpc(WS_METHODS.serverPrepareAcpRegistryAgent, {
  scope: AuthProvidersManageScope,
  category: "server",
  payload: AcpRegistryPrepareInput,
  success: AcpRegistryPrepareResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerUninstallAcpRegistryManagedBinaryRpc = defineWsRpc(
  WS_METHODS.serverUninstallAcpRegistryManagedBinary,
  {
    scope: AuthProvidersManageScope,
    category: "server",
    payload: AcpRegistryManagedBinaryUninstallInput,
    success: AcpRegistryManagedBinaryUninstallResult,
    error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
  },
);

const WsServerAcceptAcpRegistryUrlAuthRpc = defineWsRpc(WS_METHODS.serverAcceptAcpRegistryUrlAuth, {
  scope: AuthProvidersManageScope,
  category: "server",
  payload: AcpRegistryAcceptUrlAuthInput,
  success: AcpRegistryAcceptUrlAuthResult,
  error: EnvironmentAuthorizationError,
});

const WsServerListAcpRegistrySessionsRpc = defineWsRpc(WS_METHODS.serverListAcpRegistrySessions, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: AcpRegistryListSessionsInput,
  success: AcpRegistryListSessionsResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerImportAcpRegistrySessionRpc = defineWsRpc(WS_METHODS.serverImportAcpRegistrySession, {
  scope: AuthOrchestrationOperateScope,
  category: "server",
  payload: AcpRegistryImportSessionInput,
  success: AcpRegistryImportSessionResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerDeleteAcpRegistrySessionRpc = defineWsRpc(WS_METHODS.serverDeleteAcpRegistrySession, {
  scope: AuthOrchestrationOperateScope,
  category: "server",
  payload: AcpRegistryDeleteSessionInput,
  success: AcpRegistryDeleteSessionResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerListAcpRegistryProvidersRpc = defineWsRpc(WS_METHODS.serverListAcpRegistryProviders, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: AcpRegistryListProvidersInput,
  success: AcpRegistryListProvidersResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerSetAcpRegistryProviderRpc = defineWsRpc(WS_METHODS.serverSetAcpRegistryProvider, {
  scope: AuthProvidersManageScope,
  category: "server",
  payload: AcpRegistrySetProviderInput,
  success: AcpRegistrySetProviderResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerDisableAcpRegistryProviderRpc = defineWsRpc(
  WS_METHODS.serverDisableAcpRegistryProvider,
  {
    scope: AuthProvidersManageScope,
    category: "server",
    payload: AcpRegistryDisableProviderInput,
    success: AcpRegistryDisableProviderResult,
    error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
  },
);

const WsServerLogoutAcpRegistryRpc = defineWsRpc(WS_METHODS.serverLogoutAcpRegistry, {
  scope: AuthProvidersManageScope,
  category: "server",
  payload: AcpRegistryLogoutInput,
  success: AcpRegistryLogoutResult,
  error: Schema.Union([AcpRegistryOperationError, EnvironmentAuthorizationError]),
});

const WsServerGetTraceDiagnosticsRpc = defineWsRpc(WS_METHODS.serverGetTraceDiagnostics, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ServerTraceDiagnosticsResult,
  error: EnvironmentAuthorizationError,
});

const WsServerGetProcessDiagnosticsRpc = defineWsRpc(WS_METHODS.serverGetProcessDiagnostics, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ServerProcessDiagnosticsResult,
  error: EnvironmentAuthorizationError,
});

const WsServerGetHostResourcesRpc = defineWsRpc(WS_METHODS.serverGetHostResources, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: HostResourcesSnapshot,
  error: EnvironmentAuthorizationError,
});

const WsServerGetProcessResourceHistoryRpc = defineWsRpc(
  WS_METHODS.serverGetProcessResourceHistory,
  {
    scope: AuthDiagnosticsReadScope,
    category: "server",
    payload: ServerProcessResourceHistoryInput,
    success: ServerProcessResourceHistoryResult,
    error: EnvironmentAuthorizationError,
  },
);

const WsServerGetResourceTelemetryHistoryRpc = defineWsRpc(
  WS_METHODS.serverGetResourceTelemetryHistory,
  {
    scope: AuthDiagnosticsReadScope,
    category: "server",
    payload: ResourceTelemetryHistoryInput,
    success: ResourceTelemetryHistory,
    error: EnvironmentAuthorizationError,
  },
);

const WsServerRetryResourceTelemetryRpc = defineWsRpc(WS_METHODS.serverRetryResourceTelemetry, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  scopesFor: resourceTelemetryRetryScopes,
  payload: Schema.Struct({}),
  success: ResourceTelemetryRetryResult,
  error: EnvironmentAuthorizationError,
});

const WsServerCheckOtlpEndpointRpc = defineWsRpc(WS_METHODS.serverCheckOtlpEndpoint, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: OtlpEndpointCheckInput,
  success: OtlpEndpointCheckResult,
  error: EnvironmentAuthorizationError,
});

const WsServerGetChatQuotaRpc = defineWsRpc(WS_METHODS.serverGetChatQuota, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: ChatQuotaInput,
  success: ChatQuota,
  error: EnvironmentAuthorizationError,
});

const WsServerGetChatQuotaReportRpc = defineWsRpc(WS_METHODS.serverGetChatQuotaReport, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: ChatQuotaReportInput,
  success: ChatQuotaReport,
  error: EnvironmentAuthorizationError,
});

const WsServerGetUsageSummaryRpc = defineWsRpc(WS_METHODS.serverGetUsageSummary, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: UsageSummaryInput,
  success: UsageSummary,
  error: Schema.Union([EnvironmentAuthorizationError, UsageReadError]),
});

/**
 * Refetches the model rate table ahead of its daily TTL, so a model released
 * since the last fetch gets priced. The next usage summary uses the new table.
 */
/**
 * Public benchmark results for the models the client can run. The server
 * fetches and caches them, so remote clients never call the publisher.
 */
const WsServerGetModelBenchmarksRpc = defineWsRpc(WS_METHODS.serverGetModelBenchmarks, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: ModelBenchmarkReportInput,
  success: ModelBenchmarkReport,
  error: EnvironmentAuthorizationError,
});

const WsServerGetModelRunStatsRpc = defineWsRpc(WS_METHODS.serverGetModelRunStats, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ModelRunStats,
  error: EnvironmentAuthorizationError,
});

const WsServerGetModelBenchmarkCatalogRpc = defineWsRpc(WS_METHODS.serverGetModelBenchmarkCatalog, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ModelBenchmarkCatalog,
  error: EnvironmentAuthorizationError,
});

const WsServerRefreshUsageRatesRpc = defineWsRpc(WS_METHODS.serverRefreshUsageRates, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: UsagePricing,
  error: EnvironmentAuthorizationError,
});

const WsServerSignalProcessRpc = defineWsRpc(WS_METHODS.serverSignalProcess, {
  scope: AuthEnvironmentMaintainScope,
  category: "server",
  payload: ServerSignalProcessInput,
  success: ServerSignalProcessResult,
  error: EnvironmentAuthorizationError,
});

const WsCloudGetRelayClientStatusRpc = defineWsRpc(WS_METHODS.cloudGetRelayClientStatus, {
  scope: AuthRelayReadScope,
  category: "cloud",
  payload: Schema.Struct({}),
  success: RelayClientStatusSchema,
  error: EnvironmentAuthorizationError,
});

const WsCloudInstallRelayClientRpc = defineWsRpc(WS_METHODS.cloudInstallRelayClient, {
  scope: AuthRelayWriteScope,
  category: "cloud",
  payload: Schema.Struct({}),
  success: RelayClientInstallProgressEventSchema,
  error: Schema.Union([RelayClientInstallFailedError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsServerReportClientActivityRpc = defineWsRpc(WS_METHODS.serverReportClientActivity, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: ClientActivityReportInput,
  error: EnvironmentAuthorizationError,
});

const WsServerReportHostPowerStateRpc = defineWsRpc(WS_METHODS.serverReportHostPowerState, {
  scope: AuthEnvironmentMaintainScope,
  category: "server",
  payload: HostPowerSnapshot,
  error: EnvironmentAuthorizationError,
});

const WsServerGetBackgroundPolicyRpc = defineWsRpc(WS_METHODS.serverGetBackgroundPolicy, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: BackgroundPolicySnapshot,
  error: EnvironmentAuthorizationError,
});

const PullRequestRpcError = Schema.Union([
  PullRequestUnavailableError,
  PullRequestOperationError,
  EnvironmentAuthorizationError,
]);

const WsPullRequestsListRpc = defineWsRpc(WS_METHODS.pullRequestsList, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestListInput,
  success: PullRequestListResult,
  error: PullRequestRpcError,
});

/**
 * The line counts for rows already on the page. Its own call because on GitHub the pair costs
 * 40-60% of the listing read that answers everything else on the row, so the rows arrive first
 * and their stats a moment later.
 */
const WsPullRequestsListStatsRpc = defineWsRpc(WS_METHODS.pullRequestsListStats, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestListStatsInput,
  success: PullRequestListStatsResult,
  error: PullRequestRpcError,
});

const WsPullRequestsRoutingRpc = defineWsRpc(WS_METHODS.pullRequestsRouting, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestRoutingResult,
  error: PullRequestRpcError,
});

const WsPullRequestsRoutingIdentityRpc = defineWsRpc(WS_METHODS.pullRequestsRoutingIdentity, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRoutingIdentityInput,
  success: PullRequestRoutingIdentityResult,
  error: PullRequestRpcError,
});

const WsPullRequestsSummaryRpc = defineWsRpc(WS_METHODS.pullRequestsSummary, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestSummary,
  error: PullRequestRpcError,
});

const WsPullRequestsStackRpc = defineWsRpc(WS_METHODS.pullRequestsStack, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: Schema.NullOr(PullRequestStack),
  error: PullRequestRpcError,
});

const WsPullRequestsLinkedThreadsRpc = defineWsRpc(WS_METHODS.pullRequestsLinkedThreads, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestLinkedThreadsResult,
  error: PullRequestRpcError,
});

const WsPullRequestsDetailRpc = defineWsRpc(WS_METHODS.pullRequestsDetail, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestDetail,
  error: PullRequestRpcError,
});

const WsPullRequestsPreviewRpc = defineWsRpc(WS_METHODS.pullRequestsPreview, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestPreview,
  error: PullRequestRpcError,
});

const WsPullRequestsChecksRpc = defineWsRpc(WS_METHODS.pullRequestsChecks, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: Schema.NullOr(PullRequestChecks),
  error: PullRequestRpcError,
});

const WsPullRequestsActivityRpc = defineWsRpc(WS_METHODS.pullRequestsActivity, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestActivity,
  error: PullRequestRpcError,
});

const WsPullRequestsReviewGuideRpc = defineWsRpc(WS_METHODS.pullRequestsReviewGuide, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestReviewGuideResult,
  error: PullRequestRpcError,
});

const WsPullRequestsGenerateReviewGuideRpc = defineWsRpc(
  WS_METHODS.pullRequestsGenerateReviewGuide,
  {
    scope: AuthOrchestrationOperateScope,
    category: "pull-requests",
    payload: PullRequestRef,
    success: PullRequestReviewGuideResult,
    error: PullRequestRpcError,
  },
);

const WsPullRequestsThreadCommentsRpc = defineWsRpc(WS_METHODS.pullRequestsThreadComments, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestThreadCommentsInput,
  success: PullRequestThreadCommentsResult,
  error: PullRequestRpcError,
});

const WsPullRequestsDiffFileContentsRpc = defineWsRpc(WS_METHODS.pullRequestsDiffFileContents, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestDiffFileContentsInput,
  success: PullRequestDiffFileContentsResult,
  error: PullRequestRpcError,
});

const WsPullRequestsFilesViewedRpc = defineWsRpc(WS_METHODS.pullRequestsFilesViewed, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestFilesViewedResult,
  error: PullRequestRpcError,
});

const WsPullRequestsChangeBreakdownRpc = defineWsRpc(WS_METHODS.pullRequestsChangeBreakdown, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestChangeBreakdown,
  error: PullRequestRpcError,
});

const WsPullRequestsSetFilesViewedRpc = defineWsRpc(WS_METHODS.pullRequestsSetFilesViewed, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestSetFilesViewedInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsRunActionRpc = defineWsRpc(WS_METHODS.pullRequestsRunAction, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestActionInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsUpdateRpc = defineWsRpc(WS_METHODS.pullRequestsUpdate, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestUpdateInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsCommentRpc = defineWsRpc(WS_METHODS.pullRequestsComment, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestCommentInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsUpdateCommentRpc = defineWsRpc(WS_METHODS.pullRequestsUpdateComment, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestCommentUpdateInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsSubmitReviewRpc = defineWsRpc(WS_METHODS.pullRequestsSubmitReview, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestSubmitReviewInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsReplyToThreadRpc = defineWsRpc(WS_METHODS.pullRequestsReplyToThread, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestThreadReplyInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsSetThreadResolutionRpc = defineWsRpc(
  WS_METHODS.pullRequestsSetThreadResolution,
  {
    scope: AuthSourceControlWriteScope,
    category: "pull-requests",
    payload: PullRequestThreadResolutionInput,
    success: Schema.Void,
    error: PullRequestRpcError,
  },
);

const WsPullRequestsSetReactionRpc = defineWsRpc(WS_METHODS.pullRequestsSetReaction, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestReactionInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsInvalidateRpc = defineWsRpc(WS_METHODS.pullRequestsInvalidate, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestInvalidateInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsReportStateRpc = defineWsRpc(WS_METHODS.pullRequestsReportState, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestReportStateInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsSubscribeRefreshesRpc = defineWsRpc(WS_METHODS.pullRequestsSubscribeRefreshes, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: Schema.Struct({}),
  success: NonNegativeInt,
  error: EnvironmentAuthorizationError,
  stream: true,
});

/**
 * Read on its own rather than as part of the detail: the people who may be asked are only wanted
 * once somebody opens the menu, and reading them with every change request would spend a request
 * per host on a list nobody looked at.
 */
const WsPullRequestsReviewerCandidatesRpc = defineWsRpc(WS_METHODS.pullRequestsReviewerCandidates, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestReviewerCandidateList,
  error: PullRequestRpcError,
});

const WsPullRequestsRequestReviewersRpc = defineWsRpc(WS_METHODS.pullRequestsRequestReviewers, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestReviewerRequestInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsPullRequestsLabelCandidatesRpc = defineWsRpc(WS_METHODS.pullRequestsLabelCandidates, {
  scope: AuthOrchestrationReadScope,
  category: "pull-requests",
  payload: PullRequestRef,
  success: PullRequestLabelCandidateList,
  error: PullRequestRpcError,
});

const WsPullRequestsSetLabelsRpc = defineWsRpc(WS_METHODS.pullRequestsSetLabels, {
  scope: AuthSourceControlWriteScope,
  category: "pull-requests",
  payload: PullRequestLabelChangeInput,
  success: Schema.Void,
  error: PullRequestRpcError,
});

const WsSourceControlLookupRepositoryRpc = defineWsRpc(WS_METHODS.sourceControlLookupRepository, {
  scope: AuthOrchestrationReadScope,
  category: "source-control",
  payload: SourceControlRepositoryLookupInput,
  success: SourceControlRepositoryInfo,
  error: Schema.Union([SourceControlRepositoryError, EnvironmentAuthorizationError]),
});

const WsSourceControlCloneRepositoryRpc = defineWsRpc(WS_METHODS.sourceControlCloneRepository, {
  scope: AuthSourceControlWriteScope,
  category: "source-control",
  payload: SourceControlCloneRepositoryInput,
  success: SourceControlCloneRepositoryResult,
  error: Schema.Union([SourceControlRepositoryError, EnvironmentAuthorizationError]),
});

// Clone-backed project creation. `start` returns once the project exists and
// the clone is running; progress arrives on the subscription.
const WsProjectCloneStartRpc = defineWsRpc(WS_METHODS.projectCloneStart, {
  scope: AuthSourceControlWriteScope,
  category: "source-control",
  payload: ProjectCloneStartInput,
  success: ProjectCloneStartResult,
  error: Schema.Union([
    SourceControlRepositoryError,
    OrchestrationDispatchCommandError,
    EnvironmentAuthorizationError,
  ]),
});

const WsProjectCloneCancelRpc = defineWsRpc(WS_METHODS.projectCloneCancel, {
  scope: AuthSourceControlWriteScope,
  category: "source-control",
  payload: ProjectCloneActionInput,
  success: ProjectCloneActionResult,
  error: EnvironmentAuthorizationError,
});

const WsProjectCloneRetryRpc = defineWsRpc(WS_METHODS.projectCloneRetry, {
  scope: AuthSourceControlWriteScope,
  category: "source-control",
  payload: ProjectCloneActionInput,
  success: ProjectCloneActionResult,
  error: Schema.Union([SourceControlRepositoryError, EnvironmentAuthorizationError]),
});

const WsSubscribeProjectClonesRpc = defineWsRpc(WS_METHODS.subscribeProjectClones, {
  scope: AuthOrchestrationReadScope,
  category: "source-control",
  payload: ProjectCloneSubscribeInput,
  success: ProjectCloneListEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsSourceControlPublishRepositoryRpc = defineWsRpc(WS_METHODS.sourceControlPublishRepository, {
  scope: AuthSourceControlWriteScope,
  category: "source-control",
  payload: SourceControlPublishRepositoryInput,
  success: SourceControlPublishRepositoryResult,
  error: Schema.Union([SourceControlRepositoryError, EnvironmentAuthorizationError]),
});

const WsProjectsSearchEntriesRpc = defineWsRpc(WS_METHODS.projectsSearchEntries, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: Schema.Union([ProjectSearchEntriesError, EnvironmentAuthorizationError]),
});

const WsReplyStylesListRpc = defineWsRpc(WS_METHODS.replyStylesList, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ReplyStylesListInput,
  success: ReplyStylesListResult,
  error: EnvironmentAuthorizationError,
});

const WsProjectsSearchContentsRpc = defineWsRpc(WS_METHODS.projectsSearchContents, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ProjectSearchContentsInput,
  success: ProjectSearchContentsResult,
  error: Schema.Union([ProjectSearchContentsError, EnvironmentAuthorizationError]),
});

const WsProjectsListEntriesRpc = defineWsRpc(WS_METHODS.projectsListEntries, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ProjectListEntriesInput,
  success: ProjectListEntriesResult,
  error: Schema.Union([ProjectListEntriesError, EnvironmentAuthorizationError]),
});

const WsTaskBoardListRpc = defineWsRpc(WS_METHODS.taskBoardList, {
  scope: AuthOrchestrationReadScope,
  category: "source-control",
  payload: TaskBoardListInput,
  success: TaskBoardSnapshot,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsTaskBoardCreateRpc = defineWsRpc(WS_METHODS.taskBoardCreate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardCreateInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardClaimRpc = defineWsRpc(WS_METHODS.taskBoardClaim, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardClaimInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardReleaseRpc = defineWsRpc(WS_METHODS.taskBoardRelease, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardReleaseInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardCompleteRpc = defineWsRpc(WS_METHODS.taskBoardComplete, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardCompleteInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardSubscribeCompletionsRpc = defineWsRpc(WS_METHODS.taskBoardSubscribeCompletions, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: TaskBoardCompletions,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsSubagentsSubscribeSpawnApprovalsRpc = defineWsRpc(
  WS_METHODS.subagentsSubscribeSpawnApprovals,
  {
    scope: AuthOrchestrationReadScope,
    category: "workspace",
    payload: Schema.Struct({}),
    success: SubagentSpawnApprovals,
    error: EnvironmentAuthorizationError,
    stream: true,
  },
);

const WsSubagentsRespondSpawnApprovalRpc = defineWsRpc(WS_METHODS.subagentsRespondSpawnApproval, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentSpawnRespondInput,
  success: Schema.Struct({}),
  error: Schema.Union([SubagentSpawnApprovalError, EnvironmentAuthorizationError]),
});

const WsSubagentsListRpc = defineWsRpc(WS_METHODS.subagentsList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosWorkspaceScopeInput,
  success: SubagentCatalog,
  error: EnvironmentAuthorizationError,
});

const WsSubagentsUpdateRpc = defineWsRpc(WS_METHODS.subagentsUpdate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentUpdateInput,
  success: SubagentCatalogEntry,
  error: Schema.Union([SubagentEditError, EnvironmentAuthorizationError]),
});

const WsSubagentsCreateRpc = defineWsRpc(WS_METHODS.subagentsCreate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentCreateInput,
  success: SubagentCatalogEntry,
  error: Schema.Union([SubagentEditError, EnvironmentAuthorizationError]),
});

const WsSubagentsDeleteRpc = defineWsRpc(WS_METHODS.subagentsDelete, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentDeleteInput,
  success: SubagentDeleteResult,
  error: Schema.Union([SubagentEditError, EnvironmentAuthorizationError]),
});

const WsSubagentsDuplicateRpc = defineWsRpc(WS_METHODS.subagentsDuplicate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentDuplicateInput,
  success: SubagentCatalogEntry,
  error: Schema.Union([SubagentEditError, EnvironmentAuthorizationError]),
});

const WsSubagentsDraftRpc = defineWsRpc(WS_METHODS.subagentsDraft, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: SubagentDraftInput,
  success: SubagentDraftResult,
  error: Schema.Union([SubagentEditError, EnvironmentAuthorizationError]),
});

const WsTaskBoardUpdateRpc = defineWsRpc(WS_METHODS.taskBoardUpdate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardUpdateInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardWorkspaceRpc = defineWsRpc(WS_METHODS.taskBoardWorkspace, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TaskBoardWorkspaceInput,
  success: TaskBoardWorkspaceSnapshot,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsDevPreviewStatusRpc = defineWsRpc(WS_METHODS.devPreviewStatus, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: DevPreviewInput,
  success: DevPreviewState,
  error: Schema.Union([DevPreviewError, EnvironmentAuthorizationError]),
});

const WsDevPreviewStartRpc = defineWsRpc(WS_METHODS.devPreviewStart, {
  scope: AuthTerminalOperateScope,
  category: "workspace",
  payload: DevPreviewInput,
  success: DevPreviewState,
  error: Schema.Union([DevPreviewError, EnvironmentAuthorizationError]),
});

const WsDevPreviewStopRpc = defineWsRpc(WS_METHODS.devPreviewStop, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: DevPreviewInput,
  success: DevPreviewState,
  error: Schema.Union([DevPreviewError, EnvironmentAuthorizationError]),
});

const ImagesRpcError = Schema.Union([ImagesError, EnvironmentAuthorizationError]);

/** The Images panel state: source status, models and the queue with its finished images. */
const WsImagesSubscribeRpc = defineWsRpc(WS_METHODS.imagesSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: ImagesSubscribeInput,
  success: ImagesState,
  error: ImagesRpcError,
  stream: true,
});

const WsImagesGenerateRpc = defineWsRpc(WS_METHODS.imagesGenerate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ImagesGenerateInput,
  success: ImagesGenerateResult,
  error: ImagesRpcError,
});

const WsImagesCancelRpc = defineWsRpc(WS_METHODS.imagesCancel, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ImagesCancelInput,
  success: Schema.Struct({ cancelled: Schema.Number }),
  error: ImagesRpcError,
});

const WsImagesKeepRpc = defineWsRpc(WS_METHODS.imagesKeep, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ImagesKeepInput,
  success: Schema.Struct({ kept: Schema.Boolean }),
  error: ImagesRpcError,
});

const WsImagesRetryRpc = defineWsRpc(WS_METHODS.imagesRetry, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ImagesRetryInput,
  success: Schema.Struct({ queued: Schema.Number }),
  error: ImagesRpcError,
});

const WsImagesSetBaseUrlRpc = defineWsRpc(WS_METHODS.imagesSetBaseUrl, {
  scope: AuthSettingsWriteScope,
  category: "workspace",
  payload: ImagesSetBaseUrlInput,
  success: Schema.Struct({ baseUrl: Schema.String }),
  error: ImagesRpcError,
});

const LocalModelsRpcError = Schema.Union([LocalModelsError, EnvironmentAuthorizationError]);

/** The Models tab state: Ollama status, this PC's capacity and one row per model. */
const WsLocalModelsSubscribeRpc = defineWsRpc(WS_METHODS.localModelsSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: LocalModelsState,
  error: LocalModelsRpcError,
  stream: true,
});

const WsLocalModelsPullRpc = defineWsRpc(WS_METHODS.localModelsPull, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsPullInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsCancelPullRpc = defineWsRpc(WS_METHODS.localModelsCancelPull, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsModelInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsRunRpc = defineWsRpc(WS_METHODS.localModelsRun, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsModelInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsStopRpc = defineWsRpc(WS_METHODS.localModelsStop, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsModelInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsSpeedTestRpc = defineWsRpc(WS_METHODS.localModelsSpeedTest, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsModelInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsStartOllamaRpc = defineWsRpc(WS_METHODS.localModelsStartOllama, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsStartInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsAdviceRpc = defineWsRpc(WS_METHODS.localModelsAdvice, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: LocalModelsStartInput,
  success: LocalModelsAdvice,
  error: LocalModelsRpcError,
});

const WsLocalModelsCompareRpc = defineWsRpc(WS_METHODS.localModelsCompare, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsCompareInput,
  success: LocalModelsCompareResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsComparePickRpc = defineWsRpc(WS_METHODS.localModelsComparePick, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsPickInput,
  success: LocalModelsPickResult,
  error: LocalModelsRpcError,
});

const WsLocalModelsTokenReportRpc = defineWsRpc(WS_METHODS.localModelsTokenReport, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsTokenReportInput,
  success: LocalModelsTokenReport,
  error: LocalModelsRpcError,
});

const WsLocalModelsDeleteRpc = defineWsRpc(WS_METHODS.localModelsDelete, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LocalModelsModelInput,
  success: LocalModelsActionResult,
  error: LocalModelsRpcError,
});

/** Lists the files the app keeps for chats: attachments, uploads and rendered pages. */
const WsFilesListRpc = defineWsRpc(WS_METHODS.filesList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: FilesListInput,
  success: FilesListResult,
  error: Schema.Union([FilesError, EnvironmentAuthorizationError]),
});

/** Deletes one stored file. A file that a chat still shows stays. */
const WsFilesDeleteRpc = defineWsRpc(WS_METHODS.filesDelete, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: FilesDeleteInput,
  success: FilesDeleteResult,
  error: Schema.Union([FilesError, EnvironmentAuthorizationError]),
});

/** Every subagent run: live ones and history, from the stored run events. */
const WsSubagentRunsListRpc = defineWsRpc(WS_METHODS.subagentRunsList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: SubagentRunsInput,
  success: SubagentRunsResult,
  error: Schema.Union([SubagentRunsError, EnvironmentAuthorizationError]),
});

const WsTaskBoardCardUpdateRpc = defineWsRpc(WS_METHODS.taskBoardCardUpdate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardCardUpdateInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardCapSetRpc = defineWsRpc(WS_METHODS.taskBoardCapSet, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardCapSetInput,
  success: Schema.Void,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosLimitsRpc = defineWsRpc(WS_METHODS.aiosLimits, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TaskBoardWorkspaceInput,
  success: Schema.Array(AiosLimit),
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosLimitSetRpc = defineWsRpc(WS_METHODS.aiosLimitSet, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AiosLimitSetInput,
  success: Schema.Void,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsVoiceLimitGetRpc = defineWsRpc(WS_METHODS.voiceLimitGet, {
  scope: AuthOrchestrationReadScope,
  category: "environment",
  payload: Schema.Struct({}),
  success: Schema.Number,
  error: Schema.Union([TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsVoiceLimitSetRpc = defineWsRpc(WS_METHODS.voiceLimitSet, {
  scope: AuthOrchestrationOperateScope,
  category: "environment",
  payload: Schema.Struct({ seconds: Schema.Number }),
  success: Schema.Void,
  error: Schema.Union([TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardApplyChangeSetRpc = defineWsRpc(WS_METHODS.taskBoardApplyChangeSet, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardChangeSetInput,
  success: TaskBoardChangeSetResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardCardCreateRpc = defineWsRpc(WS_METHODS.taskBoardCardCreate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardCardCreateInput,
  success: TaskBoardTask,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsInboxDropRpc = defineWsRpc(WS_METHODS.inboxDrop, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: InboxDropInput,
  success: InboxDrop,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsInboxUndoRpc = defineWsRpc(WS_METHODS.inboxUndo, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: InboxUndoInput,
  success: Schema.Struct({ removed: Schema.Boolean }),
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardAiosDetectRpc = defineWsRpc(WS_METHODS.taskBoardAiosDetect, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TaskBoardAiosDetectInput,
  success: TaskBoardAiosDetectResult,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsTaskBoardAiosConfirmRpc = defineWsRpc(WS_METHODS.taskBoardAiosConfirm, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardAiosConfirmInput,
  success: TaskBoardAiosDetectResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosWorkspacesListRpc = defineWsRpc(WS_METHODS.aiosWorkspacesList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: AiosWorkspacesListResult,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsWorkspacePackWidgetsRpc = defineWsRpc(WS_METHODS.workspacePackWidgets, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosWorkspaceScopeInput,
  success: WorkspacePackWidgetsResult,
  error: EnvironmentAuthorizationError,
});

const WsWorkspacePackOrgRpc = defineWsRpc(WS_METHODS.workspacePackOrg, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosWorkspaceScopeInput,
  success: WorkspaceOrgResult,
  error: EnvironmentAuthorizationError,
});

const WsWorkspacePackOrgChangeRpc = defineWsRpc(WS_METHODS.workspacePackOrgChange, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: WorkspaceOrgChangeInput,
  success: WorkspaceOrgActionResult,
  error: EnvironmentAuthorizationError,
});

const WsWorkspacePackOrgDecideRpc = defineWsRpc(WS_METHODS.workspacePackOrgDecide, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: WorkspaceOrgDecideInput,
  success: WorkspaceOrgActionResult,
  error: EnvironmentAuthorizationError,
});

const WsAiosWorkspacesInitRpc = defineWsRpc(WS_METHODS.aiosWorkspacesInit, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AiosWorkspaceInitInput,
  success: AiosWorkspaceSummary,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosProjectsScaffoldRpc = defineWsRpc(WS_METHODS.aiosProjectsScaffold, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AiosProjectScaffoldInput,
  success: AiosProjectScaffoldResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosWorkspaceHiddenProjectsSetRpc = defineWsRpc(WS_METHODS.aiosWorkspaceHiddenProjectsSet, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AiosWorkspaceHiddenProjectsInput,
  success: Schema.Void,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosWorkspacePicturesListRpc = defineWsRpc(WS_METHODS.aiosWorkspacePicturesList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: WorkspacePicturesListResult,
  error: Schema.Union([WorkspacePictureError, EnvironmentAuthorizationError]),
});

const WsAiosWorkspacePictureSetRpc = defineWsRpc(WS_METHODS.aiosWorkspacePictureSet, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: WorkspacePictureSetInput,
  success: Schema.Void,
  error: Schema.Union([WorkspacePictureError, EnvironmentAuthorizationError]),
});

const WsAiosWorkspacePictureRemoveRpc = defineWsRpc(WS_METHODS.aiosWorkspacePictureRemove, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: WorkspacePictureRemoveInput,
  success: Schema.Void,
  error: Schema.Union([WorkspacePictureError, EnvironmentAuthorizationError]),
});

const WsAreaSyncJoinRpc = defineWsRpc(WS_METHODS.areaSyncJoin, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AreaSyncScopeInput,
  success: AreaSyncJoinResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAreaSyncSyncRpc = defineWsRpc(WS_METHODS.areaSyncSync, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AreaSyncScopeInput,
  success: AreaSyncSyncResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAreaSyncStatusRpc = defineWsRpc(WS_METHODS.areaSyncStatus, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AreaSyncScopeInput,
  success: AreaSyncStatusResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsTaskBoardHomeRpc = defineWsRpc(WS_METHODS.taskBoardHome, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TaskBoardHomeInput,
  success: TaskBoardHome,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsTaskBoardHomePriorityToggleRpc = defineWsRpc(WS_METHODS.taskBoardHomePriorityToggle, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardHomePriorityToggleInput,
  success: TaskBoardHomePriorityToggleResult,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsAiosFolderListRpc = defineWsRpc(WS_METHODS.aiosFolderList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosFolderListInput,
  success: AiosFolderList,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsAiosUsageShapeRpc = defineWsRpc(WS_METHODS.aiosUsageShape, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosWorkspaceScopeInput,
  success: AiosUsageShape,
  error: EnvironmentAuthorizationError,
});

const WsAiosDirectionRpc = defineWsRpc(WS_METHODS.aiosDirection, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AiosWorkspaceScopeInput,
  success: AiosDirection,
  error: Schema.Union([TaskBoardReadError, EnvironmentAuthorizationError]),
});

const WsTaskBoardHomeWeatherRpc = defineWsRpc(WS_METHODS.taskBoardHomeWeather, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TaskBoardHomeWeatherInput,
  success: TaskBoardHomeWeather,
  error: EnvironmentAuthorizationError,
});

const WsTaskBoardHomeNewsRpc = defineWsRpc(WS_METHODS.taskBoardHomeNews, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: TaskBoardHomeNews,
  error: EnvironmentAuthorizationError,
});

const WsTradingImportsRpc = defineWsRpc(WS_METHODS.tradingImports, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingStateInput,
  success: TradingImportsResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingImportRpc = defineWsRpc(WS_METHODS.tradingImport, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingImportInput,
  success: TradingImportResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingPackConsentRpc = defineWsRpc(WS_METHODS.tradingPackConsent, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: TradingPackConsentInput,
  success: Schema.Void,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingStateRpc = defineWsRpc(WS_METHODS.tradingState, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingStateInput,
  success: TradingStateResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingAppendRpc = defineWsRpc(WS_METHODS.tradingAppend, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingAppendInput,
  success: TradingAppendResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingSettingsSaveRpc = defineWsRpc(WS_METHODS.tradingSettingsSave, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingSettingsSaveInput,
  success: TradingSettings,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingCrewRpc = defineWsRpc(WS_METHODS.tradingCrew, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingCrewInput,
  success: TradingCrewResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingCrewSyncRpc = defineWsRpc(WS_METHODS.tradingCrewSync, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingCrewInput,
  success: TradingCrewResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingTradeAddRpc = defineWsRpc(WS_METHODS.tradingTradeAdd, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingTradeAddInput,
  success: TradingTradeAddResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingDayReadRpc = defineWsRpc(WS_METHODS.tradingDayRead, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingDayReadInput,
  success: TradingDayReadResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingDaySaveRpc = defineWsRpc(WS_METHODS.tradingDaySave, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingDaySaveInput,
  success: Schema.Void,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingScreenshotSaveRpc = defineWsRpc(WS_METHODS.tradingScreenshotSave, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingScreenshotSaveInput,
  success: TradingScreenshotSaveResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingScreenshotReadRpc = defineWsRpc(WS_METHODS.tradingScreenshotRead, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingScreenshotReadInput,
  success: TradingScreenshotReadResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingRiskRulesRpc = defineWsRpc(WS_METHODS.tradingRiskRules, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingStateInput,
  success: TradingRiskRulesResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingLibraryIndexRpc = defineWsRpc(WS_METHODS.tradingLibraryIndex, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingLibraryInput,
  success: TradingLibraryIndexResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingLibraryPageRpc = defineWsRpc(WS_METHODS.tradingLibraryPage, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingLibraryPageInput,
  success: TradingLibraryPageResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingLibrarySearchRpc = defineWsRpc(WS_METHODS.tradingLibrarySearch, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingLibrarySearchInput,
  success: TradingLibrarySearchResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingResourceSaveRpc = defineWsRpc(WS_METHODS.tradingResourceSave, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TradingResourceSaveInput,
  success: TradingResourceSaveResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsTradingResourceListRpc = defineWsRpc(WS_METHODS.tradingResourceList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: TradingLibraryInput,
  success: TradingResourceListResult,
  error: Schema.Union([TradingStateError, EnvironmentAuthorizationError]),
});

const WsReleaseStatusRunsRpc = defineWsRpc(WS_METHODS.releaseStatusRuns, {
  scope: AuthReleaseReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: ReleaseStatus,
  error: EnvironmentAuthorizationError,
});

const WsGameModeStatusRpc = defineWsRpc(WS_METHODS.gameModeStatus, {
  scope: AuthGameModeControlScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: GameModeStatus,
  error: EnvironmentAuthorizationError,
});

const WsGameModeRunRpc = defineWsRpc(WS_METHODS.gameModeRun, {
  scope: AuthGameModeControlScope,
  category: "workspace",
  payload: GameModeActionInput,
  success: GameModeStatus,
  error: EnvironmentAuthorizationError,
});

const WsCalendarEventsRpc = defineWsRpc(WS_METHODS.calendarEvents, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: CalendarEventsInput,
  success: CalendarEventsResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarTestLinkRpc = defineWsRpc(WS_METHODS.calendarTestLink, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: CalendarLinkInput,
  success: CalendarActionResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarAddLinkRpc = defineWsRpc(WS_METHODS.calendarAddLink, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: CalendarAddLinkInput,
  success: CalendarActionResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarRemoveRpc = defineWsRpc(WS_METHODS.calendarRemove, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: CalendarRemoveInput,
  success: CalendarActionResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarGoogleSetClientRpc = defineWsRpc(WS_METHODS.calendarGoogleSetClient, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: CalendarGoogleClientInput,
  success: CalendarActionResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarGoogleConnectRpc = defineWsRpc(WS_METHODS.calendarGoogleConnect, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: Schema.Struct({}),
  success: CalendarGoogleConnectResult,
  error: EnvironmentAuthorizationError,
});

const WsCalendarGoogleSelectRpc = defineWsRpc(WS_METHODS.calendarGoogleSelect, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: CalendarGoogleSelectInput,
  success: CalendarActionResult,
  error: EnvironmentAuthorizationError,
});

const WsPonytailUsageRpc = defineWsRpc(WS_METHODS.ponytailUsage, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: PonytailUsage,
  error: EnvironmentAuthorizationError,
});

const WsPonytailCodexHooksRpc = defineWsRpc(WS_METHODS.ponytailCodexHooks, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: PonytailCodexHooksInput,
  success: PonytailCodexHooks,
  error: EnvironmentAuthorizationError,
});

const WsLayaUsageRpc = defineWsRpc(WS_METHODS.layaUsage, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: Schema.Struct({}),
  success: LayaUsage,
  error: EnvironmentAuthorizationError,
});

const WsTaskBoardShareRpc = defineWsRpc(WS_METHODS.taskBoardShare, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: TaskBoardShareInput,
  success: TaskBoardSnapshot,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

/** The event feed: recent months on subscribe, then new and folded events as files change. */
const WsEventsSubscribeRpc = defineWsRpc(WS_METHODS.eventsSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: EventsSubscribeInput,
  success: FeedUpdate,
  error: EnvironmentAuthorizationError,
  stream: true,
});

/** Appends one event that the app writes; the folder watch delivers it to subscribers. */
const WsEventsAppendRpc = defineWsRpc(WS_METHODS.eventsAppend, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: EventsAppendInput,
  success: Schema.Struct({ id: Schema.String }),
  error: Schema.Union([FeedEventError, EnvironmentAuthorizationError]),
});

/** Everything that runs by itself: app watchers plus the AIOS automation register. */
const WsAutomationsListRpc = defineWsRpc(WS_METHODS.automationsList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AutomationsListInput,
  success: AutomationsListResult,
  error: Schema.Union([AutomationError, EnvironmentAuthorizationError]),
});

/** Starts or stops one app automation. */
const WsAutomationsSetEnabledRpc = defineWsRpc(WS_METHODS.automationsSetEnabled, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AutomationsSetEnabledInput,
  success: AutomationEntry,
  error: Schema.Union([AutomationError, EnvironmentAuthorizationError]),
});

/** Changes when one app automation runs. */
const WsAutomationsSetScheduleRpc = defineWsRpc(WS_METHODS.automationsSetSchedule, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AutomationsSetScheduleInput,
  success: AutomationEntry,
  error: Schema.Union([AutomationError, EnvironmentAuthorizationError]),
});

/** Runs one app automation now. A dry run sends no event and writes no file. */
const WsAutomationsRunNowRpc = defineWsRpc(WS_METHODS.automationsRunNow, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AutomationsRunNowInput,
  success: AutomationsRunNowResult,
  error: Schema.Union([AutomationError, EnvironmentAuthorizationError]),
});

/** Reads the Marketing screens: the queue, the posts and the metrics of the open workspace. */
const WsMarketingListRpc = defineWsRpc(WS_METHODS.marketingList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: MarketingListInput,
  success: MarketingListResult,
  error: Schema.Union([MarketingRpcError, EnvironmentAuthorizationError]),
});

/** A person approves or rejects tickets. No agent access level holds the scope this needs. */
const WsMarketingDecideRpc = defineWsRpc(WS_METHODS.marketingDecide, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: MarketingDecideInput,
  success: MarketingDecideOutput,
  error: Schema.Union([MarketingRpcError, EnvironmentAuthorizationError]),
});

/** Reads the Content screen: every folder deal and its videos in the open workspace. */
const WsContentListRpc = defineWsRpc(WS_METHODS.contentList, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: ContentListInput,
  success: ContentListResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** The latest agent draft of one video, to show beside the script as it is now. */
const WsContentHistoryRpc = defineWsRpc(WS_METHODS.contentHistory, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: ContentHistoryInput,
  success: ContentHistoryResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person moves a video: approve, request changes, mark filmed or undo. No agent access level holds this scope. */
const WsContentMoveRpc = defineWsRpc(WS_METHODS.contentMove, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentMoveInput,
  success: ContentWriteResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person edits a script. No agent access level holds this scope. */
const WsContentSaveScriptRpc = defineWsRpc(WS_METHODS.contentSaveScript, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentSaveScriptInput,
  success: ContentWriteResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person starts a deal by hand. No agent access level holds this scope. */
const WsContentCreateDealRpc = defineWsRpc(WS_METHODS.contentCreateDeal, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentCreateDealInput,
  success: ContentDealWriteResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person confirms or dismisses a proposed deal. No agent access level holds this scope. */
const WsContentDecideDealRpc = defineWsRpc(WS_METHODS.contentDecideDeal, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentDecideDealInput,
  success: ContentDecideDealResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person shares the deal files with the other computer: save, pull, push. No agent access level holds this scope. */
const WsContentSyncRpc = defineWsRpc(WS_METHODS.contentSync, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentSyncInput,
  success: ContentSyncResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person makes a pairing code so another computer can verify approvals. No agent access level holds this scope. */
const WsContentPairingStartRpc = defineWsRpc(WS_METHODS.contentPairingStart, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentPairingStartInput,
  success: ContentPairingCode,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

/** A person enters a pairing code from another computer. No agent access level holds this scope. */
const WsContentPairingAcceptRpc = defineWsRpc(WS_METHODS.contentPairingAccept, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ContentPairingAcceptInput,
  success: ContentPairingAcceptResult,
  error: Schema.Union([ContentRpcError, EnvironmentAuthorizationError]),
});

const WsFocusSubscribeRpc = defineWsRpc(WS_METHODS.focusSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: FocusSubscribeInput,
  success: FocusSnapshot,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsFocusUpdateRpc = defineWsRpc(WS_METHODS.focusUpdate, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: FocusUpdateInput,
  success: FocusSnapshot,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const WsFocusAttachmentRpc = defineWsRpc(WS_METHODS.focusAttachment, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: FocusAttachmentInput,
  success: FocusAttachment,
  error: Schema.Union([TaskBoardReadError, TaskBoardOperationError, EnvironmentAuthorizationError]),
});

const HardwareRpcError = Schema.Union([HardwareWatchError, EnvironmentAuthorizationError]);

const WsHardwareGetInventoryRpc = defineWsRpc(WS_METHODS.hardwareGetInventory, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: HardwareInventoryInput,
  success: HardwareInventory,
  error: HardwareRpcError,
});

const WsHardwareGetHistoryRpc = defineWsRpc(WS_METHODS.hardwareGetHistory, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: HardwareHistoryInput,
  success: HardwareHistory,
  error: HardwareRpcError,
});

const WsHardwareGetLimitsRpc = defineWsRpc(WS_METHODS.hardwareGetLimits, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: HardwareLimitsResult,
  error: HardwareRpcError,
});

const WsHardwareSetLimitRpc = defineWsRpc(WS_METHODS.hardwareSetLimit, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: HardwareSetLimitInput,
  success: HardwareLimitsResult,
  error: HardwareRpcError,
});

const WsHardwareAcknowledgeAlertRpc = defineWsRpc(WS_METHODS.hardwareAcknowledgeAlert, {
  scope: AuthOrchestrationOperateScope,
  category: "server",
  payload: HardwareAcknowledgeAlertInput,
  success: HardwareAlert,
  error: HardwareRpcError,
});

const WsHardwareSetDeepSensorsRpc = defineWsRpc(WS_METHODS.hardwareSetDeepSensors, {
  scope: AuthSettingsWriteScope,
  category: "server",
  payload: HardwareSetDeepSensorsInput,
  success: HardwareWatchStatus,
  error: HardwareRpcError,
});

const WsHardwarePrepareAgentRpc = defineWsRpc(WS_METHODS.hardwarePrepareAgent, {
  scope: AuthOrchestrationOperateScope,
  category: "server",
  payload: HardwarePrepareAgentInput,
  success: HardwarePrepareAgentResult,
  error: HardwareRpcError,
});

const WsHardwareGetStatusRpc = defineWsRpc(WS_METHODS.hardwareGetStatus, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: HardwarePcStatus,
  error: HardwareRpcError,
});

/** Status and alerts; `live` adds samples and raises sampling to once a second while subscribed. */
const WsSubscribeHardwareRpc = defineWsRpc(WS_METHODS.subscribeHardware, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({ live: Schema.Boolean }),
  success: HardwareLiveEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsProjectsPromptCandidatesRpc = defineWsRpc(WS_METHODS.projectsPromptCandidates, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: Schema.Struct({ cwd: Schema.String }),
  success: Schema.Array(
    Schema.Struct({ text: Schema.String, count: Schema.Number, lastSeen: Schema.Number }),
  ),
  error: EnvironmentAuthorizationError,
});

const WsProjectsPredictPromptRpc = defineWsRpc(WS_METHODS.projectsPredictPrompt, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: Schema.Struct({
    cwd: Schema.String,
    messages: Schema.Array(
      Schema.Struct({
        role: Schema.Literals(["user", "assistant"]),
        text: Schema.String.check(Schema.isMaxLength(3000)),
      }),
    ).check(Schema.isMaxLength(6)),
    draft: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000))),
    personalExamples: Schema.optionalKey(
      Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(Schema.isMaxLength(5)),
    ),
    sessionId: Schema.optionalKey(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
    ),
  }),
  success: Schema.Struct({ prompt: Schema.NullOr(Schema.String) }),
  error: EnvironmentAuthorizationError,
});

const WsProjectsPickSkillsRpc = defineWsRpc(WS_METHODS.projectsPickSkills, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: Schema.Struct({
    cwd: Schema.String,
    request: Schema.String.check(Schema.isMaxLength(2000)),
    project: Schema.String.check(Schema.isMaxLength(200)),
    alreadyAdded: Schema.Array(Schema.String.check(Schema.isMaxLength(100))).check(
      Schema.isMaxLength(10),
    ),
    candidates: Schema.Array(
      Schema.Struct({
        name: Schema.String.check(Schema.isMaxLength(100)),
        description: Schema.String.check(Schema.isMaxLength(300)),
        scope: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(20))),
      }),
    ).check(Schema.isMaxLength(60)),
    max: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
    engine: AutoPickEngine,
    openRouterModel: AutoPickModelSlug,
    groqModel: AutoPickModelSlug,
    localModel: AutoPickModelSlug,
  }),
  success: Schema.Struct({
    picks: Schema.Array(Schema.Struct({ name: Schema.String, reason: Schema.String })),
    modelUsed: Schema.Boolean,
    engine: Schema.optionalKey(Schema.Literals(["openrouter", "groq", "local", "chat"])),
    model: Schema.optionalKey(Schema.String),
  }),
  error: EnvironmentAuthorizationError,
});

const WsProjectsCancelPromptPredictionRpc = defineWsRpc(WS_METHODS.projectsCancelPromptPrediction, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: Schema.Struct({
    sessionId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  success: Schema.Void,
  error: EnvironmentAuthorizationError,
});

const WsProjectsListIgnoredFilesRpc = defineWsRpc(WS_METHODS.projectsListIgnoredFiles, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ProjectListIgnoredFilesInput,
  success: ProjectListIgnoredFilesResult,
  error: Schema.Union([ProjectListEntriesError, EnvironmentAuthorizationError]),
});

const WsProjectsReadFileRpc = defineWsRpc(WS_METHODS.projectsReadFile, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: ProjectReadFileInput,
  success: ProjectReadFileResult,
  error: Schema.Union([ProjectReadFileError, EnvironmentAuthorizationError]),
});

const WsProjectsWriteFileRpc = defineWsRpc(WS_METHODS.projectsWriteFile, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: Schema.Union([ProjectWriteFileError, EnvironmentAuthorizationError]),
});

const WsProjectsMutateRpc = defineWsRpc(WS_METHODS.projectsMutate, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  scopesFor: projectMutationScopes,
  payload: ProjectMutation,
  success: Project,
  error: Schema.Union([ProjectMutationError, EnvironmentAuthorizationError]),
});

const WsProjectsEnsureScratchRpc = defineWsRpc(WS_METHODS.projectsEnsureScratch, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  payload: Schema.Struct({}),
  success: ProjectEnsureScratchResult,
  error: Schema.Union([OrchestrationDispatchCommandError, EnvironmentAuthorizationError]),
});

const WsProjectsCreateNewRpc = defineWsRpc(WS_METHODS.projectsCreateNew, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  payload: ProjectCreateNewInput,
  success: ProjectCreateNewResult,
  error: Schema.Union([OrchestrationDispatchCommandError, EnvironmentAuthorizationError]),
});

const WsShellOpenInEditorRpc = defineWsRpc(WS_METHODS.shellOpenInEditor, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: LaunchEditorInput,
  error: Schema.Union([ExternalLauncherError, EnvironmentAuthorizationError]),
});

const WsFilesystemGetMetadataRpc = defineWsRpc(WS_METHODS.filesystemGetMetadata, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: FilesystemGetMetadataInput,
  success: FilesystemGetMetadataResult,
  error: EnvironmentAuthorizationError,
});

const WsFilesystemBrowseRpc = defineWsRpc(WS_METHODS.filesystemBrowse, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: Schema.Union([FilesystemBrowseError, EnvironmentAuthorizationError]),
});

const WsLayaSetupRpc = defineWsRpc(WS_METHODS.layaSetup, {
  scope: AuthFilesystemWriteScope,
  category: "workspace",
  payload: LayaSetupInput,
  success: LayaSetupResult,
  error: EnvironmentAuthorizationError,
});

const WsThreadSweepRunRpc = defineWsRpc(WS_METHODS.threadSweepRun, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ThreadSweepInput,
  success: ThreadSweepResult,
  error: EnvironmentAuthorizationError,
});

const WsThreadSweepHandoffRpc = defineWsRpc(WS_METHODS.threadSweepHandoff, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: ThreadHandoffInput,
  success: ThreadHandoffResult,
  error: EnvironmentAuthorizationError,
});

const WsFilesystemInspectFolderRpc = defineWsRpc(WS_METHODS.filesystemInspectFolder, {
  scope: AuthFilesystemReadScope,
  category: "workspace",
  payload: FilesystemInspectFolderInput,
  success: FilesystemInspectFolderResult,
  error: Schema.Union([FilesystemBrowseError, EnvironmentAuthorizationError]),
});

const WsAgentSessionsScanRpc = defineWsRpc(WS_METHODS.agentSessionsScan, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  payload: AgentSessionScanInput,
  success: AgentSessionScanResult,
  error: Schema.Union([AgentSessionScanError, EnvironmentAuthorizationError]),
});

const WsAgentSessionsImportRpc = defineWsRpc(WS_METHODS.agentSessionsImport, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AgentSessionImportInput,
  success: AgentSessionImportResult,
  error: Schema.Union([
    AgentSessionImportProjectChangedError,
    AgentSessionImportProjectNotFoundError,
    AgentSessionScanError,
    EnvironmentAuthorizationError,
  ]),
});

const WsAssetsCreateUrlRpc = defineWsRpc(WS_METHODS.assetsCreateUrl, {
  scope: AuthOrchestrationReadScope,
  category: "workspace",
  scopesFor: assetCreateUrlScopes,
  payload: AssetCreateUrlInput,
  success: AssetCreateUrlResult,
  error: Schema.Union([AssetAccessError, EnvironmentAuthorizationError]),
});

const WsAssetsPersistChatAttachmentsRpc = defineWsRpc(WS_METHODS.assetsPersistChatAttachments, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  payload: PersistChatAttachmentsInput,
  success: PersistChatAttachmentsResult,
  error: Schema.Union([PersistChatAttachmentsError, EnvironmentAuthorizationError]),
});

const WsAttachmentsCreateUploadUrlRpc = defineWsRpc(WS_METHODS.attachmentsCreateUploadUrl, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AttachmentCreateUploadUrlInput,
  success: AttachmentCreateUploadUrlResult,
  error: Schema.Union([AttachmentUploadSigningKeyError, EnvironmentAuthorizationError]),
});

const WsAttachmentsDeleteRpc = defineWsRpc(WS_METHODS.attachmentsDelete, {
  scope: AuthOrchestrationOperateScope,
  category: "workspace",
  payload: AttachmentDeleteInput,
  error: EnvironmentAuthorizationError,
});

const WsMcpAppsCallToolRpc = defineWsRpc(WS_METHODS.mcpAppsCallTool, {
  scope: AuthOrchestrationOperateScope,
  category: "provider",
  payload: McpAppCallToolInput,
  success: McpAppCallToolResult,
  error: Schema.Union([McpAppRequestError, EnvironmentAuthorizationError]),
});

const WsMcpAppsToolInfoRpc = defineWsRpc(WS_METHODS.mcpAppsToolInfo, {
  scope: AuthOrchestrationReadScope,
  category: "provider",
  payload: McpAppToolInfoInput,
  success: McpAppToolInfo,
  error: Schema.Union([McpAppRequestError, EnvironmentAuthorizationError]),
});

const WsMcpAppsUpdateModelContextRpc = defineWsRpc(WS_METHODS.mcpAppsUpdateModelContext, {
  scope: AuthOrchestrationOperateScope,
  category: "provider",
  payload: McpAppUpdateModelContextInput,
  error: Schema.Union([McpAppRequestError, EnvironmentAuthorizationError]),
});

const WsMcpAppsReadResourceRpc = defineWsRpc(WS_METHODS.mcpAppsReadResource, {
  scope: AuthOrchestrationReadScope,
  category: "provider",
  payload: McpAppReadResourceInput,
  success: McpAppReadResourceResult,
  error: Schema.Union([McpAppRequestError, EnvironmentAuthorizationError]),
});

const WsProviderUploadFeedbackRpc = defineWsRpc(WS_METHODS.providerUploadFeedback, {
  scope: AuthOrchestrationOperateScope,
  category: "provider",
  payload: ProviderUploadFeedbackInput,
  success: ProviderUploadFeedbackResult,
  error: Schema.Union([ProviderUploadFeedbackError, EnvironmentAuthorizationError]),
});

const WsSubscribeVcsStatusRpc = defineWsRpc(WS_METHODS.subscribeVcsStatus, {
  scope: AuthOrchestrationReadScope,
  category: "vcs",
  payload: VcsStatusSubscriptionInput,
  success: VcsStatusStreamEvent,
  error: Schema.Union([GitManagerServiceError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsVcsPullRpc = defineWsRpc(WS_METHODS.vcsPull, {
  scope: AuthSourceControlWriteScope,
  category: "git",
  payload: VcsPullInput,
  success: VcsPullResult,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsRefreshStatusRpc = defineWsRpc(WS_METHODS.vcsRefreshStatus, {
  scope: AuthOrchestrationReadScope,
  category: "vcs",
  payload: VcsStatusInput,
  success: VcsStatusResult,
  error: Schema.Union([GitManagerServiceError, EnvironmentAuthorizationError]),
});

const WsSubscribeWorktreeSetupRpc = defineWsRpc(WS_METHODS.subscribeWorktreeSetup, {
  scope: AuthOrchestrationReadScope,
  category: "vcs",
  payload: WorktreeSetupSubscribeInput,
  success: WorktreeSetupStreamEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsWorktreeSetupCancelRpc = defineWsRpc(WS_METHODS.worktreeSetupCancel, {
  scope: AuthOrchestrationOperateScope,
  category: "vcs",
  payload: WorktreeSetupCancelInput,
  success: WorktreeSetupCancelResult,
  error: EnvironmentAuthorizationError,
});

const WsGitRunStackedActionRpc = defineWsRpc(WS_METHODS.gitRunStackedAction, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  scopesFor: (payload) => stackedActionScopes(payload) ?? [AuthSourceControlWriteScope],
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: Schema.Union([GitManagerServiceError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsGitResolvePullRequestRpc = defineWsRpc(WS_METHODS.gitResolvePullRequest, {
  scope: AuthOrchestrationReadScope,
  category: "git",
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: Schema.Union([GitManagerServiceError, EnvironmentAuthorizationError]),
});

const WsGitPreparePullRequestThreadRpc = defineWsRpc(WS_METHODS.gitPreparePullRequestThread, {
  scope: AuthSourceControlWriteScope,
  category: "git",
  scopesFor: (payload) => preparePullRequestThreadScopes(payload) ?? [AuthSourceControlWriteScope],
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: Schema.Union([GitManagerServiceError, EnvironmentAuthorizationError]),
});

const WsVcsListRefsRpc = defineWsRpc(WS_METHODS.vcsListRefs, {
  scope: AuthOrchestrationReadScope,
  category: "vcs",
  payload: VcsListRefsInput,
  success: VcsListRefsResult,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsCreateWorktreeRpc = defineWsRpc(WS_METHODS.vcsCreateWorktree, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  // Clients cannot choose the folder: new worktrees go in the server's managed
  // worktrees folder. `path` stays a required null because older servers
  // require the key.
  payload: Schema.Struct({ ...VcsCreateWorktreeInput.fields, path: Schema.Null }),
  success: VcsCreateWorktreeResult,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsRemoveWorktreeRpc = defineWsRpc(WS_METHODS.vcsRemoveWorktree, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  payload: VcsRemoveWorktreeInput,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsCreateRefRpc = defineWsRpc(WS_METHODS.vcsCreateRef, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  payload: VcsCreateRefInput,
  success: VcsCreateRefResult,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsSwitchRefRpc = defineWsRpc(WS_METHODS.vcsSwitchRef, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  payload: VcsSwitchRefInput,
  success: VcsSwitchRefResult,
  error: Schema.Union([GitCommandError, EnvironmentAuthorizationError]),
});

const WsVcsInitRpc = defineWsRpc(WS_METHODS.vcsInit, {
  scope: AuthSourceControlWriteScope,
  category: "vcs",
  payload: VcsInitInput,
  error: Schema.Union([VcsError, EnvironmentAuthorizationError]),
});

const WsReviewGetDiffPreviewRpc = defineWsRpc(WS_METHODS.reviewGetDiffPreview, {
  scope: AuthFilesystemReadScope,
  category: "review",
  payload: ReviewDiffPreviewInput,
  success: ReviewDiffPreviewResult,
  error: Schema.Union([ReviewDiffPreviewError, EnvironmentAuthorizationError]),
});

const WsReviewGetDiffFileContentsRpc = defineWsRpc(WS_METHODS.reviewGetDiffFileContents, {
  scope: AuthFilesystemReadScope,
  category: "review",
  payload: ReviewDiffFileContentsInput,
  success: ReviewDiffFileContentsResult,
  error: Schema.Union([ReviewDiffPreviewError, EnvironmentAuthorizationError]),
});

const WsTerminalOpenRpc = defineWsRpc(WS_METHODS.terminalOpen, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsTerminalAttachRpc = defineWsRpc(WS_METHODS.terminalAttach, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalAttachInput,
  success: TerminalAttachStreamEvent,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsTerminalObserveRpc = defineWsRpc(WS_METHODS.terminalObserve, {
  scope: AuthTerminalReadScope,
  category: "terminal",
  payload: TerminalObserveInput,
  success: TerminalAttachStreamEvent,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsTerminalWriteRpc = defineWsRpc(WS_METHODS.terminalWrite, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalWriteInput,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsTerminalResizeRpc = defineWsRpc(WS_METHODS.terminalResize, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalResizeInput,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsTerminalClearRpc = defineWsRpc(WS_METHODS.terminalClear, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalClearInput,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsTerminalRestartRpc = defineWsRpc(WS_METHODS.terminalRestart, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsTerminalCloseRpc = defineWsRpc(WS_METHODS.terminalClose, {
  scope: AuthTerminalOperateScope,
  category: "terminal",
  payload: TerminalCloseInput,
  error: Schema.Union([TerminalError, EnvironmentAuthorizationError]),
});

const WsPreviewOpenRpc = defineWsRpc(WS_METHODS.previewOpen, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewOpenInput,
  success: PreviewSessionSnapshot,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewNavigateRpc = defineWsRpc(WS_METHODS.previewNavigate, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewNavigateInput,
  success: PreviewSessionSnapshot,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewResizeRpc = defineWsRpc(WS_METHODS.previewResize, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewResizeInput,
  success: PreviewSessionSnapshot,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewAdjustRpc = defineWsRpc(WS_METHODS.previewAdjust, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewAdjustInput,
  success: PreviewSessionSnapshot,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewRefreshRpc = defineWsRpc(WS_METHODS.previewRefresh, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewRefreshInput,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewCloseRpc = defineWsRpc(WS_METHODS.previewClose, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewCloseInput,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsPreviewListRpc = defineWsRpc(WS_METHODS.previewList, {
  scope: AuthOrchestrationReadScope,
  category: "preview",
  payload: PreviewListInput,
  success: PreviewListResult,
  error: EnvironmentAuthorizationError,
});

const WsPreviewClearProfileRpc = defineWsRpc(WS_METHODS.previewClearProfile, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewClearProfileInput,
  error: Schema.Union([PreviewClearProfileError, EnvironmentAuthorizationError]),
});

const WsPreviewReportProfilesRpc = defineWsRpc(WS_METHODS.previewReportProfiles, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewReportProfilesInput,
  error: EnvironmentAuthorizationError,
});

const WsPreviewReportStatusRpc = defineWsRpc(WS_METHODS.previewReportStatus, {
  scope: AuthPreviewOperateScope,
  category: "preview",
  payload: PreviewReportStatusInput,
  error: Schema.Union([PreviewError, EnvironmentAuthorizationError]),
});

const WsSubscribePreviewEventsRpc = defineWsRpc(WS_METHODS.subscribePreviewEvents, {
  scope: AuthOrchestrationReadScope,
  category: "preview",
  payload: Schema.Struct({}),
  success: PreviewEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsPreviewStopLocalServerRpc = defineWsRpc(WS_METHODS.previewStopLocalServer, {
  scope: AuthTerminalOperateScope,
  category: "preview",
  payload: PreviewStopLocalServerInput,
  error: Schema.Union([PreviewStopLocalServerError, EnvironmentAuthorizationError]),
});

const WsSubscribeDiscoveredLocalServersRpc = defineWsRpc(
  WS_METHODS.subscribeDiscoveredLocalServers,
  {
    scope: AuthOrchestrationReadScope,
    category: "preview",
    payload: Schema.Struct({
      configuredUrls: Schema.optional(ConfiguredLocalServerUrls),
    }),
    success: DiscoveredLocalServerList,
    error: EnvironmentAuthorizationError,
    stream: true,
  },
);

const WsScribeGetStatusRpc = defineWsRpc(WS_METHODS.scribeGetStatus, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeStatusResult,
  error: EnvironmentAuthorizationError,
});

const WsScribeStartRpc = defineWsRpc(WS_METHODS.scribeStart, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeStartInput,
  success: ScribeCommandResult,
  error: Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]),
});

const WsScribeStopRpc = defineWsRpc(WS_METHODS.scribeStop, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeStopInput,
  success: ScribeCommandResult,
  error: Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]),
});

/** Run the newest failed take again. `not_found` when no take is saved. */
const WsScribeRetryRpc = defineWsRpc(WS_METHODS.scribeRetry, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeCommandResult,
  error: Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]),
});

const WsVoiceLogMemoryReviewRpc = defineWsRpc(WS_METHODS.voiceLogMemoryReview, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: VoiceLogMemoryReview,
  error: Schema.Union([VoiceLogMemoryError, EnvironmentAuthorizationError]),
});
const WsVoiceLogMemoryApproveRpc = defineWsRpc(WS_METHODS.voiceLogMemoryApprove, {
  scope: AuthFilesystemWriteScope,
  category: "scribe",
  payload: VoiceLogMemoryApproveInput,
  success: VoiceLogMemoryReview,
  error: Schema.Union([VoiceLogMemoryError, EnvironmentAuthorizationError]),
});

const WsScribeListHistoryRpc = defineWsRpc(WS_METHODS.scribeListHistory, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: ScribeListHistoryInput,
  success: ScribeHistoryPage,
  error: Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]),
});

const WsScribeDeleteHistoryRpc = defineWsRpc(WS_METHODS.scribeDeleteHistory, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeDeleteHistoryInput,
  success: ScribeDeleteHistoryResult,
  error: Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]),
});

const ScribeRpcError = Schema.Union([ScribeEngineError, EnvironmentAuthorizationError]);

const WsScribeGetInsightsRpc = defineWsRpc(WS_METHODS.scribeGetInsights, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: ScribeStatsInput,
  success: ScribeInsights,
  error: ScribeRpcError,
});

const WsScribeGetGoalsRpc = defineWsRpc(WS_METHODS.scribeGetGoals, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: ScribeStatsInput,
  success: ScribeGoals,
  error: ScribeRpcError,
});

const WsScribeGetDictionaryRpc = defineWsRpc(WS_METHODS.scribeGetDictionary, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeDictionary,
  error: ScribeRpcError,
});

const WsScribePutDictionaryRpc = defineWsRpc(WS_METHODS.scribePutDictionary, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeDictionary,
  success: ScribeDictionary,
  error: ScribeRpcError,
});

const WsScribeListSuggestionsRpc = defineWsRpc(WS_METHODS.scribeListSuggestions, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeSuggestionList,
  error: ScribeRpcError,
});

const WsScribeRejectSuggestionRpc = defineWsRpc(WS_METHODS.scribeRejectSuggestion, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeRejectSuggestionInput,
  success: ScribeRejectSuggestionResult,
  error: ScribeRpcError,
});

const WsScribeGetSettingsRpc = defineWsRpc(WS_METHODS.scribeGetSettings, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeSettings,
  error: ScribeRpcError,
});

const WsScribePatchSettingsRpc = defineWsRpc(WS_METHODS.scribePatchSettings, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: ScribePatchSettingsInput,
  success: ScribePatchSettingsResult,
  error: ScribeRpcError,
});

const WsScribeListDevicesRpc = defineWsRpc(WS_METHODS.scribeListDevices, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeDevices,
  error: ScribeRpcError,
});

const WsScribeGetGroqKeyRpc = defineWsRpc(WS_METHODS.scribeGetGroqKey, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeGroqKey,
  error: ScribeRpcError,
});

const WsScribeSetGroqKeyRpc = defineWsRpc(WS_METHODS.scribeSetGroqKey, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: ScribeSetGroqKeyInput,
  success: Schema.Struct({}),
  error: ScribeRpcError,
});

const WsScribeMeetingsRpc = defineWsRpc(WS_METHODS.scribeMeetings, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: ScribeMeetingsInput,
  success: ScribeMeetingsResult,
  error: ScribeRpcError,
});

/** Saving or connecting the Discord app: a settings change, like the Groq key. */
const WsScribeMeetingsDiscordRpc = defineWsRpc(WS_METHODS.scribeMeetingsDiscord, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: ScribeMeetingsInput,
  success: ScribeMeetingsResult,
  error: ScribeRpcError,
});

const WsScribeClearGroqKeyRpc = defineWsRpc(WS_METHODS.scribeClearGroqKey, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
  error: ScribeRpcError,
});

const WsScribeSubscribeEventsRpc = defineWsRpc(WS_METHODS.scribeSubscribeEvents, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: ScribeLiveEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsVoiceGetStatusRpc = defineWsRpc(WS_METHODS.voiceGetStatus, {
  scope: AuthOrchestrationReadScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: VoiceStatus,
  error: Schema.Union([VoiceError, EnvironmentAuthorizationError]),
});

const WsVoiceSetGroqKeyRpc = defineWsRpc(WS_METHODS.voiceSetGroqKey, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: VoiceSetGroqKeyInput,
  success: VoiceStatus,
  error: Schema.Union([VoiceError, EnvironmentAuthorizationError]),
});

const WsVoiceClearGroqKeyRpc = defineWsRpc(WS_METHODS.voiceClearGroqKey, {
  scope: AuthSettingsWriteScope,
  category: "scribe",
  payload: Schema.Struct({}),
  success: VoiceStatus,
  error: Schema.Union([VoiceError, EnvironmentAuthorizationError]),
});

const WsVoiceTranscribeRpc = defineWsRpc(WS_METHODS.voiceTranscribe, {
  scope: AuthOrchestrationOperateScope,
  category: "scribe",
  payload: VoiceTranscribeInput,
  success: VoiceTranscribeResult,
  error: Schema.Union([VoiceError, EnvironmentAuthorizationError]),
});

const WsLocalVmListRpc = defineWsRpc(WS_METHODS.localVmList, {
  scope: AuthOrchestrationReadScope,
  category: "localVm",
  payload: Schema.Struct({ inspect: Schema.optional(Schema.Boolean) }),
  success: LocalVmState,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsLocalVmConnectRpc = defineWsRpc(WS_METHODS.localVmConnect, {
  scope: AuthOrchestrationOperateScope,
  category: "localVm",
  payload: LocalVmConnectInput,
  success: LocalVmSession,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsLocalVmPauseRpc = defineWsRpc(WS_METHODS.localVmPause, {
  scope: AuthOrchestrationOperateScope,
  category: "localVm",
  payload: LocalVmPauseInput,
  success: LocalVmSession,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsLocalVmReleaseRpc = defineWsRpc(WS_METHODS.localVmRelease, {
  scope: AuthOrchestrationOperateScope,
  category: "localVm",
  payload: LocalVmTarget,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsLocalVmScreenshotRpc = defineWsRpc(WS_METHODS.localVmScreenshot, {
  scope: AuthOrchestrationReadScope,
  category: "localVm",
  payload: LocalVmTarget,
  success: LocalVmScreenshotResult,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsLocalVmInputRpc = defineWsRpc(WS_METHODS.localVmInput, {
  scope: AuthOrchestrationOperateScope,
  category: "localVm",
  payload: LocalVmInput,
  error: Schema.Union([LocalVmError, EnvironmentAuthorizationError]),
});

const WsDeviceTestHostRpc = defineWsRpc(WS_METHODS.deviceTestHost, {
  scope: AuthSettingsWriteScope,
  category: "device",
  payload: SshDeviceHostConfig,
  success: DeviceHostSummary,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceEasAccountRpc = defineWsRpc(WS_METHODS.deviceEasAccount, {
  scope: AuthSettingsWriteScope,
  category: "device",
  payload: DeviceEasAccountInput,
  success: DeviceEasAccount,
  error: Schema.Union([DeviceEasAccountError, EnvironmentAuthorizationError]),
});

const WsDeviceListRpc = defineWsRpc(WS_METHODS.deviceList, {
  scope: AuthOrchestrationReadScope,
  category: "device",
  payload: DeviceListInput,
  success: DeviceServiceState,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceConfigureRpc = defineWsRpc(WS_METHODS.deviceConfigure, {
  scope: AuthSettingsWriteScope,
  category: "device",
  payload: DeviceConfigureInput,
  success: DeviceServiceState,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceOpenRpc = defineWsRpc(WS_METHODS.deviceOpen, {
  scope: AuthOrchestrationOperateScope,
  category: "device",
  payload: DeviceOpenInput,
  success: DeviceSession,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceCloseRpc = defineWsRpc(WS_METHODS.deviceClose, {
  scope: AuthOrchestrationOperateScope,
  category: "device",
  payload: DeviceCloseInput,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceShutdownRpc = defineWsRpc(WS_METHODS.deviceShutdown, {
  scope: AuthOrchestrationOperateScope,
  category: "device",
  payload: DeviceShutdownInput,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceDetailRpc = defineWsRpc(WS_METHODS.deviceDetail, {
  scope: AuthOrchestrationReadScope,
  category: "device",
  payload: DeviceDetailInput,
  success: DeviceDetail,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsDeviceActionRpc = defineWsRpc(WS_METHODS.deviceAction, {
  scope: AuthOrchestrationOperateScope,
  category: "device",
  payload: DeviceActionInput,
  success: DeviceDetail,
  error: Schema.Union([DeviceError, EnvironmentAuthorizationError]),
});

const WsSubscribeDeviceStateRpc = defineWsRpc(WS_METHODS.subscribeDeviceState, {
  scope: AuthOrchestrationReadScope,
  category: "device",
  payload: Schema.Struct({}),
  success: DeviceServiceState,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsOrchestrationV2DispatchCommandRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.dispatchCommand,
  {
    scope: AuthOrchestrationOperateScope,
    category: "orchestrationV2",
    payload: OrchestrationV2RpcSchemas.dispatchCommand.input,
    success: OrchestrationV2RpcSchemas.dispatchCommand.output,
    error: Schema.Union([OrchestrationV2DispatchCommandError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2GetTurnDiffRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.getTurnDiff, {
  scope: AuthOrchestrationReadScope,
  category: "orchestration",
  payload: OrchestrationV2RpcSchemas.getTurnDiff.input,
  success: OrchestrationV2RpcSchemas.getTurnDiff.output,
  error: Schema.Union([OrchestrationGetTurnDiffError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2GetFullThreadDiffRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.getFullThreadDiff,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestration",
    payload: OrchestrationV2RpcSchemas.getFullThreadDiff.input,
    success: OrchestrationV2RpcSchemas.getFullThreadDiff.output,
    error: Schema.Union([OrchestrationGetFullThreadDiffError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2SearchThreadRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.searchThread, {
  scope: AuthOrchestrationReadScope,
  category: "orchestration",
  payload: OrchestrationV2SearchThreadInput,
  success: OrchestrationV2SearchThreadResult,
  error: Schema.Union([OrchestrationV2SearchThreadError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2SearchThreadStreamRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.searchThreadStream,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestration",
    payload: OrchestrationV2SearchThreadInput,
    success: OrchestrationV2SearchThreadResult,
    error: Schema.Union([OrchestrationV2SearchThreadError, EnvironmentAuthorizationError]),
    stream: true,
  },
);

const WsOrchestrationV2SearchThreadsRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.searchThreads, {
  scope: AuthOrchestrationReadScope,
  category: "orchestration",
  payload: OrchestrationSearchThreadsInput,
  success: OrchestrationSearchThreadsResult,
  error: Schema.Union([OrchestrationSearchThreadsError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2GetArchivedShellSnapshotRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.getArchivedShellSnapshot,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestration",
    payload: OrchestrationV2RpcSchemas.getArchivedShellSnapshot.input,
    success: OrchestrationV2RpcSchemas.getArchivedShellSnapshot.output,
    error: Schema.Union([OrchestrationV2GetShellSnapshotError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2GetThreadProjectionRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.getThreadProjection,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestrationV2",
    payload: OrchestrationV2RpcSchemas.getThreadProjection.input,
    success: OrchestrationV2RpcSchemas.getThreadProjection.output,
    error: Schema.Union([OrchestrationV2GetThreadProjectionError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2StopBackgroundCommandRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.stopBackgroundCommand,
  {
    scope: AuthOrchestrationOperateScope,
    category: "orchestration",
    payload: OrchestrationV2RpcSchemas.stopBackgroundCommand.input,
    success: OrchestrationV2RpcSchemas.stopBackgroundCommand.output,
    error: Schema.Union([OrchestrationV2StopBackgroundCommandError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2StopWorkflowRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.stopWorkflow, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  payload: OrchestrationV2RpcSchemas.stopWorkflow.input,
  success: OrchestrationV2RpcSchemas.stopWorkflow.output,
  error: Schema.Union([OrchestrationV2StopWorkflowError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2GetWorkflowScriptRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.getWorkflowScript,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestration",
    payload: OrchestrationV2RpcSchemas.getWorkflowScript.input,
    success: OrchestrationV2RpcSchemas.getWorkflowScript.output,
    error: Schema.Union([OrchestrationGetWorkflowScriptError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2GetTurnItemRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.getTurnItem, {
  scope: AuthOrchestrationReadScope,
  category: "orchestration",
  payload: OrchestrationV2RpcSchemas.getTurnItem.input,
  success: OrchestrationV2RpcSchemas.getTurnItem.output,
  error: Schema.Union([OrchestrationV2GetThreadProjectionError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2GetThreadContextBreakdownRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.getThreadContextBreakdown,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestrationV2",
    payload: OrchestrationV2RpcSchemas.getThreadContextBreakdown.input,
    success: OrchestrationV2RpcSchemas.getThreadContextBreakdown.output,
    error: Schema.Union([ThreadContextBreakdownError, EnvironmentAuthorizationError]),
  },
);

const WsOrchestrationV2LaunchThreadRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.launchThread, {
  scope: AuthOrchestrationOperateScope,
  category: "orchestration",
  payload: OrchestrationV2RpcSchemas.launchThread.input,
  success: OrchestrationV2RpcSchemas.launchThread.output,
  error: Schema.Union([OrchestrationV2ThreadLaunchError, EnvironmentAuthorizationError]),
});

const WsOrchestrationV2SubscribeArchivedShellRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.subscribeArchivedShell,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestration",
    payload: OrchestrationV2RpcSchemas.subscribeArchivedShell.input,
    success: OrchestrationV2RpcSchemas.subscribeArchivedShell.output,
    error: Schema.Union([OrchestrationV2GetShellSnapshotError, EnvironmentAuthorizationError]),
    stream: true,
  },
);

const WsOrchestrationV2SubscribeShellRpc = defineWsRpc(ORCHESTRATION_V2_WS_METHODS.subscribeShell, {
  scope: AuthOrchestrationReadScope,
  category: "orchestrationV2",
  payload: OrchestrationV2RpcSchemas.subscribeShell.input,
  success: OrchestrationV2RpcSchemas.subscribeShell.output,
  error: Schema.Union([OrchestrationV2GetShellSnapshotError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsOrchestrationV2SubscribeThreadRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.subscribeThread,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestrationV2",
    payload: OrchestrationV2RpcSchemas.subscribeThread.input,
    success: OrchestrationV2RpcSchemas.subscribeThread.output,
    error: Schema.Union([OrchestrationV2GetThreadProjectionError, EnvironmentAuthorizationError]),
    stream: true,
  },
);

const WsOrchestrationV2SubscribeCommandOutputRpc = defineWsRpc(
  ORCHESTRATION_V2_WS_METHODS.subscribeCommandOutput,
  {
    scope: AuthOrchestrationReadScope,
    category: "orchestrationV2",
    payload: OrchestrationV2RpcSchemas.subscribeCommandOutput.input,
    success: OrchestrationV2RpcSchemas.subscribeCommandOutput.output,
    error: Schema.Union([OrchestrationV2CommandOutputError, EnvironmentAuthorizationError]),
    stream: true,
  },
);

const WsSubscribeTerminalEventsRpc = defineWsRpc(WS_METHODS.subscribeTerminalEvents, {
  scope: AuthTerminalReadScope,
  category: "terminal",
  payload: Schema.Struct({}),
  success: TerminalEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsSubscribeTerminalMetadataRpc = defineWsRpc(WS_METHODS.subscribeTerminalMetadata, {
  scope: AuthTerminalReadScope,
  category: "terminal",
  payload: Schema.Struct({}),
  success: TerminalMetadataStreamEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

export const WsSubscribeServerConfigRpc = defineWsRpc(WS_METHODS.subscribeServerConfig, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({
    /**
     * Already-shipped clients decode the stream against the old event union and
     * would die on an unknown member, so the server emits the theme stream only
     * to subscribers that ask for it.
     */
    environmentThemes: Schema.optional(Schema.Boolean),
    usageLimitSources: Schema.optional(Schema.Boolean),
    /**
     * Whether this client answers `/usage-limits` itself. The server injects
     * that command into provider catalogs only for such clients; an older
     * client would send it to the provider as an ordinary prompt.
     */
    usageLimitsCommand: Schema.optional(Schema.Boolean),
  }),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsSubscribeServerLifecycleRpc = defineWsRpc(WS_METHODS.subscribeServerLifecycle, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsScheduledTasksListRpc = defineWsRpc(WS_METHODS.scheduledTasksList, {
  scope: AuthOrchestrationReadScope,
  category: "scheduledTasks",
  payload: ScheduledTaskListInput,
  success: ScheduledTaskListResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
});

const savedItemRpcError = Schema.Union([SavedItemError, EnvironmentAuthorizationError]);
const WsSavedItemsListRpc = defineWsRpc(WS_METHODS.savedItemsList, {
  scope: AuthOrchestrationReadScope,
  category: "savedItems",
  payload: SavedItemListInput,
  success: SavedItemListResult,
  error: savedItemRpcError,
});
const WsSavedItemsGetRpc = defineWsRpc(WS_METHODS.savedItemsGet, {
  scope: AuthOrchestrationReadScope,
  category: "savedItems",
  payload: SavedItemGetInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsCreateRpc = defineWsRpc(WS_METHODS.savedItemsCreate, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemCreateInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsUpdateRpc = defineWsRpc(WS_METHODS.savedItemsUpdate, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemUpdateInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsTransitionRpc = defineWsRpc(WS_METHODS.savedItemsTransition, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemTransitionInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsImportRpc = defineWsRpc(WS_METHODS.savedItemsImport, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemImportInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsLaunchRpc = defineWsRpc(WS_METHODS.savedItemsLaunch, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemLaunchInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsScheduleRpc = defineWsRpc(WS_METHODS.savedItemsSchedule, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemScheduleInput,
  success: SavedItem,
  error: savedItemRpcError,
});
const WsSavedItemsSaveTaskRpc = defineWsRpc(WS_METHODS.savedItemsSaveTask, {
  scope: AuthOrchestrationOperateScope,
  category: "savedItems",
  payload: SavedItemTaskInput,
  success: SavedItem,
  error: savedItemRpcError,
});

/** Streams the full scheduled-task list: one snapshot on subscribe, then a fresh list after every change. */
const WsScheduledTasksSubscribeRpc = defineWsRpc(WS_METHODS.scheduledTasksSubscribe, {
  scope: AuthOrchestrationReadScope,
  category: "scheduledTasks",
  payload: ScheduledTaskListInput,
  success: ScheduledTaskListResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsScheduledTasksUpsertRpc = defineWsRpc(WS_METHODS.scheduledTasksUpsert, {
  scope: AuthOrchestrationOperateScope,
  category: "scheduledTasks",
  payload: ScheduledTaskUpsertInput,
  success: ScheduledTaskMutationResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
});

const WsScheduledTasksSetEnabledRpc = defineWsRpc(WS_METHODS.scheduledTasksSetEnabled, {
  scope: AuthOrchestrationOperateScope,
  category: "scheduledTasks",
  payload: ScheduledTaskSetEnabledInput,
  success: ScheduledTaskMutationResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
});

const WsScheduledTasksDeleteRpc = defineWsRpc(WS_METHODS.scheduledTasksDelete, {
  scope: AuthOrchestrationOperateScope,
  category: "scheduledTasks",
  payload: ScheduledTaskDeleteInput,
  success: ScheduledTaskDeleteResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
});

const WsScheduledTasksRunNowRpc = defineWsRpc(WS_METHODS.scheduledTasksRunNow, {
  scope: AuthOrchestrationOperateScope,
  category: "scheduledTasks",
  payload: ScheduledTaskRunNowInput,
  success: ScheduledTaskRunNowResult,
  error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
});

const WsScheduledTasksRotateWebhookTokenRpc = defineWsRpc(
  WS_METHODS.scheduledTasksRotateWebhookToken,
  {
    scope: AuthOrchestrationOperateScope,
    category: "scheduledTasks",
    payload: ScheduledTaskRotateWebhookTokenInput,
    success: ScheduledTaskMutationResult,
    error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
  },
);

const WsSecretsAnswerRequestRpc = defineWsRpc(WS_METHODS.secretsAnswerRequest, {
  scope: AuthOrchestrationOperateScope,
  category: "secrets",
  payload: SecretRequestAnswerInput,
  error: Schema.Union([SecretRequestError, EnvironmentAuthorizationError]),
});

const WsScheduledTasksListWebhookDeliveriesRpc = defineWsRpc(
  WS_METHODS.scheduledTasksListWebhookDeliveries,
  {
    scope: AuthOrchestrationOperateScope,
    category: "scheduledTasks",
    payload: ScheduledTaskListWebhookDeliveriesInput,
    success: ScheduledTaskListWebhookDeliveriesResult,
    error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
  },
);

const WsScheduledTasksGetWebhookDeliveryRpc = defineWsRpc(
  WS_METHODS.scheduledTasksGetWebhookDelivery,
  {
    scope: AuthOrchestrationOperateScope,
    category: "scheduledTasks",
    payload: ScheduledTaskGetWebhookDeliveryInput,
    success: ScheduledTaskGetWebhookDeliveryResult,
    error: Schema.Union([ScheduledTaskError, EnvironmentAuthorizationError]),
  },
);

const WsSubscribeAuthAccessRpc = defineWsRpc(WS_METHODS.subscribeAuthAccess, {
  scope: AuthAccessReadScope,
  category: "auth",
  payload: Schema.Struct({}),
  success: AuthAccessStreamEvent,
  error: Schema.Union([AuthAccessStreamError, EnvironmentAuthorizationError]),
  stream: true,
});

const WsSubscribeBackgroundPolicyRpc = defineWsRpc(WS_METHODS.subscribeBackgroundPolicy, {
  scope: AuthOrchestrationReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: BackgroundPolicySnapshot,
  error: EnvironmentAuthorizationError,
  stream: true,
});

const WsSubscribeResourceTelemetryRpc = defineWsRpc(WS_METHODS.subscribeResourceTelemetry, {
  scope: AuthDiagnosticsReadScope,
  category: "server",
  payload: Schema.Struct({}),
  success: ResourceTelemetrySnapshot,
  error: EnvironmentAuthorizationError,
  stream: true,
});

export class RpcScopeAuthorization extends RpcMiddleware.Service<RpcScopeAuthorization>()(
  "t3/contracts/RpcScopeAuthorization",
  { error: EnvironmentAuthorizationError },
) {}

export const WsRpcGroup = RpcGroup.make(
  WsSavedItemsListRpc,
  WsSavedItemsGetRpc,
  WsSavedItemsCreateRpc,
  WsSavedItemsUpdateRpc,
  WsSavedItemsTransitionRpc,
  WsSavedItemsImportRpc,
  WsSavedItemsLaunchRpc,
  WsSavedItemsScheduleRpc,
  WsSavedItemsSaveTaskRpc,
  WsScribeGetStatusRpc,
  WsScribeStartRpc,
  WsScribeStopRpc,
  WsScribeRetryRpc,
  WsVoiceLogMemoryReviewRpc,
  WsVoiceLogMemoryApproveRpc,
  WsScribeListHistoryRpc,
  WsScribeDeleteHistoryRpc,
  WsScribeMeetingsRpc,
  WsScribeMeetingsDiscordRpc,
  WsScribeGetInsightsRpc,
  WsScribeGetGoalsRpc,
  WsScribeGetDictionaryRpc,
  WsScribePutDictionaryRpc,
  WsScribeListSuggestionsRpc,
  WsScribeRejectSuggestionRpc,
  WsScribeGetSettingsRpc,
  WsScribePatchSettingsRpc,
  WsScribeListDevicesRpc,
  WsScribeGetGroqKeyRpc,
  WsScribeSetGroqKeyRpc,
  WsScribeClearGroqKeyRpc,
  WsScribeSubscribeEventsRpc,
  WsVoiceGetStatusRpc,
  WsVoiceSetGroqKeyRpc,
  WsVoiceClearGroqKeyRpc,
  WsVoiceTranscribeRpc,
  WsServerProbeRpc,
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpdateProviderRpc,
  WsProviderConsumeResetCreditRpc,
  WsProviderAuthStartRpc,
  WsProviderAuthCompleteRpc,
  WsChatGptReconnectProfileRpc,
  WsChatGptImportProfileRpc,
  WsChatGptHandoffSubscribeRpc,
  WsCodexAuthCallbackSubscribeRpc,
  WsProviderAuthRespondRpc,
  WsProviderAuthCancelRpc,
  WsProviderAuthLogoutRpc,
  WsProviderAuthSubscribeRpc,
  WsProviderInstallStartRpc,
  WsProviderInstallCancelRpc,
  WsProviderInstallSubscribeRpc,
  WsProviderInstallRemoveRpc,
  WsServerUpdateServerRpc,
  WsServerUpdateServerWithProgressRpc,
  WsServerCommitDesktopUpdateRpc,
  WsServerUpsertKeybindingRpc,
  WsServerRemoveKeybindingRpc,
  WsServerRunStorageCleanupRpc,
  WsServerGetStorageCleanupReportRpc,
  WsServerGetDatabaseStorageRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerTestApiKeyRpc,
  WsServerDiscoverSourceControlRpc,
  WsServerSearchAcpRegistryRpc,
  WsServerPrepareAcpRegistryAgentRpc,
  WsServerUninstallAcpRegistryManagedBinaryRpc,
  WsServerAcceptAcpRegistryUrlAuthRpc,
  WsServerListAcpRegistrySessionsRpc,
  WsServerImportAcpRegistrySessionRpc,
  WsServerDeleteAcpRegistrySessionRpc,
  WsServerListAcpRegistryProvidersRpc,
  WsServerSetAcpRegistryProviderRpc,
  WsServerDisableAcpRegistryProviderRpc,
  WsServerLogoutAcpRegistryRpc,
  WsServerGetTraceDiagnosticsRpc,
  WsServerGetProcessDiagnosticsRpc,
  WsServerGetHostResourcesRpc,
  WsServerGetProcessResourceHistoryRpc,
  WsServerGetResourceTelemetryHistoryRpc,
  WsServerRetryResourceTelemetryRpc,
  WsServerCheckOtlpEndpointRpc,
  WsServerGetUsageSummaryRpc,
  WsServerGetChatQuotaRpc,
  WsServerGetChatQuotaReportRpc,
  WsServerRefreshUsageRatesRpc,
  WsServerGetModelBenchmarksRpc,
  WsServerGetModelBenchmarkCatalogRpc,
  WsServerGetModelRunStatsRpc,
  WsServerSignalProcessRpc,
  WsScheduledTasksListRpc,
  WsScheduledTasksSubscribeRpc,
  WsScheduledTasksUpsertRpc,
  WsScheduledTasksSetEnabledRpc,
  WsScheduledTasksDeleteRpc,
  WsScheduledTasksRunNowRpc,
  WsScheduledTasksRotateWebhookTokenRpc,
  WsSecretsAnswerRequestRpc,
  WsScheduledTasksListWebhookDeliveriesRpc,
  WsScheduledTasksGetWebhookDeliveryRpc,
  WsServerReportClientActivityRpc,
  WsServerReportHostPowerStateRpc,
  WsServerGetBackgroundPolicyRpc,
  WsCloudGetRelayClientStatusRpc,
  WsCloudInstallRelayClientRpc,
  WsPullRequestsListRpc,
  WsPullRequestsListStatsRpc,
  WsPullRequestsSummaryRpc,
  WsPullRequestsRoutingRpc,
  WsPullRequestsRoutingIdentityRpc,
  WsPullRequestsStackRpc,
  WsPullRequestsLinkedThreadsRpc,
  WsPullRequestsDetailRpc,
  WsPullRequestsPreviewRpc,
  WsPullRequestsChecksRpc,
  WsPullRequestsActivityRpc,
  WsPullRequestsReviewGuideRpc,
  WsPullRequestsGenerateReviewGuideRpc,
  WsPullRequestsThreadCommentsRpc,
  WsPullRequestsDiffFileContentsRpc,
  WsPullRequestsFilesViewedRpc,
  WsPullRequestsChangeBreakdownRpc,
  WsPullRequestsSetFilesViewedRpc,
  WsPullRequestsRunActionRpc,
  WsPullRequestsUpdateRpc,
  WsPullRequestsCommentRpc,
  WsPullRequestsUpdateCommentRpc,
  WsPullRequestsSubmitReviewRpc,
  WsPullRequestsReplyToThreadRpc,
  WsPullRequestsSetThreadResolutionRpc,
  WsPullRequestsSetReactionRpc,
  WsPullRequestsInvalidateRpc,
  WsPullRequestsReportStateRpc,
  WsPullRequestsSubscribeRefreshesRpc,
  WsPullRequestsReviewerCandidatesRpc,
  WsPullRequestsRequestReviewersRpc,
  WsPullRequestsLabelCandidatesRpc,
  WsPullRequestsSetLabelsRpc,
  WsSourceControlLookupRepositoryRpc,
  WsSourceControlCloneRepositoryRpc,
  WsSourceControlPublishRepositoryRpc,
  WsProjectCloneStartRpc,
  WsProjectCloneCancelRpc,
  WsProjectCloneRetryRpc,
  WsSubscribeProjectClonesRpc,
  WsProjectsListEntriesRpc,
  WsProjectsListIgnoredFilesRpc,
  WsProjectsReadFileRpc,
  WsTaskBoardListRpc,
  WsTaskBoardCreateRpc,
  WsTaskBoardClaimRpc,
  WsTaskBoardReleaseRpc,
  WsTaskBoardCompleteRpc,
  WsTaskBoardSubscribeCompletionsRpc,
  WsSubagentsSubscribeSpawnApprovalsRpc,
  WsSubagentsRespondSpawnApprovalRpc,
  WsSubagentsListRpc,
  WsSubagentsUpdateRpc,
  WsSubagentsCreateRpc,
  WsSubagentsDeleteRpc,
  WsSubagentsDuplicateRpc,
  WsSubagentsDraftRpc,
  WsFocusSubscribeRpc,
  WsEventsSubscribeRpc,
  WsEventsAppendRpc,
  WsAutomationsListRpc,
  WsAutomationsSetEnabledRpc,
  WsAutomationsSetScheduleRpc,
  WsAutomationsRunNowRpc,
  WsMarketingListRpc,
  WsMarketingDecideRpc,
  WsContentListRpc,
  WsContentHistoryRpc,
  WsContentMoveRpc,
  WsContentSaveScriptRpc,
  WsContentPairingAcceptRpc,
  WsContentPairingStartRpc,
  WsContentSyncRpc,
  WsContentDecideDealRpc,
  WsContentCreateDealRpc,
  WsFocusUpdateRpc,
  WsFocusAttachmentRpc,
  WsTaskBoardUpdateRpc,
  WsTaskBoardWorkspaceRpc,
  WsTaskBoardCardUpdateRpc,
  WsTaskBoardCardCreateRpc,
  WsTaskBoardApplyChangeSetRpc,
  WsTaskBoardCapSetRpc,
  WsAiosLimitsRpc,
  WsAiosLimitSetRpc,
  WsVoiceLimitGetRpc,
  WsVoiceLimitSetRpc,
  WsTaskBoardShareRpc,
  WsTaskBoardAiosDetectRpc,
  WsTaskBoardAiosConfirmRpc,
  WsTaskBoardHomeRpc,
  WsTaskBoardHomePriorityToggleRpc,
  WsAiosFolderListRpc,
  WsAiosWorkspacesListRpc,
  WsAiosWorkspacesInitRpc,
  WsAiosProjectsScaffoldRpc,
  WsAiosWorkspacePicturesListRpc,
  WsAiosWorkspacePictureSetRpc,
  WsAiosWorkspacePictureRemoveRpc,
  WsAiosWorkspaceHiddenProjectsSetRpc,
  WsAreaSyncJoinRpc,
  WsAreaSyncSyncRpc,
  WsAreaSyncStatusRpc,
  WsWorkspacePackWidgetsRpc,
  WsWorkspacePackOrgRpc,
  WsWorkspacePackOrgChangeRpc,
  WsWorkspacePackOrgDecideRpc,
  WsAiosUsageShapeRpc,
  WsAiosDirectionRpc,
  WsTaskBoardHomeWeatherRpc,
  WsTaskBoardHomeNewsRpc,
  WsTradingImportsRpc,
  WsTradingImportRpc,
  WsTradingPackConsentRpc,
  WsTradingStateRpc,
  WsTradingAppendRpc,
  WsTradingSettingsSaveRpc,
  WsTradingCrewRpc,
  WsTradingCrewSyncRpc,
  WsTradingTradeAddRpc,
  WsTradingDayReadRpc,
  WsTradingDaySaveRpc,
  WsTradingScreenshotSaveRpc,
  WsTradingScreenshotReadRpc,
  WsTradingRiskRulesRpc,
  WsTradingLibraryIndexRpc,
  WsTradingLibraryPageRpc,
  WsTradingLibrarySearchRpc,
  WsTradingResourceSaveRpc,
  WsTradingResourceListRpc,
  WsReleaseStatusRunsRpc,
  WsGameModeStatusRpc,
  WsGameModeRunRpc,
  WsLayaUsageRpc,
  WsPonytailUsageRpc,
  WsCalendarEventsRpc,
  WsCalendarTestLinkRpc,
  WsCalendarAddLinkRpc,
  WsCalendarRemoveRpc,
  WsCalendarGoogleSetClientRpc,
  WsCalendarGoogleConnectRpc,
  WsCalendarGoogleSelectRpc,
  WsPonytailCodexHooksRpc,
  WsHardwareGetInventoryRpc,
  WsHardwareGetHistoryRpc,
  WsHardwareGetLimitsRpc,
  WsHardwareSetLimitRpc,
  WsHardwareAcknowledgeAlertRpc,
  WsHardwareSetDeepSensorsRpc,
  WsHardwarePrepareAgentRpc,
  WsHardwareGetStatusRpc,
  WsSubscribeHardwareRpc,
  WsInboxDropRpc,
  WsInboxUndoRpc,
  WsDevPreviewStatusRpc,
  WsDevPreviewStartRpc,
  WsDevPreviewStopRpc,
  WsImagesSubscribeRpc,
  WsImagesGenerateRpc,
  WsImagesCancelRpc,
  WsImagesKeepRpc,
  WsImagesRetryRpc,
  WsImagesSetBaseUrlRpc,
  WsLocalModelsSubscribeRpc,
  WsLocalModelsPullRpc,
  WsLocalModelsCancelPullRpc,
  WsLocalModelsRunRpc,
  WsLocalModelsStopRpc,
  WsLocalModelsSpeedTestRpc,
  WsLocalModelsStartOllamaRpc,
  WsLocalModelsAdviceRpc,
  WsLocalModelsCompareRpc,
  WsLocalModelsComparePickRpc,
  WsLocalModelsTokenReportRpc,
  WsLocalModelsDeleteRpc,
  WsFilesListRpc,
  WsFilesDeleteRpc,
  WsSubagentRunsListRpc,
  WsProjectsPromptCandidatesRpc,
  WsProjectsPredictPromptRpc,
  WsProjectsPickSkillsRpc,
  WsProjectsCancelPromptPredictionRpc,
  WsProjectsSearchContentsRpc,
  WsProjectsSearchEntriesRpc,
  WsReplyStylesListRpc,
  WsProjectsEnsureScratchRpc,
  WsProjectsCreateNewRpc,
  WsProjectsWriteFileRpc,
  WsProjectsMutateRpc,
  WsShellOpenInEditorRpc,
  WsFilesystemBrowseRpc,
  WsFilesystemGetMetadataRpc,
  WsFilesystemInspectFolderRpc,
  WsLayaSetupRpc,
  WsThreadSweepRunRpc,
  WsThreadSweepHandoffRpc,
  WsAgentSessionsScanRpc,
  WsAgentSessionsImportRpc,
  WsAssetsCreateUrlRpc,
  WsAssetsPersistChatAttachmentsRpc,
  WsAttachmentsCreateUploadUrlRpc,
  WsAttachmentsDeleteRpc,
  WsMcpAppsCallToolRpc,
  WsMcpAppsToolInfoRpc,
  WsMcpAppsReadResourceRpc,
  WsMcpAppsUpdateModelContextRpc,
  WsProviderUploadFeedbackRpc,
  WsSubscribeVcsStatusRpc,
  WsSubscribeWorktreeSetupRpc,
  WsWorktreeSetupCancelRpc,
  WsVcsPullRpc,
  WsVcsRefreshStatusRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsVcsListRefsRpc,
  WsVcsCreateWorktreeRpc,
  WsVcsRemoveWorktreeRpc,
  WsVcsCreateRefRpc,
  WsVcsSwitchRefRpc,
  WsVcsInitRpc,
  WsReviewGetDiffPreviewRpc,
  WsReviewGetDiffFileContentsRpc,
  WsTerminalOpenRpc,
  WsTerminalAttachRpc,
  WsTerminalObserveRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsSubscribeTerminalEventsRpc,
  WsSubscribeTerminalMetadataRpc,
  WsPreviewOpenRpc,
  WsPreviewNavigateRpc,
  WsPreviewResizeRpc,
  WsPreviewAdjustRpc,
  WsPreviewRefreshRpc,
  WsPreviewCloseRpc,
  WsPreviewListRpc,
  WsPreviewClearProfileRpc,
  WsPreviewReportProfilesRpc,
  WsPreviewReportStatusRpc,
  WsSubscribePreviewEventsRpc,
  WsPreviewStopLocalServerRpc,
  WsSubscribeDiscoveredLocalServersRpc,
  WsLocalVmListRpc,
  WsLocalVmConnectRpc,
  WsLocalVmPauseRpc,
  WsLocalVmReleaseRpc,
  WsLocalVmScreenshotRpc,
  WsLocalVmInputRpc,
  WsDeviceConfigureRpc,
  WsDeviceListRpc,
  WsDeviceTestHostRpc,
  WsDeviceEasAccountRpc,
  WsDeviceOpenRpc,
  WsDeviceCloseRpc,
  WsDeviceShutdownRpc,
  WsDeviceDetailRpc,
  WsDeviceActionRpc,
  WsSubscribeDeviceStateRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeAuthAccessRpc,
  WsSubscribeBackgroundPolicyRpc,
  WsSubscribeResourceTelemetryRpc,
  WsOrchestrationV2DispatchCommandRpc,
  WsOrchestrationV2GetWorkflowScriptRpc,
  WsOrchestrationV2StopWorkflowRpc,
  WsOrchestrationV2StopBackgroundCommandRpc,
  WsOrchestrationV2GetTurnItemRpc,
  WsOrchestrationV2GetTurnDiffRpc,
  WsOrchestrationV2GetFullThreadDiffRpc,
  WsOrchestrationV2SearchThreadsRpc,
  WsOrchestrationV2SearchThreadRpc,
  WsOrchestrationV2SearchThreadStreamRpc,
  WsOrchestrationV2GetArchivedShellSnapshotRpc,
  WsOrchestrationV2GetThreadProjectionRpc,
  WsOrchestrationV2GetThreadContextBreakdownRpc,
  WsOrchestrationV2LaunchThreadRpc,
  WsOrchestrationV2SubscribeArchivedShellRpc,
  WsOrchestrationV2SubscribeShellRpc,
  WsOrchestrationV2SubscribeThreadRpc,
  WsOrchestrationV2SubscribeCommandOutputRpc,
).middleware(RpcScopeAuthorization);
