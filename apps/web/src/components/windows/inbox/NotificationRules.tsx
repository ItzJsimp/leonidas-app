import type { FoldedFeedEvent } from "@t3tools/contracts";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
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
  unlockNotificationAudio,
} from "~/threadNotifications";

import { changedLabel } from "../../twoState/areaRows";
import { Tip } from "../../twoState/Tip";

function summarizeLabels(labels: ReadonlyArray<string>, fallback: string): string {
  if (labels.length === 0) return fallback;
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
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

/** Plain summary, quiet settings, and per-type rules in one panel. */
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
  const updateSettings = useUpdateClientSettings();

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
  const summary = { interrupting, quiet };

  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? groups
      : groups
          .map((group) => ({
            ...group,
            rows: group.rows.filter((row) =>
              [row.label, row.type, group.source].some((text) =>
                text.toLowerCase().includes(needle),
              ),
            ),
          }))
          .filter((group) => group.rows.length > 0);
  const custom = Object.keys(rules);
  const interruptsSummary =
    !inAppEnabled && mode === "off"
      ? "Nothing interrupts you right now."
      : summarizeLabels(summary.interrupting, "No types set to interrupt.");
  const quietSummary = summarizeLabels(summary.quiet, "None.");
  const quietHoursSummary = quietEnabled
    ? `${quietStart} to ${quietEnd} (sounds and system alerts paused)`
    : "Off";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Interrupts you
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{interruptsSummary}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Quiet in inbox
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{quietSummary}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            Quiet hours
          </p>
          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">
            {quietHoursSummary}
          </p>
        </div>
      </div>

      <section aria-label="Quiet settings" className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Quiet settings</h2>
        <div className="divide-y divide-border/60 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-sm text-foreground">In-app toasts</span>
            <Switch
              checked={inAppEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label="In-app toasts"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm text-foreground">System alerts and sound</span>
              {permissionMessage ? (
                <p className="mt-0.5 text-xs text-destructive-foreground">{permissionMessage}</p>
              ) : null}
            </div>
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-sm text-foreground">Quiet hours</span>
            <div className="flex flex-wrap items-center gap-2">
              {quietEnabled ? (
                <>
                  <Input
                    type="time"
                    size="sm"
                    className="w-28"
                    value={quietStart}
                    aria-label="Quiet hours start"
                    onChange={(event) => {
                      if (event.currentTarget.value) {
                        updateSettings({ notificationQuietHoursStart: event.currentTarget.value });
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="time"
                    size="sm"
                    className="w-28"
                    value={quietEnd}
                    aria-label="Quiet hours end"
                    onChange={(event) => {
                      if (event.currentTarget.value) {
                        updateSettings({ notificationQuietHoursEnd: event.currentTarget.value });
                      }
                    }}
                  />
                </>
              ) : null}
              <Switch
                checked={quietEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ notificationQuietHoursEnabled: checked })
                }
                aria-label="Quiet hours"
              />
            </div>
          </div>

          {hasNotificationSound(mode) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm text-foreground">Sound volume</span>
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
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Filter notification types"
          placeholder="Filter types or sources"
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
            <h2 className="flex items-baseline gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
              <span className="min-w-0 truncate">{group.source}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {group.rows.length} {group.rows.length === 1 ? "type" : "types"}
              </span>
            </h2>
            <ul className="divide-y divide-border/60">
              {group.rows.map((row) => (
                <li
                  key={row.type}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium">
                      <Tip text={row.type}>
                        <span
                          tabIndex={0}
                          className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {row.label}
                        </span>
                      </Tip>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {row.lastAt === null
                        ? "None yet"
                        : `${row.count.toLocaleString("en-US")} received · latest ${changedLabel(row.lastAt, now)}`}
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
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
