// @effect-diagnostics nodeBuiltinImport:off - compiles real source files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { transform } from "oxc-transform-react";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);

// Leonidas files that bail out of the oxc compiler check (try/finally, refs during render, logical
// assignment). The build uses the Babel compiler, as before the T3 Code v0.1.1 merge; shrink this list
// as files are fixed. Follow-up: see the catch-up stage 1 card.
const KNOWN_BAILOUTS: ReadonlySet<string> = new Set([
  "components/BranchToolbar.tsx",
  "components/ChatView.tsx",
  "components/CommandPalette.tsx",
  "components/DiffPanel.tsx",
  "components/Sidebar.touch.ts",
  "components/Sidebar.tsx",
  "components/TerminalViewport.tsx",
  "components/chat/BenchmarkExplorer.tsx",
  "components/chat/ChatComposer.tsx",
  "components/chat/ComposerAutoPickSkillsButton.tsx",
  "components/chat/ComposerSavedItems.tsx",
  "components/chat/ComposerSnipButton.tsx",
  "components/chat/DoopAppFrame.tsx",
  "components/chat/GoalBannerActions.tsx",
  "components/chat/LeoTimelineUserMessageRow.tsx",
  "components/chat/LeoTimelineWorkGroupRows.tsx",
  "components/chat/MessagesTimeline.tsx",
  "components/chat/ProviderModelPicker.tsx",
  "components/chat/ProviderReadinessControl.tsx",
  "components/chat/ThreadGoalControls.tsx",
  "components/chat/UsageLimitRecoveryBanner.tsx",
  "components/chat/UsageOverlayCard.tsx",
  "components/chat/turnHandoff.tsx",
  "components/chat/useLeoComposerRestingTransition.ts",
  "components/chat/useLeoRestingComposerControlsLayout.ts",
  "components/chat/useStableHandoffRuns.ts",
  "components/desktop/DesktopUpdateCoordinator.tsx",
  "components/desktop/SnapShotCoordinator.tsx",
  "components/files/AttachmentFilePreview.tsx",
  "components/marketing/BatchApproval.tsx",
  "components/meetings/MeetingsLive.tsx",
  "components/onboarding/GuidanceCoach.tsx",
  "components/onboarding/WelcomeWizard.tsx",
  "components/onboarding/setup/SetupQuestionsScreen.tsx",
  "components/permissions/usePermissionStatus.ts",
  "components/pullRequest/LeonidasPullRequestsPage.tsx",
  "components/scribe/ScribeTranscriptsTab.tsx",
  "components/settings/ConnectionsSettings.tsx",
  "components/settings/DictationTriggerSettings.tsx",
  "components/settings/IntegrationsSettings.tsx",
  "components/settings/ModelsSettings.tsx",
  "components/settings/SettingsPanels.tsx",
  "components/settings/SharedBrowserSetting.tsx",
  "components/settings/useApiKeyField.ts",
  "components/sidebar/LeoSidebarDraftBlock.tsx",
  "components/sidebar/LeoSidebarThreadRow.tsx",
  "components/sidebar/SidebarSearchResultRow.tsx",
  "components/split/SplitDropOverlay.tsx",
  "components/split/useSplitActions.ts",
  "components/systemCare/useSystemCare.ts",
  "components/taskBoard/TaskPresence.tsx",
  "components/taskBoard/TaskRoadmap.tsx",
  "components/taskBoard/ValueMeterCard.tsx",
  "components/taskBoard/useSharedBoards.ts",
  "components/taskBoard/useTaskActions.ts",
  "components/twoState/useLiveArea.ts",
  "components/usage/UsagePage.tsx",
  "components/usageAnalytics/UsageAnalyticsCoordinator.tsx",
  "components/voice/ComposerVoiceButton.tsx",
  "components/voice/VoiceSetup.tsx",
  "components/windows/files/FilePreviewPane.tsx",
  "hooks/useSettings.ts",
]);

const webSourceFiles = NodeFS.readdirSync(NodePath.join(repoRoot, "apps/web/src"), {
  recursive: true,
})
  .map(String)
  .filter((file) => /\.tsx?$/.test(file) && !/\.(test|browser)\.tsx?$/.test(file))
  .filter((file) => !file.endsWith(".gen.ts"))
  .filter((file) => !KNOWN_BAILOUTS.has(file.replaceAll("\\", "/")))
  .map((file) => `apps/web/src/${file}`);

// Lint reports most compiler bailouts, but not every one (try/finally, throw
// inside try). A skipped file still builds, just unmemoized, so check the output.
describe("React Compiler coverage", () => {
  it.each(webSourceFiles)("compiles %s", async (file) => {
    const absolute = NodePath.join(repoRoot, file);
    const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
      jsx: { runtime: "automatic", development: false, refresh: false },
      reactCompiler: { reportDiagnostics: true },
    });
    const bailouts = result.errors.map((error) => error.codeframe ?? error.message);
    expect(bailouts).toEqual([]);
  });
}, 120_000);
