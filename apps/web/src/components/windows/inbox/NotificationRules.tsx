import type { FoldedFeedEvent } from "@t3tools/contracts";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { Link } from "@tanstack/react-router";
import { BellRingIcon, Volume2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  useClientSettings,
  usePrimarySettings,
  usePrimarySettingsAvailable,
  useUpdateClientSettings,
  useUpdatePrimarySettings,
} from "~/hooks/useSettings";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { toastManager } from "~/components/ui/toast";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { useEventFeedStore } from "~/eventFeedStore";
import { NOTIFICATION_RULES, type NotificationRule, ruleGroups } from "~/notificationRules";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  playNotificationSound,
  unlockNotificationAudio,
} from "~/threadNotifications";

import { changedLabel } from "../../twoState/areaRows";
import { Tip } from "../../twoState/Tip";

const USAGE_WARNING_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "70", label: "At 70%" },
  { value: "80", label: "At 80%" },
  { value: "90", label: "At 90%" },
] as const;

function summarizeLabels(labels: ReadonlyArray<string>, fallback: string): string {
  if (labels.length === 0) return fallback;
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

function SettingRow({
  title,
  description,
  note,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly note?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {note ? <p className="mt-0.5 text-xs text-destructive-foreground">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Toast, Inbox only or Off for one event type. The change saves at once. */
export function RuleControl({
  type,
  label,
  rule,
  onPick,
}: {
  readonly type: string;
  readonly label: string;
  readonly rule: NotificationRule;
  readonly onPick?: (rule: NotificationRule, before: NotificationRule | null) => void;
}) {
  const setTypeRule = useEventFeedStore((store) => store.setTypeRule);
  return (
    <ToggleGroup
      aria-label={`${label}: delivery rule`}
      value={[rule]}
      onValueChange={(next) => {
        const value = NOTIFICATION_RULES.find((option) => option.id === next[0])?.id;
        if (value === undefined || value === rule) return;
        const before = useEventFeedStore.getState().typeRules[type] ?? null;
        setTypeRule(type, value);
        onPick?.(value, before);
      }}
      className="shrink-0"
    >
      {NOTIFICATION_RULES.map((option) => (
        <Tip key={option.id} text={option.tip}>
          <Toggle value={option.id}>{option.label}</Toggle>
        </Tip>
      ))}
    </ToggleGroup>
  );
}

/** Delivery guide, device alert settings, and per-type notification rules in one panel. */
export function NotificationRules({
  events,
  now,
}: {
  readonly events: ReadonlyArray<FoldedFeedEvent>;
  readonly now: number;
}) {
  const rules = useEventFeedStore((store) => store.typeRules);
  const setTypeRule = useEventFeedStore((store) => store.setTypeRule);
  const inAppEnabled = useClientSettings((settings) => settings.inAppNotificationsEnabled);
  const mode = useClientSettings((settings) => settings.notificationMode);
  const quietEnabled = useClientSettings((settings) => settings.notificationQuietHoursEnabled);
  const quietStart = useClientSettings((settings) => settings.notificationQuietHoursStart);
  const quietEnd = useClientSettings((settings) => settings.notificationQuietHoursEnd);
  const volume = useClientSettings((settings) => settings.notificationVolume);
  const usageWarningPercent = useClientSettings((settings) => settings.usageWarningPercent);
  const snoozeLimitedThreads = usePrimarySettings((settings) => settings.snoozeLimitedThreads);
  const primarySettingsAvailable = usePrimarySettingsAvailable();
  const updateSettings = useUpdateClientSettings();
  const updatePrimarySettings = useUpdatePrimarySettings();

  const [query, setQuery] = useState("");
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const groups = ruleGroups(events, rules);
  const interrupting: string[] = [];
  const quiet: string[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.rule === "toast") interrupting.push(row.label);
      else if (row.rule === "inbox") quiet.push(row.label);
    }
  }

  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? groups
      : groups
          .map((group) => ({
            ...group,
            rows: group.rows.filter((row) =>
              [row.label, row.description, row.type, row.latestTitle ?? "", group.source].some(
                (text) => text.toLowerCase().includes(needle),
              ),
            ),
          }))
          .filter((group) => group.rows.length > 0);

  const custom = Object.keys(rules);
  const interruptsSummary =
    !inAppEnabled && mode === "off"
      ? "Nothing interrupts you right now."
      : summarizeLabels(interrupting, "No types set to Toast.");
  const quietSummary = summarizeLabels(quiet, "None.");
  const quietHoursSummary = quietEnabled
    ? `${quietStart} to ${quietEnd} (sounds and system alerts paused)`
    : "Off";
  const usageWarningValue = usageWarningPercent === null ? "off" : String(usageWarningPercent);
  const usageWarningLabel =
    USAGE_WARNING_OPTIONS.find((option) => option.value === usageWarningValue)?.label ??
    `At ${usageWarningValue}%`;

  const sendTestToast = () => {
    toastManager.add({
      type: "info",
      title: "Sample Leonidas toast",
      description: "Types set to Toast appear like this while Leonidas is open.",
      data: {
        hideCopyButton: true,
        leadingIcon: <BellRingIcon aria-hidden className="size-4 text-info-foreground" />,
      },
    });
    if (hasNotificationSound(mode)) {
      unlockNotificationAudio();
      void playNotificationSound("completion", () => true, volume);
    }
  };

  const playTestSound = () => {
    unlockNotificationAudio();
    void playNotificationSound("input", () => true, volume);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ["Interrupts you", interruptsSummary, false],
            ["Quiet in inbox", quietSummary, false],
            ["Quiet hours", quietHoursSummary, true],
          ] as const
        ).map(([heading, text, tabular]) => (
          <div key={heading} className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
              {heading}
            </p>
            <p
              className={`mt-1 text-sm font-medium text-foreground${tabular ? " tabular-nums" : ""}`}
            >
              {text}
            </p>
          </div>
        ))}
      </div>

      <section
        aria-label="How delivery rules work"
        className="rounded-xl border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">How each delivery rule works</h2>
          <Button size="xs" variant="outline" onClick={sendTestToast}>
            <BellRingIcon aria-hidden className="size-3.5" />
            Send test toast
          </Button>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {NOTIFICATION_RULES.map((option) => (
            <div key={option.id} className="p-3.5">
              <p className="text-xs font-semibold text-foreground">{option.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.tip}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-label="Delivery and alert settings"
        className="rounded-xl border border-border bg-card"
      >
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">
          Delivery and alert settings
        </h2>
        <div className="divide-y divide-border/60 px-4">
          <SettingRow
            title="In-app toasts"
            description="Show pop-up banners inside Leonidas for notification types set to Toast."
          >
            <Switch
              checked={inAppEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label="In-app toasts"
            />
          </SettingRow>

          <SettingRow
            title="System alerts and sound"
            description="Desktop alerts when Leonidas is hidden, plus sound for types set to Toast."
            note={permissionMessage}
          >
            <Select
              value={mode}
              disabled={requesting}
              onValueChange={async (value) => {
                if (
                  value !== "off" &&
                  value !== "notifications" &&
                  value !== "sound" &&
                  value !== "notifications-and-sound"
                ) {
                  return;
                }
                setPermissionMessage(null);
                if (hasNotificationSound(value)) unlockNotificationAudio();
                if (hasDesktopNotifications(value)) {
                  if (typeof Notification === "undefined" || !window.isSecureContext) {
                    setPermissionMessage(
                      "System alerts require HTTPS or the desktop app. Choose Sound only instead.",
                    );
                    return;
                  }
                  setRequesting(true);
                  const permission = await settlePromise(() => Notification.requestPermission());
                  setRequesting(false);
                  if (permission._tag === "Failure" || permission.value !== "granted") {
                    setPermissionMessage(
                      "Allow notifications in browser or system settings, then select this option again.",
                    );
                    return;
                  }
                }
                updateSettings({ notificationMode: value });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-52"
                aria-label="System alerts and sound"
              >
                <SelectValue>{NOTIFICATION_MODE_LABELS[mode]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {Object.entries(NOTIFICATION_MODE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} hideIndicator value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </SettingRow>

          <SettingRow
            title="Quiet hours"
            description="Pause sounds and system alerts during this window. In-app toasts still appear."
          >
            <div className="flex flex-wrap items-center gap-2">
              {quietEnabled
                ? (
                    [
                      ["Quiet hours start", quietStart, "notificationQuietHoursStart"],
                      ["Quiet hours end", quietEnd, "notificationQuietHoursEnd"],
                    ] as const
                  ).map(([label, val, key], index) => (
                    <span key={key} className="inline-flex items-center gap-2">
                      {index === 1 ? (
                        <span className="text-xs text-muted-foreground">to</span>
                      ) : null}
                      <Input
                        type="time"
                        size="sm"
                        className="w-28"
                        value={val}
                        aria-label={label}
                        onChange={(event) => {
                          if (event.currentTarget.value)
                            updateSettings({ [key]: event.currentTarget.value });
                        }}
                      />
                    </span>
                  ))
                : null}
              <Switch
                checked={quietEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ notificationQuietHoursEnabled: checked })
                }
                aria-label="Quiet hours"
              />
            </div>
          </SettingRow>

          {hasNotificationSound(mode) ? (
            <SettingRow
              title="Sound volume"
              description="Volume for notification chimes on this device."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={volume}
                  aria-label="Notification volume"
                  className="w-32 accent-primary"
                  onChange={(event) =>
                    updateSettings({ notificationVolume: Number(event.currentTarget.value) })
                  }
                />
                <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                  {volume}%
                </span>
                <Button size="xs" variant="ghost-muted" onClick={playTestSound}>
                  <Volume2Icon aria-hidden className="size-3.5" />
                  Test
                </Button>
              </div>
            </SettingRow>
          ) : null}

          <SettingRow
            title="Usage warning banner"
            description="Show a notice above the chat box when your active AI account approaches its limit."
          >
            <Select
              value={usageWarningValue}
              onValueChange={(next) => {
                if (next === "off") updateSettings({ usageWarningPercent: null });
                else if (next) updateSettings({ usageWarningPercent: Number(next) });
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Usage warning banner">
                <SelectValue>{usageWarningLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {USAGE_WARNING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} hideIndicator value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </SettingRow>

          <SettingRow
            title="Auto-snooze rate-limited chats"
            description="Automatically snooze a chat when it pauses on an AI usage limit so it stops alerting."
          >
            <Switch
              checked={snoozeLimitedThreads}
              disabled={!primarySettingsAvailable}
              onCheckedChange={(checked) =>
                updatePrimarySettings({ snoozeLimitedThreads: checked })
              }
              aria-label="Auto-snooze rate-limited chats"
            />
          </SettingRow>

          <SettingRow
            title="Phone notifications"
            description="Send AI chat activity to phone push notifications and Live Activities via Cloud Link."
          >
            <Button size="xs" variant="outline" render={<Link to="/settings/connections" />}>
              Manage in Connections
            </Button>
          </SettingRow>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Filter notification types"
          placeholder="Filter types, descriptions, or sources"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={custom.length === 0}
          onClick={() => {
            const before = { ...rules };
            for (const type of custom) setTypeRule(type, null);
            const toastId = toastManager.add({
              type: "success",
              title: "Rules reset to defaults",
              actionProps: {
                children: "Undo",
                onClick: () => {
                  for (const [type, rule] of Object.entries(before)) setTypeRule(type, rule);
                  toastManager.close(toastId);
                },
              },
            });
          }}
        >
          Reset all
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No types match.</p>
      ) : (
        shown.map((group) => (
          <section
            key={group.source}
            aria-label={group.source}
            className="rounded-xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="min-w-0 truncate">{group.source}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {group.rows.length} {group.rows.length === 1 ? "type" : "types"}
                  </span>
                </h2>
                {group.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
                ) : null}
              </div>
              {group.manageTo && group.manageLabel ? (
                <Button size="xs" variant="ghost-muted" render={<Link to={group.manageTo} />}>
                  {group.manageLabel}
                </Button>
              ) : null}
            </div>
            <ul className="divide-y divide-border/60">
              {group.rows.map((row) => {
                const showExample =
                  row.latestTitle !== null &&
                  row.latestTitle.trim().toLowerCase() !== row.label.trim().toLowerCase() &&
                  !row.type.startsWith("agent.") &&
                  !row.type.startsWith("watcher.");
                return (
                  <li
                    key={row.type}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="text-sm font-medium">
                        <Tip text={`Event ID: ${row.type}`}>
                          <span
                            tabIndex={0}
                            className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {row.label}
                          </span>
                        </Tip>
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {row.description}
                      </p>
                      <p className="mt-1 text-2xs text-muted-foreground tabular-nums">
                        {row.lastAt === null
                          ? "None yet"
                          : `${row.count.toLocaleString("en-US")} received · latest ${changedLabel(row.lastAt, now)}`}
                        {showExample ? ` · e.g. ${row.latestTitle}` : ""}
                      </p>
                    </div>
                    {row.isDefault ? null : (
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        onClick={() => setTypeRule(row.type, null)}
                      >
                        Reset
                      </Button>
                    )}
                    <RuleControl type={row.type} label={row.label} rule={row.rule} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
