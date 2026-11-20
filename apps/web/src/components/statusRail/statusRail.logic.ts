import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import type { DesktopUpdateState, GameModeStatus, ServerProvider } from "@t3tools/contracts";

import { resolveUpdatePill, type UpdatePillKind } from "~/components/desktopUpdate.logic";
import { engineStrip, type ScribeLiveSnapshot } from "~/components/scribe/scribeLive.logic";
import { getOnboardingProviderState } from "~/onboarding/providerReadiness.logic";
import type { UpdateNoticeLevel } from "~/state/desktopUpdate";

export type RailStatusTone = "success" | "info" | "warning" | "error" | "update" | "muted";

export interface ScribeRailStatus {
  readonly tone: RailStatusTone;
  readonly shortLabel: string;
  readonly detailLabel: string;
  readonly tooltip: string;
  readonly canToggle: boolean;
}

export function deriveScribeRailStatus(input: {
  readonly hasEnvironment: boolean;
  readonly live: ScribeLiveSnapshot;
  readonly enabled: boolean | null;
  readonly builder?: boolean;
}): ScribeRailStatus {
  if (!input.hasEnvironment) {
    return {
      tone: "muted",
      shortLabel: "No server",
      detailLabel: "Connect to a server to check Leonidas Scribe.",
      tooltip: "Leonidas Scribe is unavailable until a server connects.",
      canToggle: false,
    };
  }
  const effectiveEnabled = input.enabled ?? true;
  const strip = engineStrip(input.live, input.builder ?? false, effectiveEnabled);
  if (input.live.connected === null) {
    return {
      tone: "muted",
      shortLabel: "Connecting",
      detailLabel: strip.label,
      tooltip: "Connecting to Leonidas Scribe. Select to view details.",
      canToggle: false,
    };
  }
  if (!input.live.connected) {
    return {
      tone: "error",
      shortLabel: "Offline",
      detailLabel: strip.label,
      tooltip: `${strip.label}. Select to open Scribe details.`,
      canToggle: false,
    };
  }
  switch (input.live.state) {
    case "listening":
      return {
        tone: "info",
        shortLabel: "Listening",
        detailLabel: "Listening for speech",
        tooltip: "Leonidas Scribe is listening now. Select to view details.",
        canToggle: input.enabled !== null,
      };
    case "processing":
      return {
        tone: "info",
        shortLabel: "Processing",
        detailLabel: "Transcribing dictation",
        tooltip: "Leonidas Scribe is processing audio. Select to view details.",
        canToggle: input.enabled !== null,
      };
    case "mic_error":
      return {
        tone: "warning",
        shortLabel: "Mic issue",
        detailLabel: input.live.lastError?.message ?? "Microphone problem",
        tooltip: "Leonidas Scribe reported a microphone problem. Select to inspect.",
        canToggle: input.enabled !== null,
      };
    case "ready":
    case null:
      if (input.enabled === false) {
        return {
          tone: "muted",
          shortLabel: "Off",
          detailLabel: "Dictation shortcuts are turned off.",
          tooltip:
            "Leonidas Scribe is off. Select to open details or flip the switch to turn it on.",
          canToggle: true,
        };
      }
      return {
        tone: "success",
        shortLabel: "On",
        detailLabel: "Listening for dictation shortcuts.",
        tooltip:
          "Leonidas Scribe is ready. Select to open details or flip the switch to turn it off.",
        canToggle: input.enabled !== null,
      };
  }
}

export interface EnvironmentRailStatus {
  readonly tone: RailStatusTone;
  readonly label: string;
  readonly tooltip: string;
}

export function deriveEnvironmentRailStatus(input: {
  readonly label: string | null;
  readonly phase: EnvironmentConnectionPhase | null;
  readonly networkStatus: "unknown" | "offline" | "online";
  readonly environmentCount: number;
  readonly displayUrl?: string | null;
}): EnvironmentRailStatus {
  const machine = input.label ?? "Server";
  const countSuffix = input.environmentCount > 1 ? ` (${input.environmentCount})` : "";
  if (input.networkStatus === "offline" || input.phase === "offline") {
    return {
      tone: "error",
      label: `${machine}: Offline`,
      tooltip: "Network is offline. Select to open environment settings.",
    };
  }
  switch (input.phase) {
    case "connected":
      return {
        tone: "success",
        label: `${machine}${countSuffix}`,
        tooltip: input.displayUrl
          ? `Connected to ${machine} (${input.displayUrl}). Select to manage servers.`
          : `Connected to ${machine}. Select to manage servers.`,
      };
    case "available":
    case "connecting":
      return {
        tone: "muted",
        label: `${machine}: Connecting`,
        tooltip: `Connecting to ${machine}. Select to inspect servers.`,
      };
    case "reconnecting":
      return {
        tone: "warning",
        label: `${machine}: Reconnecting`,
        tooltip: `Reconnecting to ${machine}. Select to inspect servers.`,
      };
    case "unsupported":
      return {
        tone: "warning",
        label: `${machine}: Update needed`,
        tooltip: `Server ${machine} needs an app or server update. Select to inspect.`,
      };
    case "error":
      return {
        tone: "error",
        label: `${machine}: Error`,
        tooltip: `Connection error on ${machine}. Select to open server settings.`,
      };
    case null:
      return {
        tone: "muted",
        label: "No server",
        tooltip: "No primary server connected. Select to open environment settings.",
      };
  }
}

export interface ProviderRailRow {
  readonly instanceId: string;
  readonly name: string;
  readonly state: ReturnType<typeof getOnboardingProviderState>;
  readonly tone: RailStatusTone;
  readonly statusLabel: string;
  readonly message: string | null;
}

export interface ProvidersRailStatus {
  readonly tone: RailStatusTone;
  readonly label: string;
  readonly tooltip: string;
  readonly rows: ReadonlyArray<ProviderRailRow>;
}

function providerStateMeta(state: ReturnType<typeof getOnboardingProviderState>): {
  readonly tone: RailStatusTone;
  readonly statusLabel: string;
} {
  switch (state) {
    case "ready":
      return { tone: "success", statusLabel: "Ready" };
    case "signIn":
      return { tone: "warning", statusLabel: "Sign in" };
    case "install":
      return { tone: "warning", statusLabel: "Not installed" };
    case "attention":
      return { tone: "error", statusLabel: "Attention" };
    case "checking":
      return { tone: "muted", statusLabel: "Checking" };
    case "disabled":
      return { tone: "muted", statusLabel: "Off" };
  }
}

export function deriveProvidersRailStatus(
  providers: ReadonlyArray<ServerProvider>,
): ProvidersRailStatus {
  const rows: ProviderRailRow[] = [];
  let ready = 0;
  let warnings = 0;
  let errors = 0;
  let checking = 0;

  for (const provider of providers) {
    const state = getOnboardingProviderState(provider);
    if (state === "disabled") continue;
    const meta = providerStateMeta(state);
    rows.push({
      instanceId: provider.instanceId,
      name: provider.displayName ?? provider.driver,
      state,
      tone: meta.tone,
      statusLabel: meta.statusLabel,
      message: provider.message ?? null,
    });
    if (state === "ready") ready += 1;
    else if (state === "attention") errors += 1;
    else if (state === "signIn" || state === "install") warnings += 1;
    else checking += 1;
  }

  const issues = warnings + errors;
  if (rows.length === 0) {
    return {
      tone: "muted",
      label: "Providers: None",
      tooltip: "No AI providers enabled. Select to view provider settings.",
      rows,
    };
  }
  if (errors > 0) {
    return {
      tone: "error",
      label: `Providers: ${ready}/${rows.length}`,
      tooltip: `${ready} ready, ${issues} need attention. Select to inspect providers.`,
      rows,
    };
  }
  if (warnings > 0) {
    return {
      tone: "warning",
      label: `Providers: ${ready}/${rows.length}`,
      tooltip: `${ready} ready, ${warnings} need sign-in or setup. Select to inspect providers.`,
      rows,
    };
  }
  if (checking > 0 && ready === 0) {
    return {
      tone: "muted",
      label: "Providers: Checking",
      tooltip: "Checking AI provider readiness. Select to view details.",
      rows,
    };
  }
  return {
    tone: "success",
    label: `Providers: ${ready} ready`,
    tooltip: `${ready} AI ${ready === 1 ? "provider is" : "providers are"} ready. Select to inspect.`,
    rows,
  };
}

export interface AgentsRailStatus {
  readonly tone: RailStatusTone;
  readonly label: string;
  readonly tooltip: string;
}

export function deriveAgentsRailStatus(input: {
  readonly running: number | null;
}): AgentsRailStatus {
  const running = input.running ?? 0;
  if (running > 0) {
    return {
      tone: "info",
      label: `${running} running`,
      tooltip: `${running} active agent ${running === 1 ? "run" : "runs"}. Select to open Command Center.`,
    };
  }
  return {
    tone: "muted",
    label: "Agents idle",
    tooltip: "No agent runs in progress. Select to open Command Center.",
  };
}

export interface UpdateRailStatus {
  readonly tone: RailStatusTone;
  readonly label: string;
  readonly tooltip: string;
  readonly kind: UpdatePillKind | null;
}

export function deriveUpdateRailStatus(input: {
  readonly isElectron: boolean;
  readonly state: DesktopUpdateState | null;
  readonly noticeLevel: UpdateNoticeLevel;
  readonly versionLabel: string;
}): UpdateRailStatus {
  const kind = input.isElectron ? resolveUpdatePill(input.state, input.noticeLevel) : null;
  if (kind === "ready") {
    return {
      kind,
      tone: "update",
      label: "Update ready",
      tooltip: "An update is ready to install. Select to see release notes and update options.",
    };
  }
  if (kind === "downloading") {
    const percent = input.state?.downloadPercent;
    const suffix = typeof percent === "number" ? ` ${Math.round(percent)}%` : "";
    return {
      kind,
      tone: "update",
      label: `Updating${suffix}`,
      tooltip: "Downloading a Leonidas update in the background. Select to view release history.",
    };
  }
  if (kind === "paused") {
    return {
      kind,
      tone: "warning",
      label: "Update paused",
      tooltip: "The last update download stopped. Select to inspect release status.",
    };
  }
  return {
    kind: null,
    tone: "muted",
    label: `v${input.versionLabel}`,
    tooltip: "Version of Leonidas. Select to see what changed in each update.",
  };
}

export interface GameModeRailStatus {
  readonly tone: RailStatusTone;
  readonly label: string;
  readonly tooltip: string;
}

const GAME_MODE_LABEL = { auto: "Auto", on: "On", off: "Off" } as const;

export function deriveGameModeRailStatus(status: GameModeStatus | null): GameModeRailStatus {
  if (status === null) {
    return {
      tone: "muted",
      label: "Game Mode",
      tooltip: "Reading Game Mode status. Select to inspect or change.",
    };
  }
  if (status.error !== null) {
    return {
      tone: "warning",
      label: "Game Mode: Issue",
      tooltip: `Game Mode could not be read: ${status.error}. Select to retry.`,
    };
  }
  if (status.mode === "on") {
    return {
      tone: "info",
      label: `Game Mode: ${GAME_MODE_LABEL[status.mode]}`,
      tooltip: `Game Mode is On (${status.level}). Select to adjust mode.`,
    };
  }
  if (status.mode === "off") {
    return {
      tone: "muted",
      label: "Game Mode: Off",
      tooltip: "Game Mode is Off. Select to turn Auto or On back on.",
    };
  }
  return {
    tone: status.watcher ? "success" : "muted",
    label: `Game Mode: ${GAME_MODE_LABEL[status.mode]}`,
    tooltip: status.watcher
      ? `Game Mode is Auto (${status.level}). Select to change.`
      : "Game Mode is Auto (watcher paused). Select to inspect.",
  };
}
