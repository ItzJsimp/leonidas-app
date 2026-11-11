import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import {
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettings() {
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications")}
      description={
        permissionMessage ??
        "System alerts when a chat finishes, fails, or needs your answer or approval. Applies to this device while Leonidas is open."
      }
      control={
        <Select
          value={mode}
          disabled={requesting}
          onValueChange={async (value) => {
            if (
              value !== "off" &&
              value !== "notifications" &&
              value !== "sound" &&
              value !== "notifications-and-sound"
            )
              return;
            setPermissionMessage(null);
            if (hasNotificationSound(value)) unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionMessage(
                  "Notifications need a supported browser with HTTPS, or the desktop app. You can still choose Sound only.",
                );
                return;
              }
              setRequesting(true);
              const permission = await settlePromise(() => Notification.requestPermission());
              setRequesting(false);
              if (permission._tag === "Failure") {
                setPermissionMessage(
                  "This browser cannot show notifications. You can still choose Sound only.",
                );
                return;
              }
              if (permission.value !== "granted") {
                setPermissionMessage(
                  "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
                );
                return;
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Chat notifications">
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
      }
    />
  );
}

export function NotificationQuietHoursSettings() {
  const enabled = useScopedSettings((settings) => settings.notificationQuietHoursEnabled);
  const start = useScopedSettings((settings) => settings.notificationQuietHoursStart);
  const end = useScopedSettings((settings) => settings.notificationQuietHoursEnd);
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsRow
      {...searchableSetting("notification-quiet-hours")}
      description="Silence sounds and system alerts between these times. In-app toasts still appear."
      control={
        <div className="flex items-center gap-2">
          {enabled ? (
            <>
              <Input
                type="time"
                size="sm"
                className="w-28"
                value={start}
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
                value={end}
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
            checked={enabled}
            onCheckedChange={(checked) =>
              updateSettings({ notificationQuietHoursEnabled: checked })
            }
            aria-label="Quiet hours"
          />
        </div>
      }
    />
  );
}

const USAGE_WARNING_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "70", label: "At 70%" },
  { value: "80", label: "At 80%" },
  { value: "90", label: "At 90%" },
] as const;

export function UsageWarningSettings() {
  const percent = useScopedSettings((settings) => settings.usageWarningPercent);
  const updateSettings = useUpdateScopedSettings();
  const value = percent === null ? "off" : String(percent);
  const label =
    USAGE_WARNING_OPTIONS.find((option) => option.value === value)?.label ?? `At ${value}%`;

  return (
    <SettingsRow
      {...searchableSetting("usage-warning")}
      description="Show a notice above the message box when the busiest usage limit of your current AI account reaches this level."
      control={
        <Select
          value={value}
          onValueChange={(next) => {
            if (next === "off") updateSettings({ usageWarningPercent: null });
            else if (next) updateSettings({ usageWarningPercent: Number(next) });
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Usage warning">
            <SelectValue>{label}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {USAGE_WARNING_OPTIONS.map((option) => (
              <SelectItem key={option.value} hideIndicator value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function NotificationVolumeSettings() {
  const volume = useScopedSettings((settings) => settings.notificationVolume);
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsRow
      {...searchableSetting("notification-volume")}
      description="How loud notification sounds play on this device."
      control={
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
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {volume}%
          </span>
        </div>
      }
    />
  );
}
