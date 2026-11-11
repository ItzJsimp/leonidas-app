import type {
  EditorId,
  EnvironmentId,
  ProjectScript,
  ResolvedKeybindingsConfig,
  ThreadId,
} from "@t3tools/contracts";

import type { DraftId } from "../../composerDraftStore";
import { useT3ProjectFileScripts } from "../../hooks/useT3ProjectFileScripts";
import { type EnvMode, type EnvironmentOption } from "../BranchToolbar.logic";
import { BranchToolbar } from "../BranchToolbar";
import GitActionsControl from "../GitActionsControl";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import type { ComponentProps } from "react";
import { ThreadDetailsCard } from "./ThreadDetailsCard";
import { OpenInPicker } from "./OpenInPicker";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { ThreadAutomationsPanel } from "./ThreadAutomationsPanel";
import { ThreadRelationshipsPanel } from "./ThreadRelationshipsControl";
import { ThreadServersPanel } from "./ThreadServersPanel";
import { ThreadDetailsContext } from "./ThreadDetailsContext";
import { ThreadDetailsLimits, type ThreadDetailsUsageProps } from "./ThreadDetailsUsage";

export interface ThreadDetailsPanelProps extends Pick<
  ComponentProps<typeof ThreadDetailsCard>,
  "anchor" | "handle" | "onPresentationChange"
> {
  forceNewWorktree?: boolean;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId?: DraftId;
  activeProjectName: string | undefined;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  showOpenInPicker: boolean;
  gitCwd: string | null;
  isGitRepo: boolean;
  envLocked: boolean;
  availableEnvironments: readonly EnvironmentOption[];
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  onEnvironmentChange: (environmentId: EnvironmentId) => void;
  onEnvModeChange: (mode: EnvMode) => void;
  /** The thread's env mode as ChatView resolves it. */
  envMode: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  startFromOrigin: boolean;
  onStartFromOriginChange: (startFromOrigin: boolean) => void;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest: () => void;
  onOpenChanges?: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
  /** Context window and account limits, shown below the run details. */
  usage: ThreadDetailsUsageProps;
}

export function ThreadDetailsPanel(props: ThreadDetailsPanelProps) {
  const fileScripts = useT3ProjectFileScripts(
    props.environmentId,
    props.activeProjectScripts ? props.gitCwd : null,
  );
  const branchToolbarProps = {
    showGitControls: props.isGitRepo,
    environmentId: props.environmentId,
    threadId: props.threadId,
    ...(props.draftId ? { draftId: props.draftId } : {}),
    onEnvModeChange: props.onEnvModeChange,
    startFromOrigin: props.startFromOrigin,
    onStartFromOriginChange: props.onStartFromOriginChange,
    envMode: props.envMode,
    ...(props.activeThreadBranchOverride !== undefined
      ? { activeThreadBranchOverride: props.activeThreadBranchOverride }
      : {}),
    ...(props.onActiveThreadBranchOverrideChange
      ? { onActiveThreadBranchOverrideChange: props.onActiveThreadBranchOverrideChange }
      : {}),
    envLocked: props.envLocked,
    forceNewWorktree: props.forceNewWorktree ?? false,
    onComposerFocusRequest: props.onComposerFocusRequest,
    ...(props.onCheckoutPullRequestRequest
      ? { onCheckoutPullRequestRequest: props.onCheckoutPullRequestRequest }
      : {}),
  };

  return (
    <ThreadDetailsCard
      threadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
      anchor={props.anchor}
      handle={props.handle}
      onPresentationChange={props.onPresentationChange}
    >
      {(density) => {
        // A short panel folds Context to one line, then trims Run. Limits folds only on request.
        const hasActions = (props.activeProjectScripts?.length ?? 0) > 0 || fileScripts.length > 0;
        return (
          <>
            <ThreadDetailsSection
              headingId="thread-details-run-heading"
              title="Run"
              separated={false}
            >
              <div className="flex flex-col">
                {density !== "essential" ? (
                  <BranchToolbar
                    layout="panel"
                    panelSection="workspace"
                    availableEnvironments={props.availableEnvironments}
                    onEnvironmentChange={props.onEnvironmentChange}
                    autoEnvironmentLabel={props.autoEnvironmentLabel}
                    onAutoEnvironment={props.onAutoEnvironment}
                    {...branchToolbarProps}
                  />
                ) : null}

                {density !== "essential" && props.showOpenInPicker ? (
                  <OpenInPicker
                    keybindings={props.keybindings}
                    environmentId={props.environmentId}
                    availableEditors={props.availableEditors}
                    openInCwd={props.gitCwd}
                    displayMode="panel"
                  />
                ) : null}

                {/* Project actions are saved terminal commands. Without any, only a tall panel
                    keeps the row that adds the first one. */}
                {props.activeProjectScripts &&
                (density === "full" || (density === "compact" && hasActions)) ? (
                  <ProjectScriptsControl
                    environmentId={props.environmentId}
                    displayMode="panel"
                    scripts={props.activeProjectScripts}
                    fileScripts={fileScripts}
                    preferredScriptId={props.preferredScriptId}
                    onRunScript={props.onRunProjectScript}
                    onAddScript={props.onAddProjectScript}
                    onUpdateScript={props.onUpdateProjectScript}
                    onDeleteScript={props.onDeleteProjectScript}
                  />
                ) : null}

                {props.gitCwd && props.isGitRepo ? (
                  <BranchToolbar layout="panel" panelSection="branch" {...branchToolbarProps} />
                ) : null}
                {props.gitCwd && props.activeProjectName ? (
                  <GitActionsControl
                    displayMode="panel"
                    compact={density === "essential"}
                    gitCwd={props.gitCwd}
                    activeThreadRef={{
                      environmentId: props.environmentId,
                      threadId: props.threadId,
                    }}
                    {...(props.draftId ? { draftId: props.draftId } : {})}
                    {...(props.onOpenChanges ? { onOpenChanges: props.onOpenChanges } : {})}
                  />
                ) : null}
              </div>
            </ThreadDetailsSection>

            <ThreadDetailsContext usage={props.usage} folded={density === "essential"} />
            <ThreadDetailsLimits usage={props.usage} />

            {density === "full" && !props.draftId ? (
              <ThreadServersPanel environmentId={props.environmentId} threadId={props.threadId} />
            ) : null}

            {density === "full" && !props.draftId ? (
              <ThreadAutomationsPanel
                environmentId={props.environmentId}
                threadId={props.threadId}
              />
            ) : null}

            {density === "full" && !props.draftId ? (
              <ThreadRelationshipsPanel
                environmentId={props.environmentId}
                threadId={props.threadId}
              />
            ) : null}
          </>
        );
      }}
    </ThreadDetailsCard>
  );
}
