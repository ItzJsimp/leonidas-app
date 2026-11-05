import { HOSTED_APP_CHANNEL } from "~/branding";
import { isElectron } from "~/env";
import { isMacPlatform, isWindowsPlatform, normalizeSearchText } from "~/lib/utils";
import { STATIC_KEYBINDING_COMMANDS, type KeybindingCommand } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { DEFAULT_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { commandLabel } from "./KeybindingsSettings.logic";
import {
  validateSettingsScopeSearch,
  type ResolvedSettingsScope,
  type SettingsScopeSearch,
} from "./settingsScope";

export type SettingsPath =
  | "/settings/projects"
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/chat"
  | "/settings/diffs"
  | "/settings/keybindings"
  | "/settings/snap-shot"
  | "/settings/providers"
  | "/settings/models"
  | "/settings/threads"
  | "/settings/browser"
  | "/settings/devices"
  | "/settings/scheduled-tasks"
  | "/settings/source-control"
  | "/settings/worktrees"
  | "/settings/environments"
  | "/settings/access"
  | "/settings/maintenance"
  | "/settings/labs"
  | "/settings/about"
  | "/settings/archived";

/**
 * Where a setting can be edited. Device-local rows have no scope: they render
 * at every selection. `project-defaults` rows accept project overrides, so
 * they are reachable from any server-backed selection.
 */
export type SettingsSearchScope =
  | "environment"
  | "environment-defaults"
  | "project-defaults"
  | "project"
  | "checkout"
  | "connections";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  /** Descriptions, option labels, and aliases people may remember instead of the title. */
  readonly searchTerms?: ReadonlyArray<string>;
  readonly scope?: SettingsSearchScope;
  // Its row only renders in the desktop app, so a browser result would land on
  // an anchor that isn't there.
  readonly desktopOnly?: boolean;
  readonly macOnly?: boolean;
  // Its row only renders on Windows desktop, so other desktop platforms must
  // not expose a result that points to a missing anchor.
  readonly windowsOnly?: boolean;
  // Its row renders only where the release channel can change: the desktop
  // app, or a hosted web build deployed with a channel.
  readonly releaseChannelOnly?: boolean;
  readonly cloudOnly?: boolean;
  readonly environmentOnly?: boolean;
  readonly providerSettingsOnly?: boolean;
  readonly macProviderSettingsOnly?: boolean;
  readonly localBackendManagementOnly?: boolean;
  readonly localEnvironmentOnly?: boolean;
  readonly wslAvailableOnly?: boolean;
  // Its row only renders while this environment's T3 Connect managed tunnel is on.
  readonly managedTunnelOnly?: boolean;
  /**
   * Sorts after every other match. Keybinding commands mirror rows on other
   * surfaces, so "model" must still lead with Default model, not Model Picker.
   */
  readonly secondary?: boolean;
  readonly requiresThreadAutoSettlement?: boolean;
}

export interface SettingsSearchAvailability {
  readonly localEnvironmentDisabled?: boolean;
  readonly hasCloudPublicConfig: boolean;
  readonly hasEnvironment: boolean;
  readonly hasProviderSettingsEnvironment: boolean;
  readonly hasMacProviderSettingsEnvironment: boolean;
  readonly canManageLocalBackend: boolean;
  readonly isWslSettingsRowVisible: boolean;
  readonly hasThreadAutoSettlement: boolean;
  readonly managedTunnelActive?: boolean;
}

/**
 * Section labels in sidebar order. The sidebar nav and the search-result
 * subtitles both render from this record, so each label exists once.
 */
export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/projects": "Project",
  "/settings/general": "General",
  "/settings/appearance": "Appearance",
  "/settings/chat": "Message box",
  "/settings/diffs": "Changes and pull requests",
  "/settings/keybindings": "Keyboard shortcuts",
  "/settings/snap-shot": "SnapShots",
  "/settings/providers": "AI services",
  "/settings/models": "Models",
  "/settings/threads": "Chats",
  "/settings/browser": "Browser",
  "/settings/devices": "Devices",
  "/settings/scheduled-tasks": "Scheduled tasks",
  "/settings/source-control": "Source control",
  "/settings/worktrees": "Separate copies",
  "/settings/environments": "Computers",
  "/settings/access": "Sharing and access",
  "/settings/maintenance": "Maintenance",
  "/settings/labs": "Labs",
  "/settings/about": "About",
  "/settings/archived": "Archived chats",
};

/**
 * Sidebar order, grouped by concern. A group without a heading is set apart by space alone.
 * Models sits beside AI services under Agents. The Project page shows only when a project or
 * checkout is selected, so the nav filters it out of its group.
 */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  readonly heading: string | null;
  readonly paths: ReadonlyArray<SettingsPath>;
}> = [
  {
    heading: null,
    paths: [
      "/settings/general",
      "/settings/appearance",
      "/settings/chat",
      "/settings/diffs",
      "/settings/keybindings",
      "/settings/snap-shot",
    ],
  },
  {
    heading: "Agents",
    paths: [
      "/settings/providers",
      "/settings/models",
      "/settings/threads",
      "/settings/browser",
      "/settings/devices",
      "/settings/scheduled-tasks",
    ],
  },
  {
    heading: "Code",
    paths: ["/settings/projects", "/settings/source-control", "/settings/worktrees"],
  },
  { heading: "Connections", paths: ["/settings/environments", "/settings/access"] },
  {
    heading: null,
    paths: ["/settings/maintenance", "/settings/labs", "/settings/about", "/settings/archived"],
  },
];

/** Anchor id of the first row bound to `command` on the Keybindings page. */
export function keybindingSearchAnchorId<Command extends KeybindingCommand>(command: Command) {
  return `keybinding-${command}` as const;
}

/**
 * One result per built-in command, alphabetical by label. The anchor is
 * the command's first row; default keys are searchable so "mod+b" lands on
 * Sidebar: Toggle. A command with no default binding may have no row, so it
 * points at the section instead.
 */
const KEYBINDING_SEARCH_ITEMS = STATIC_KEYBINDING_COMMANDS.toSorted((left, right) =>
  commandLabel(left).localeCompare(commandLabel(right)),
).map((command) => {
  const defaultKeys = DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map(
    (binding) => binding.key,
  );
  return {
    id: keybindingSearchAnchorId(command),
    title: commandLabel(command),
    to: "/settings/keybindings" as const,
    searchTerms: [command, ...defaultKeys],
    secondary: true,
    ...(defaultKeys.length === 0 ? { targetId: "keybindings" } : {}),
  };
});

/** Anchor id of a source control host's settings form on the Source Control page. */
export function sourceControlHostSettingsSearchId(kind: string) {
  return `source-control-host-${kind}` as const;
}

/** One result per host whose definition declares settings, searchable by its field titles. */
const SOURCE_CONTROL_HOST_SEARCH_ITEMS = sourceControlClients.definitions.flatMap((definition) =>
  definition.settings && definition.kind !== "github"
    ? [
        {
          id: sourceControlHostSettingsSearchId(definition.kind),
          title: `${definition.label} sign-in`,
          to: "/settings/source-control" as const,
          searchTerms: [
            `${definition.label} ${Object.keys(definition.settings.fields).join(" ")} token credentials sign in`,
          ],
          environmentOnly: true,
          scope: "environment-defaults" as const,
        },
      ]
    : [],
);

/**
 * Searchable settings and stable destinations, in result order. Rows with a
 * dedicated anchor render their id and title via `searchableSetting`; items
 * that may not be mounted point at their nearest stable section instead.
 */
export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "storage-worktree-keep-when",
    targetId: "storage-worktrees",
    title: "Keep separate copies that have changes",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "keep worktrees with local changes any local files uncommitted changes edited tracked files ignored env build output cleanup",
    ],
  },
  {
    id: "storage-delete-now",
    title: "Delete now",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: ["storage cleanup run now results report removed kept failed"],
  },
  {
    id: "storage-worktrees",
    title: "Separate copy cleanup",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: [
      "worktree cleanup disk storage delete deleted archived threads old inactive merged unchanged worktrees retention days project inherit off custom",
    ],
  },
  {
    id: "storage-worktrees-location",
    title: "Separate copy location",
    to: "/settings/worktrees",
    scope: "environment-defaults",
    searchTerms: ["worktree location worktree location folder directory path drive external disk"],
  },
  {
    id: "storage-artifacts",
    title: "Artifacts and logs",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: ["disk storage browser screenshots captures rotated logs cleanup retention"],
  },
  {
    id: "project-defaults",
    title: "Project defaults and project settings",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: [
      "project defaults and overrides model workspace environments projects inheritance checkout",
    ],
  },
  {
    id: "project-overview",
    title: "Project overview",
    to: "/settings/projects",
    searchTerms: ["name icon emoji image checkout remove delete"],
  },
  {
    id: "default-model",
    title: "Default model",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["new thread project provider reasoning effort"],
  },
  {
    id: "default-permissions",
    title: "Permissions",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: [
      "new thread default runtime mode supervised approvals auto accept edits full access",
    ],
  },
  {
    id: "reply-style",
    title: "Reply style",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["reply style preset tone dock tldr output format answer shape"],
  },
  {
    id: "color-scheme",
    title: "Color scheme",
    to: "/settings/appearance",
    searchTerms: ["appearance light dark system mode"],
    // The scheme tiles sit at the top of the Appearance section.
    targetId: "appearance",
  },
  {
    id: "theme",
    title: "Themes",
    to: "/settings/appearance",
    searchTerms: ["appearance colors palette custom import"],
    // Theme cards live directly under the scheme tiles; the section is the
    // stable scroll destination for both.
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    title: "Interface contrast",
    to: "/settings/appearance",
    searchTerms: ["colors borders interface contrast"],
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    title: "Glass opacity",
    to: "/settings/appearance",
    searchTerms: ["transparent transparency solid menus dialogs composer"],
  },
  {
    id: "setting-wallpaper",
    title: "Wallpaper",
    to: "/settings/appearance",
    searchTerms: ["background image picture photo upload blur brightness image contrast"],
  },
  {
    id: "setting-leonidas-grid",
    title: "Leonidas grid",
    to: "/settings/appearance",
    searchTerms: ["drafting background lines theme"],
  },
  {
    id: "setting-leonidas-glow",
    title: "Crimson glow",
    to: "/settings/appearance",
    searchTerms: ["ambient red light strength theme"],
  },
  {
    id: "setting-leonidas-reset",
    title: "Reset to Leonidas",
    to: "/settings/appearance",
    searchTerms: ["default theme restore grid glow"],
  },
  {
    id: "diff-color-scheme",
    title: "Colors for changes",
    to: "/settings/appearance",
    searchTerms: [
      "diff colors red green blue orange additions deletions changes counts palette colorblind",
    ],
  },
  {
    id: "chat-width",
    title: "Chat width",
    to: "/settings/appearance",
    searchTerms: ["wide full width column layout messages composer monitor"],
  },
  {
    id: "panel-animations",
    title: "Panel animations",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    title: "Build label",
    to: "/settings/appearance",
    searchTerms: ["environment identification dev nightly artwork pill label hide none"],
    // The setting is stage-dependent, so its parent section is the stable destination.
    targetId: "appearance-interface",
  },
  {
    id: "interface-font",
    title: "Interface font",
    to: "/settings/appearance",
    searchTerms: ["typography family size system sans"],
  },
  {
    id: "prompt-font",
    title: "Message font",
    to: "/settings/appearance",
    searchTerms: ["prompt font typography family size composer input"],
  },
  {
    id: "code-font",
    title: "Code font",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace code blocks diffs file previews"],
  },
  {
    id: "terminal-font",
    title: "Terminal font",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace output"],
  },
  {
    id: "font-smoothing",
    title: "Font smoothing",
    to: "/settings/appearance",
    searchTerms: ["typography text grayscale anti aliasing macos thin"],
    macOnly: true,
  },
  {
    id: "word-wrap",
    title: "Word wrap",
    to: "/settings/appearance",
    searchTerms: ["long lines code blocks tables diffs file previews"],
  },
  {
    id: "composer-context",
    title: "Message box context",
    to: "/settings/appearance",
    searchTerms: ["composer context"],
  },
  {
    id: "project-grouping",
    title: "Project grouping",
    to: "/settings/general",
    searchTerms: ["combine matching repositories environments sidebar"],
  },
  {
    id: "project-order",
    title: "Project order",
    to: "/settings/general",
    searchTerms: ["sort projects sidebar manual created recent"],
  },
  {
    id: "snooze-options",
    title: "Snooze options",
    to: "/settings/general",
    searchTerms: ["snooze presets times later tonight tomorrow next week remind"],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "snooze-limited-threads",
    title: "Pause chats that reach a usage limit",
    to: "/settings/threads",
    searchTerms: ["snooze limited threads usage quota rate limit reset wake recover continue"],
  },
  {
    id: "auto-resume-limited-threads",
    title: "Continue paused chats when the limit ends",
    to: "/settings/threads",
    searchTerms: ["auto-resume limited threads usage quota rate limit reset recover continue"],
  },
  {
    id: "route-light-delegated-tasks",
    title: "Send helper work to the cheapest capable model",
    to: "/settings/threads",
    searchTerms: [
      "route light delegated tasks subagent delegate cheap model quota cost autorouter",
    ],
  },
  {
    id: "subagent-free-tier-models",
    title: "Subagent models that start without asking",
    to: "/settings/threads",
    searchTerms: ["subagent spawn tier free confirm card approval premium model haiku opus cost"],
  },
  {
    id: "working-shelf",
    title: "Working section (beta)",
    to: "/settings/general",
    searchTerms: ["hide fold running monitoring threads inbox sidebar shelf"],
  },
  {
    id: "auto-settle-inactive-threads",
    title: "Mark inactive chats as done",
    to: "/settings/threads",
    searchTerms: ["auto-settle inactive threads sidebar inactivity days no activity automatically"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "auto-settle-merged-threads",
    title: "Mark merged chats as done",
    to: "/settings/threads",
    searchTerms: ["auto-settle merged threads pull request merge closed automatically sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "days-before-auto-settle",
    title: "Days of no activity before a chat is marked as done",
    to: "/settings/threads",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["days of inactivity before auto-settle thread timeout activity sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "cache-warnings",
    title: "Cache warnings and expiry notices",
    to: "/settings/maintenance",
    targetId: "notifications",
    searchTerms: [
      "cache caching ttl expiry snooze mute model effort account history reuse prompt tokens",
    ],
  },
  {
    id: "thread-notifications",
    title: "Chat notifications",
    to: "/settings/general",
    targetId: "notifications",
    searchTerms: [
      "thread notifications notification sound alert completion input approval desktop",
    ],
  },
  {
    id: "in-app-notifications",
    title: "In-app notifications",
    to: "/settings/general",
    targetId: "notifications",
    searchTerms: ["notification toast popup completion input approval failure"],
  },
  {
    id: "notification-quiet-hours",
    title: "Quiet hours",
    to: "/settings/general",
    targetId: "notifications",
    searchTerms: ["notification silence mute night do not disturb sleep sound alert"],
  },
  {
    id: "usage-warning",
    title: "Usage warning",
    to: "/settings/general",
    targetId: "notifications",
    searchTerms: ["usage limit quota percent subscription warn threshold session weekly"],
  },
  {
    id: "settings-backup",
    title: "Export and import settings",
    to: "/settings/maintenance",
    targetId: "about",
    searchTerms: ["backup restore transfer sync json file share baseline"],
  },
  {
    id: "start-with-computer",
    title: "Start with computer",
    to: "/settings/general",
    targetId: "about",
    desktopOnly: true,
    searchTerms: ["launch login startup boot open at login auto start"],
  },
  {
    id: "default-reasoning-effort",
    title: "Default reasoning effort",
    to: "/settings/threads",
    searchTerms: ["thinking effort low medium high reasoning level new chats"],
  },
  {
    id: "notification-volume",
    title: "Notification volume",
    to: "/settings/general",
    targetId: "notifications",
    searchTerms: ["notification sound loud quiet level"],
  },
  {
    id: "time-format",
    title: "Time format",
    to: "/settings/general",
    searchTerms: ["timestamp clock locale system browser os 12 hour 24 hour"],
  },
  {
    id: "response-streaming",
    title: "Show replies as they are written",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["response streaming output token paragraph buffered wait turn legacy"],
  },
  {
    id: "hide-whitespace-changes",
    title: "Hide space-only changes",
    to: "/settings/diffs",
    targetId: "diffs",
    searchTerms: ["hide whitespace changes diff ignore spaces edits default"],
  },
  {
    id: "default-diff-file-state",
    title: "Default state of changed files",
    to: "/settings/diffs",
    targetId: "diffs",
    searchTerms: [
      "default diff file state collapsed expanded collapse expand files pull request pr code tab",
    ],
  },
  {
    id: "diff-layout",
    title: "Layout of changes",
    to: "/settings/diffs",
    targetId: "diffs",
    searchTerms: ["diff layout stacked split side by side unified inline view"],
  },
  {
    id: "proactive-panels",
    title: "Proactive panels",
    to: "/settings/diffs",
    searchTerms: ["automatically open diff pull request pr right panel agent completion"],
  },
  {
    id: "skills-in-slash-menu",
    title: "Show skills in slash menu",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["command menu dollar $ slash /"],
  },
  {
    id: "suggest-skill-cap",
    title: "Skill limit for Auto-pick",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["auto-pick auto pick suggest button wand skills how many limit maximum"],
  },
  {
    id: "auto-pick-engine",
    title: "Auto-pick model",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["auto-pick skills model openrouter groq local ollama qwen free keyword engine"],
  },
  {
    id: "auto-pick-models",
    title: "Auto-pick model ids",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["auto-pick openrouter groq ollama model id slug"],
  },
  {
    id: "skill-folders",
    title: "Skill folders",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["group organize skills folders collections slash menu"],
  },
  {
    id: "prompt-prediction",
    title: "Message prediction",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["prompt prediction scribe history ghost text autocomplete tab suggestions"],
  },
  {
    id: "prompt-prediction-source",
    title: "Prediction source",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["prompt autocomplete free local cloud billing quota ollama"],
  },
  {
    id: "prompt-prediction-local-model",
    title: "Local prediction model",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["prompt autocomplete ollama offline"],
  },
  {
    id: "prompt-prediction-cloud-model",
    title: "Online prediction model",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["cloud prediction model prompt autocomplete cost provider subscription"],
  },
  {
    id: "prompt-prediction-cloud-limit",
    title: "Online prediction limit",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: ["cloud prediction limit prompt autocomplete budget requests usage hourly"],
  },
  {
    id: "composer-rich-text",
    title: "Rich text message box",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: [
      "rich text composer composer rich text tiptap bold italic markdown styled wysiwyg",
    ],
  },
  {
    id: "composer-collapse",
    title: "Shrink the message box when you scroll",
    to: "/settings/chat",
    targetId: "composer",
    searchTerms: [
      "collapse composer on scroll composer rest resting scroll wheel conversation timeline shrink minimize",
    ],
  },
  {
    id: "send-shortcut",
    title: "Send shortcut",
    to: "/settings/chat",
    searchTerms: ["enter return command ctrl multiline prompt new line composer"],
  },
  {
    id: "efficiency-profile",
    title: "Efficiency profile",
    to: "/settings/threads",
    searchTerms: ["economy balanced max tokens cost cheap routing model saving efficient"],
  },
  {
    id: "follow-up-behavior",
    title: "Sending a message during a reply",
    to: "/settings/chat",
    searchTerms: ["follow-up behavior queue steer running turn send default behavior composer"],
  },
  {
    id: "provider-update-checks",
    title: "AI service update checks",
    to: "/settings/maintenance",
    searchTerms: [
      "provider update checks installed cli versions newer available codex claude cursor grok opencode",
    ],
    scope: "environment-defaults",
  },
  {
    id: "continue-threads-after-server-update",
    title: "Continue chats after restarts",
    to: "/settings/maintenance",
    scope: "project-defaults",
    searchTerms: [
      "continue threads after restarts resume running active interrupted work restart reboot machine crash desktop update automatically",
    ],
  },
  {
    id: "background-activity",
    title: "Background activity",
    to: "/settings/maintenance",
    scope: "environment-defaults",
    searchTerms: [
      "balanced performance battery saver advanced git fetch provider health refresh host power monitor idle policy",
    ],
  },
  {
    id: "new-threads",
    title: "New chats",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["new threads default workspace mode draft local worktree"],
  },
  {
    id: "worktree-submodules",
    title: "Submodules",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: ["git submodule init recursive top-level none worktree t3.json"],
  },
  {
    id: "start-from-origin",
    title: "Start from origin",
    to: "/settings/worktrees",
    scope: "project-defaults",
    searchTerms: ["new worktrees latest matching remote branch local"],
  },
  {
    id: "add-project-starts-in",
    title: "Add project starts in",
    to: "/settings/threads",
    scope: "environment-defaults",
    searchTerms: ["base directory folder browser path home"],
  },
  {
    id: "unpin-confirmation",
    title: "Unpin confirmation",
    to: "/settings/general",
    searchTerms: ["ask before thread pinned section"],
  },
  {
    id: "archive-confirmation",
    title: "Archive confirmation",
    to: "/settings/general",
    searchTerms: ["ask before thread second click inline action"],
  },
  {
    id: "delete-confirmation",
    title: "Delete confirmation",
    to: "/settings/general",
    searchTerms: ["ask before thread chat history"],
  },
  {
    id: "quit-confirmation",
    title: "Quit shortcut",
    to: "/settings/general",
    searchTerms: ["confirmation desktop app exit direct hold double click press twice"],
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    title: "Model for writing text",
    to: "/settings/threads",
    scope: "project-defaults",
    searchTerms: [
      "text generation model generated thread titles source control content default provider",
    ],
  },
  {
    id: "thread-title-instructions",
    title: "Thread title instructions",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["generated thread titles prompt custom style naming rename regenerate"],
  },
  {
    id: "app-version",
    title: "Version",
    to: "/settings/about",
    searchTerms: ["about check for updates download install upgrade release"],
  },
  {
    id: "update-track",
    title: "Update type",
    to: "/settings/about",
    searchTerms: ["update track release channel stable latest nightly prerelease"],
    releaseChannelOnly: true,
  },
  {
    id: "cli-command",
    title: "Command line (advanced)",
    to: "/settings/about",
    searchTerms: ["cli terminal shell path install command line"],
    desktopOnly: true,
  },
  {
    id: "privacy-policy",
    title: "Privacy policy",
    to: "/settings/about",
    searchTerms: ["telemetry analytics usage data tracking legal opt out"],
  },
  {
    id: "open-source-licenses",
    title: "Open source licenses",
    to: "/settings/about",
  },
  {
    id: "legacy-plan-mode",
    title: "Plan mode (legacy)",
    to: "/settings/labs",
    searchTerms: ["build plan composer old"],
  },
  {
    id: "legacy-sidebar",
    title: "Sidebar (legacy)",
    to: "/settings/labs",
    searchTerms: ["project thread tree old flat list"],
  },
  {
    id: "keybindings",
    title: "Keyboard shortcuts",
    to: "/settings/keybindings",
    searchTerms: ["keybindings keyboard shortcuts hotkeys commands bindings json"],
  },
  ...KEYBINDING_SEARCH_ITEMS,
  {
    id: "snap-shot-enabled",
    title: "SnapShots",
    searchTerms: ["window capture screenshot"],
    to: "/settings/snap-shot",
  },
  {
    id: "snap-shot-accessibility",
    title: "Include app text",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: [
      "capture accessibility data text UI structure elements privacy omit agent context",
    ],
  },
  {
    id: "snap-shot-shortcut",
    title: "Capture shortcut",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-shortcut-action",
    title: "Shortcut action",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: ["snip screenshot region window overlay capture shortcut"],
  },
  {
    id: "snap-shot-sound",
    title: "Capture sound",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-flash",
    title: "Capture flash",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-animations",
    title: "Capture animations",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "providers",
    title: "AI services and accounts",
    to: "/settings/providers",
    searchTerms: [
      "providers agents cli codex claude cursor grok opencode antigravity google sign in sign out install subscription instances authentication api key models configuration binary path config directory endpoint arguments environment variables display name accent color custom favorite hidden auto compact",
    ],
  },
  {
    id: "usage-providers",
    title: "Usage by AI service",
    to: "/settings/providers",
    searchTerms: [
      "usage providers usage sources CLIProxyAPI CLI proxy hub quota subscription limits management key add remove",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "cursor-keychain-usage",
    title: "Cursor account usage",
    to: "/settings/providers",
    searchTerms: ["cursor macOS keychain usage tokens cost limits permission"],
    providerSettingsOnly: true,
    macProviderSettingsOnly: true,
  },
  {
    id: "provider-health-check-interval",
    title: "Status check interval",
    to: "/settings/providers",
    searchTerms: [
      "health check interval refresh availability versions auth state models background probes seconds off",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "agent-browser-access",
    title: "AI browser access",
    to: "/settings/browser",
    scope: "project-defaults",
    searchTerms: [
      "agent browser access allow disable enable open drive preview tools sessions project override",
    ],
  },
  {
    id: "device-hosts",
    title: "Computers that run devices",
    to: "/settings/devices",
    searchTerms: [
      "device hosts ssh remote simulator emulator ios android mac mini identity key connection",
    ],
  },
  {
    id: "agent-device-access",
    title: "AI device access",
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["agent device access allow simulator emulator ios android drive tools sessions"],
  },
  {
    id: "device-hub",
    title: "Device hub",
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["simulator emulator ios android install start"],
  },
  {
    id: "device-platform-support",
    title: "Simulator support",
    to: "/settings/devices",
    targetId: "devices",
    searchTerms: ["xcode android studio sdk avd runtime"],
  },
  {
    id: "browser-profiles",
    title: "Browser profiles",
    to: "/settings/browser",
    targetId: "browser",
  },
  {
    id: "browser-default-profile",
    title: "Default browser profile",
    to: "/settings/browser",
    targetId: "browser-profiles",
  },
  {
    id: "browser-default-viewport",
    title: "Default browser viewport",
    to: "/settings/browser",
    searchTerms: ["preview size width height device desktop mobile rotate"],
  },
  {
    id: "browser-default-zoom",
    title: "Default browser zoom",
    to: "/settings/browser",
    searchTerms: ["preview page scale tabs percent"],
  },
  {
    id: "browser-default-appearance",
    title: "Default browser appearance",
    to: "/settings/browser",
    searchTerms: ["preview color scheme light dark system os"],
  },
  {
    id: "browser-recording-frame-rate",
    title: "Browser recording frame rate",
    to: "/settings/browser",
  },
  {
    id: "browser-recording-key-presses",
    title: "Show key presses in recordings",
    to: "/settings/browser",
    searchTerms: ["browser preview keyboard shortcuts keystrokes overlay capture"],
  },
  {
    id: "browser-recording-mouse-presses",
    title: "Show mouse presses in recordings",
    to: "/settings/browser",
    searchTerms: ["browser preview clicks buttons drag overlay capture"],
  },
  {
    id: "browser-link-target",
    title: "Open links in",
    to: "/settings/browser",
    searchTerms: ["links default browser in-app browser external open"],
  },
  {
    id: "browser-auto-show-floating-preview",
    title: "Auto-show floating preview",
    to: "/settings/browser",
    searchTerms: ["agent opens browser device simulator pop into view hide"],
  },
  {
    id: "automatic-pull",
    title: "Automatically pull",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["auto pull default branch current checkout fast forward upstream"],
  },
  {
    id: "remove-agent-credits-on-merge",
    title: "Remove AI credit lines when merging",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: [
      "remove agent credits when merging pull request github squash co-authored-by attribution claude codex generated",
    ],
  },
  {
    id: "pull-request-merge-method",
    title: "Default merge method",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request merge squash rebase last selected"],
  },
  {
    id: "source-control",
    title: "Source control",
    to: "/settings/source-control",
    scope: "environment-defaults",
    searchTerms: [
      "version control git github gitlab forgejo gitea tea codeberg bitbucket azure devops hosting integrations credentials scan server environment",
    ],
  },
  {
    id: "git-fetch-interval",
    title: "Git fetch interval",
    to: "/settings/source-control",
    searchTerms: [
      "automatic remote branch refresh background credentials security keys seconds off",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "worktree-branch-naming",
    title: "Branch naming for separate copies",
    to: "/settings/source-control",
    searchTerms: [
      "worktree branch naming static semantic prefix custom prompt instructions feat fix refactor chore",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "github-accounts",
    title: "GitHub accounts and token",
    to: "/settings/source-control",
    searchTerms: [
      "github gh account login user host enterprise ghes switch multiple accounts disable sign in token personal access token pat api key credential",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  ...SOURCE_CONTROL_HOST_SEARCH_ITEMS,
  {
    id: "source-control-writing-style",
    title: "Source control writing style",
    to: "/settings/source-control",
    searchTerms: [
      "repository conventions conventional commits custom instructions change descriptions request titles",
    ],
    environmentOnly: true,
  },
  {
    id: "follow-change-request-templates",
    title: "Follow pull request templates",
    to: "/settings/source-control",
    searchTerms: [
      "follow change request templates repository pr pull request description structure",
    ],
    environmentOnly: true,
  },
  {
    id: "source-control-writer-model",
    title: "Model for source control text",
    to: "/settings/source-control",
    searchTerms: [
      "override generated commit change request pr titles descriptions branch bookmark",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "project-actions",
    title: "Actions",
    to: "/settings/projects",
    searchTerms: ["commands scripts setup run dev server checkout worktree t3.json import"],
  },
  {
    id: "environment-icon",
    title: "Computer icon",
    to: "/settings/environments",
    targetId: "connections-environment",
    searchTerms: [
      "environment icon machine glyph sidebar mac mini studio laptop desktop server cloud vm",
    ],
  },
  {
    id: "local-environment",
    title: "This computer",
    to: "/settings/environments",
    targetId: "connections-environment",
    searchTerms: [
      "this machine local environment turn off on disable enable local server agents remote only restart",
    ],
    desktopOnly: true,
  },
  {
    id: "network-access",
    title: "Network access",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["expose backend remote pairing local machine interfaces host restart"],
    localBackendManagementOnly: true,
  },
  {
    id: "tailscale-https",
    title: "Tailscale HTTPS",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["serve magicdns endpoint remote secure network"],
    desktopOnly: true,
    localBackendManagementOnly: true,
  },
  {
    id: "wsl-backend",
    title: "WSL",
    to: "/settings/access",
    searchTerms: [
      "wsl backend windows subsystem linux distro second server projects stop windows backend restart",
    ],
    desktopOnly: true,
    windowsOnly: true,
    localBackendManagementOnly: true,
    wslAvailableOnly: true,
  },
  {
    id: "t3-connect",
    localEnvironmentOnly: true,
    title: "Remote access",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["managed tunnel cloud other devices remote"],
    desktopOnly: true,
    cloudOnly: true,
  },
  {
    id: "hold-webhooks-while-offline",
    localEnvironmentOnly: true,
    title: "Keep webhook requests while offline",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["webhook automations offline queue mailbox t3 connect"],
    cloudOnly: true,
    managedTunnelOnly: true,
  },
  {
    id: "publish-agent-activity",
    localEnvironmentOnly: true,
    title: "Send AI activity to your phone",
    to: "/settings/access",
    targetId: "connections-environment",
    searchTerms: ["mobile push notifications live activities cloud tunnel"],
    cloudOnly: true,
  },
  {
    id: "connections-environment",
    title: "This computer",
    to: "/settings/environments",
    searchTerms: [
      "connections server backend local remote access administrative permissions scope pairing links qr code authorized clients sessions revoke endpoint",
    ],
  },
  {
    id: "remote-environments",
    title: "Computers",
    to: "/settings/environments",
    searchTerms: [
      "environments add pair backend host code ssh config agent tunnel saved t3 connect",
    ],
  },
  {
    id: "load-balancing",
    title: "Load balancing",
    to: "/settings/environments",
    searchTerms: [
      "automatic machine environment resources cpu memory capacity preference weight shared projects",
    ],
  },
  {
    id: "github-routing",
    title: "GitHub sharing",
    to: "/settings/access",
    searchTerms: ["pull request trusted environments shared credentials permissions read actions"],
  },
  {
    id: "archive",
    title: "Archived chats",
    to: "/settings/archived",
    searchTerms: ["archived threads restore reopen deleted history projects"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

const SETTINGS_CATEGORY_SCOPES: Readonly<Record<SettingsPath, SettingsSearchScope | null>> = {
  "/settings/projects": "project",
  "/settings/general": null,
  "/settings/appearance": null,
  "/settings/chat": null,
  "/settings/diffs": null,
  "/settings/snap-shot": null,
  // Keybindings fan out to the selection; Providers shows the representative
  // environment at any selection. Neither needs a particular scope to render.
  "/settings/keybindings": null,
  "/settings/providers": null,
  "/settings/models": null,
  "/settings/threads": "project-defaults",
  "/settings/browser": null,
  "/settings/devices": null,
  "/settings/source-control": "environment-defaults",
  "/settings/worktrees": "project-defaults",
  "/settings/maintenance": "environment-defaults",
  "/settings/environments": "connections",
  "/settings/access": "connections",
  "/settings/labs": null,
  "/settings/about": null,
  "/settings/scheduled-tasks": null,
  "/settings/archived": "project-defaults",
};

/** Search keeps the selected target. A missing row can explain its owning scope instead. */
export function getSettingsSearchTargetScope(targetId: string) {
  const items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS;
  const item =
    items.find((candidate) => candidate.id === targetId) ??
    items.find((candidate) => candidate.targetId === targetId);
  return item
    ? {
        title: item.title,
        scope: item.scope ?? SETTINGS_CATEGORY_SCOPES[item.to],
        ...(item.requiresThreadAutoSettlement ? { requiresThreadAutoSettlement: true } : {}),
      }
    : null;
}

interface AutoSettlementSearchEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: EnvironmentConnectionPhase };
  readonly serverConfig: {
    readonly environment: {
      readonly capabilities: { readonly threadAutoSettlement?: boolean };
    };
  } | null;
}

/** Discovery needs one capable environment; the selected page needs every connected target to support it. */
export function getThreadAutoSettlementSearchAvailability(
  environments: readonly AutoSettlementSearchEnvironment[],
  scope?: Pick<ResolvedSettingsScope, "kind" | "environmentIds">,
) {
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const eligibleEnvironmentIds = connected
    .filter(
      (environment) =>
        environment.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    )
    .map((environment) => environment.environmentId);
  const selected = connected.filter((environment) =>
    scope?.environmentIds.includes(environment.environmentId),
  );
  return {
    eligibleEnvironmentIds,
    isTargetAvailable:
      scope !== undefined &&
      scope.kind !== "unavailable" &&
      selected.length > 0 &&
      selected.every((environment) => eligibleEnvironmentIds.includes(environment.environmentId)),
  };
}

export function isSettingsSearchScopeAvailable(
  requiredScope: SettingsSearchScope | null,
  scopeKind: ResolvedSettingsScope["kind"],
): boolean {
  switch (requiredScope) {
    case null:
    case "connections":
      return true;
    case "environment":
    case "checkout":
      return requiredScope === scopeKind;
    case "project":
      return scopeKind === "project" || scopeKind === "checkout";
    case "environment-defaults":
      return scopeKind === "environment" || scopeKind === "all";
    case "project-defaults":
      return (
        scopeKind === "environment" ||
        scopeKind === "all" ||
        scopeKind === "project" ||
        scopeKind === "checkout"
      );
  }
}

function settingsScopeKindFromSearch(search: SettingsScopeSearch): ResolvedSettingsScope["kind"] {
  const target = validateSettingsScopeSearch({ ...search });
  if (target.checkout && !target.project) return "unavailable";
  if (target.project) return target.checkout ? "checkout" : "project";
  return target.machine ? "environment" : "all";
}

export function isSettingsOverviewVisible(search: SettingsScopeSearch): boolean {
  const kind = settingsScopeKindFromSearch(search);
  return kind === "project" || kind === "checkout";
}

/**
 * `id` and `title` props for the element a search item anchors to. Panels
 * spread (or pick from) this instead of restating the strings, so the catalog
 * and the rendered settings cannot drift apart.
 */
export function searchableSetting(id: SettingsSearchItemId): {
  readonly id: string;
  readonly title: string;
} {
  const { id: anchorId, title } = SEARCH_ITEMS_BY_ID.get(id)!;
  return { id: anchorId, title };
}

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
): ReadonlyArray<SettingsSearchItem> {
  const items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS;
  return items.filter(
    (item) =>
      (!item.cloudOnly || availability.hasCloudPublicConfig) &&
      (!item.environmentOnly || availability.hasEnvironment) &&
      (!item.providerSettingsOnly || availability.hasProviderSettingsEnvironment) &&
      (!item.macProviderSettingsOnly || availability.hasMacProviderSettingsEnvironment) &&
      (!item.localBackendManagementOnly || availability.canManageLocalBackend) &&
      (!item.localEnvironmentOnly || !availability.localEnvironmentDisabled) &&
      (!item.wslAvailableOnly || availability.isWslSettingsRowVisible) &&
      (!item.requiresThreadAutoSettlement || availability.hasThreadAutoSettlement) &&
      (!item.managedTunnelOnly || availability.managedTunnelActive === true),
  );
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const queryTokens = normalizedQuery.split(" ");
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;

  return items
    .flatMap((item, index) => {
      if (!isElectron && item.desktopOnly === true) return [];
      if (item.releaseChannelOnly && !isElectron && HOSTED_APP_CHANNEL === null) return [];
      if (item.macOnly && !isMacPlatform(platform)) return [];
      if (item.windowsOnly && !isWindowsPlatform(platform)) return [];

      const title = normalizeSearchText(item.title);
      const fields = [
        title,
        normalizeSearchText(SETTINGS_SECTION_LABELS[item.to]),
        ...(item.searchTerms ?? []).map(normalizeSearchText),
      ];
      if (!queryTokens.every((token) => fields.some((field) => field.includes(token)))) return [];

      const exactPhraseField = fields.findIndex((field) => field.includes(normalizedQuery));
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : exactPhraseField >= 0
                  ? 1
                  : 0;
      return [{ item, index, rank }];
    })
    .toSorted(
      (left, right) =>
        Number(left.item.secondary ?? false) - Number(right.item.secondary ?? false) ||
        right.rank - left.rank ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}
