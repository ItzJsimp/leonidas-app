import { ClientSettingsSchema, PROVIDER_DISPLAY_NAMES, ServerSettings } from "@t3tools/contracts";

/**
 * Usage events: the only data Leonidas can send about how the app is used.
 * Every event has a fixed name and a fixed list of numeric or enum fields, so a
 * prompt, a path or a file name can never enter a payload.
 */
export const USAGE_EVENT_NAMES = [
  "install_first_run",
  "app_opened",
  "session_duration",
  "setup_completed",
  "feature_used",
  "setup_started",
  "setup_step_completed",
  "setup_abandoned_at_step",
  "time_to_first_message",
  "aios_shape",
  "providers_connected",
  "messages_sent",
  "ui_element_clicked",
  "settings_changed",
  "error_shown",
  "crash",
  "update_downloaded",
  "update_installed",
  "feedback_sent",
] as const;
export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export const USAGE_FEATURE_IDS = [
  "chat",
  "tasks",
  "command_center",
  "pull_requests",
  "usage",
  "settings_general",
  "settings_providers",
  "settings_appearance",
  "settings_connections",
  "settings_integrations",
  "settings_keybindings",
  "settings_projects",
  "settings_scheduled_tasks",
] as const;
export type UsageFeatureId = (typeof USAGE_FEATURE_IDS)[number];

/** Driver kinds we may name in an event. Anything else is dropped. */
export const USAGE_PROVIDER_IDS: readonly string[] = Object.keys(PROVIDER_DISPLAY_NAMES);

/** Setting names from the settings schemas. Values are never read, only the name. */
export const USAGE_SETTING_KEYS: readonly string[] = [
  ...Object.keys(ServerSettings.fields),
  ...Object.keys(ClientSettingsSchema.fields),
].filter((key) => key !== "onboardingCompletedAt");

/** Elements that carry `data-usage-id`. A click on any other element is never reported. */
export const USAGE_UI_ELEMENT_IDS = [
  "new_thread",
  "model_picker",
  "open_settings",
  "open_tasks",
  "open_command_center",
  "open_usage",
  "add_provider",
  "send_feedback",
] as const;
export type UsageUiElementId = (typeof USAGE_UI_ELEMENT_IDS)[number];

export const USAGE_ERROR_KINDS = ["chunk_load", "server_unreachable", "other"] as const;
export type UsageErrorKind = (typeof USAGE_ERROR_KINDS)[number];

export const USAGE_SETUP_STEP_IDS = [
  "welcome",
  "connection",
  "agents",
  "skills",
  "keys",
  "import",
  "aios",
] as const;
export type UsageSetupStepId = (typeof USAGE_SETUP_STEP_IDS)[number];

const NUMERIC_FIELDS: Readonly<Record<UsageEventName, readonly string[]>> = {
  install_first_run: [],
  app_opened: ["days_since_install", "launch_count"],
  session_duration: ["seconds"],
  setup_completed: ["seconds_to_setup"],
  feature_used: [],
  setup_started: [],
  setup_step_completed: [],
  setup_abandoned_at_step: [],
  time_to_first_message: ["seconds"],
  // Booleans travel as 0 or 1.
  providers_connected: ["provider_count"],
  messages_sent: ["count"],
  ui_element_clicked: [],
  settings_changed: [],
  error_shown: [],
  crash: [],
  update_downloaded: [],
  update_installed: [],
  feedback_sent: [],
  aios_shape: ["aios_detected", "skills_count", "task_cards_count", "memory_files_present"],
};

export type UsageEventProperties = Readonly<Record<string, number | string>>;

/** Keep only the fields this event is allowed to carry, with safe values. */
export function sanitizeUsageProperties(
  name: UsageEventName,
  properties: Readonly<Record<string, unknown>> = {},
): UsageEventProperties {
  const clean: Record<string, number | string> = {};
  for (const key of NUMERIC_FIELDS[name]) {
    const value = properties[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      clean[key] = Math.round(value);
    }
  }
  if (name === "feature_used") {
    const feature = properties.feature;
    if ((USAGE_FEATURE_IDS as readonly unknown[]).includes(feature)) {
      clean.feature = feature as string;
    }
  }
  if (name === "providers_connected") {
    const list = Array.isArray(properties.providers) ? properties.providers : [];
    const known = [...new Set(list.filter((id) => USAGE_PROVIDER_IDS.includes(id as string)))];
    clean.providers = known.toSorted().join(",");
    clean.provider_count = known.length;
  }
  if (name === "error_shown") {
    const kind = properties.kind;
    if ((USAGE_ERROR_KINDS as readonly unknown[]).includes(kind)) clean.kind = kind as string;
  }
  if (name === "settings_changed") {
    const key = properties.key;
    if ((USAGE_SETTING_KEYS as readonly unknown[]).includes(key)) clean.key = key as string;
  }
  if (name === "ui_element_clicked") {
    const element = properties.element;
    if ((USAGE_UI_ELEMENT_IDS as readonly unknown[]).includes(element)) {
      clean.element = element as string;
    }
  }
  if (name === "setup_step_completed" || name === "setup_abandoned_at_step") {
    const step = properties.step;
    if ((USAGE_SETUP_STEP_IDS as readonly unknown[]).includes(step)) {
      clean.step = step as string;
    }
  }
  return clean;
}

/** True when the event has everything it needs to be worth sending. */
export function isCompleteUsageEvent(name: UsageEventName, props: UsageEventProperties): boolean {
  if (name === "feature_used") return typeof props.feature === "string";
  if (name === "setup_step_completed" || name === "setup_abandoned_at_step") {
    return typeof props.step === "string";
  }
  if (name === "settings_changed") return typeof props.key === "string";
  if (name === "error_shown") return typeof props.kind === "string";
  if (name === "ui_element_clicked") return typeof props.element === "string";
  if (name === "messages_sent") return typeof props.count === "number" && props.count >= 1;
  if (name === "time_to_first_message") return typeof props.seconds === "number";
  if (name === "session_duration") return typeof props.seconds === "number" && props.seconds >= 1;
  if (name === "setup_completed") return typeof props.seconds_to_setup === "number";
  return true;
}

/** Map a router pathname to a fixed feature id. Unknown routes return null. */
export function featureIdFromPathname(pathname: string): UsageFeatureId | null {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === undefined) return "chat";
  if (first === "settings") {
    const id = `settings_${(second ?? "general").replaceAll("-", "_")}`;
    return (USAGE_FEATURE_IDS as readonly string[]).includes(id) ? (id as UsageFeatureId) : null;
  }
  const id = first.replaceAll("-", "_");
  if ((USAGE_FEATURE_IDS as readonly string[]).includes(id)) return id as UsageFeatureId;
  // Thread and draft routes are chats.
  return first === "draft" || second !== undefined ? "chat" : null;
}

export function osFromUserAgent(userAgent: string): "windows" | "macos" | "linux" | "other" {
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macos";
  if (/Linux|X11/i.test(userAgent)) return "linux";
  return "other";
}

export function daysSince(fromMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fromMs) / 86_400_000));
}

export interface PostHogPayloadInput {
  readonly apiKey: string;
  readonly installId: string;
  readonly friendLabel: string;
  readonly event: UsageEventName;
  readonly properties: UsageEventProperties;
  readonly appVersion: string;
  readonly os: string;
  readonly timestamp: Date;
}

/** Body for POST https://eu.i.posthog.com/capture/. No IP, no URL, no user agent. */
export function buildPostHogPayload(input: PostHogPayloadInput) {
  const label = input.friendLabel.trim().slice(0, 40);
  return {
    api_key: input.apiKey,
    event: input.event,
    distinct_id: input.installId,
    timestamp: input.timestamp.toISOString(),
    properties: {
      ...input.properties,
      app_version: input.appVersion,
      os: input.os,
      $geoip_disable: true,
      $process_person_profile: false,
      ...(label.length > 0 ? { friend_label: label } : {}),
    },
  };
}
