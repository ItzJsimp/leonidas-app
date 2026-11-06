import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthDiagnosticsReadScope,
  AuthEnvironmentMaintainScope,
  AuthFilesystemReadScope,
  AuthFilesystemWriteScope,
  type AuthGrantScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthProvidersManageScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
} from "@t3tools/contracts";

export const AUTH_SCOPE_OPTIONS: ReadonlyArray<{
  readonly scope: AuthGrantScope;
  readonly title: string;
  readonly description: string;
}> = [
  {
    scope: AuthOrchestrationReadScope,
    title: "View this computer",
    description: "Read chats, status, save points, and settings.",
  },
  {
    scope: AuthOrchestrationOperateScope,
    title: "Run tasks",
    description: "Start, change, and stop tasks.",
  },
  {
    scope: AuthSettingsWriteScope,
    title: "Change settings",
    description: "Change settings and keyboard shortcuts on this computer.",
  },
  {
    scope: AuthProvidersManageScope,
    title: "Manage AI services",
    description: "Set up, install, sign in to, and update AI services. See how much you used.",
  },
  {
    scope: AuthEnvironmentMaintainScope,
    title: "Keep this computer running",
    description: "Update Leonidas and restart its background parts.",
  },
  {
    scope: AuthPreviewOperateScope,
    title: "Control previews",
    description: "Open browser previews and let the AI use the browser.",
  },
  {
    scope: AuthDiagnosticsReadScope,
    title: "View health and usage",
    description: "Read health checks, past use of memory and power, and how much you used.",
  },
  {
    scope: AuthTerminalReadScope,
    title: "View terminals",
    description: "Read what open terminals show.",
  },
  {
    scope: AuthTerminalOperateScope,
    title: "Use terminals",
    description: "Open terminals and type into them.",
  },
  {
    scope: AuthSourceControlWriteScope,
    title: "Change Git and code services",
    description: "Commit, push, manage branches, and change pull requests.",
  },
  {
    scope: AuthFilesystemReadScope,
    title: "Read files",
    description: "Browse files, search projects, and see changes.",
  },
  {
    scope: AuthFilesystemWriteScope,
    title: "Write files",
    description: "Edit project files and save plans.",
  },
  {
    scope: AuthAccessReadScope,
    title: "View access",
    description: "See connection links and the devices that can connect.",
  },
  {
    scope: AuthAccessWriteScope,
    title: "Manage access",
    description: "Give other devices access, or take it away.",
  },
  {
    scope: AuthRelayReadScope,
    title: "View remote access",
    description: "See the state of remote access connections.",
  },
  {
    scope: AuthRelayWriteScope,
    title: "Manage remote access",
    description: "Change remote access connections.",
  },
];
