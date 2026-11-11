import { ChevronDownIcon, MicIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  audioSummary,
  chosenApps,
  type AudioChoice,
  type AudioDevice,
  NO_SOURCES,
  type AudioSources,
} from "./meetings.logic";

const SYSTEM_DEFAULT = "default";

/** Choose the mic and the call audio a meeting records. The choice is saved for the next meeting. */
export function MeetingAudioPanel(props: {
  readonly sources: AudioSources;
  readonly choice: AudioChoice;
  readonly detected: string | null;
  readonly onChange: (choice: AudioChoice) => void;
}) {
  const { sources, choice, detected, onChange } = props;
  const apps = chosenApps(choice, detected, sources);
  const all = apps.length === 0;
  // A saved app that is not running now still shows, so the user can see it and clear it.
  const rows = [
    ...[...sources.apps].sort((a, b) => Number(b.playing) - Number(a.playing)),
    ...choice.apps
      .filter((name) => !sources.apps.some((app) => app.name === name))
      .map((name) => ({ name, playing: false })),
  ];

  const toggleApp = (name: string, on: boolean) =>
    onChange({
      ...choice,
      all: false,
      apps: on ? [...choice.apps, name] : choice.apps.filter((app) => app !== name),
    });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="xs" variant="outline" aria-label="Audio for this meeting">
            <MicIcon aria-hidden />
            <span className="max-w-72 truncate">{audioSummary(choice, detected, sources)}</span>
            <ChevronDownIcon aria-hidden className="opacity-70" />
          </Button>
        }
      />
      <PopoverPopup align="start" width="lg">
        <div className="flex flex-col gap-4 text-sm">
          <section className="flex flex-col gap-1.5">
            <h3 className="font-medium">Your mic</h3>
            <DevicePicker
              label="Mic"
              devices={sources.mics}
              value={choice.mic}
              onChange={(mic) => onChange({ ...choice, mic })}
            />
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="font-medium">Call audio</h3>
            {sources === NO_SOURCES ? (
              <p className="text-xs text-muted-foreground">
                The audio list is not available yet. Recording uses the default mic and all computer
                audio.
              </p>
            ) : sources.perApp ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Only the apps you tick are recorded. Music and videos in other apps stay out.
                </p>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No app is making sound now. Start the call, then open this list again.
                  </p>
                ) : null}
                {rows.map((app) => {
                  const detectedNow = app.name === detected && !choice.all;
                  return (
                    <label key={app.name} className="flex items-center gap-2">
                      <Checkbox
                        checked={apps.includes(app.name)}
                        disabled={detectedNow}
                        onCheckedChange={(on) => toggleApp(app.name, on)}
                      />
                      <span className="flex-1 truncate">{app.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {detectedNow ? "In a call" : app.playing ? "Playing now" : "Not playing"}
                      </span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 border-t pt-2">
                  <Checkbox
                    checked={all}
                    // With no app ticked the meeting records everything, so the box cannot clear itself.
                    disabled={all}
                    onCheckedChange={() => onChange({ ...choice, all: true })}
                  />
                  <span className="flex-1">All computer audio</span>
                  <span className="text-xs text-muted-foreground">Includes music</span>
                </label>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                This version of Windows records all computer audio, not one app. Use Windows 11 to
                pick apps.
              </p>
            )}
            {all ? (
              <DevicePicker
                label="Speaker"
                devices={sources.outputs}
                value={choice.output}
                onChange={(output) => onChange({ ...choice, output })}
              />
            ) : null}
          </section>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function DevicePicker(props: {
  readonly label: string;
  readonly devices: readonly AudioDevice[];
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
}) {
  const current = props.devices.find((device) => device.id === props.value);
  return (
    <Select
      value={current?.id ?? SYSTEM_DEFAULT}
      onValueChange={(id) => props.onChange(id === SYSTEM_DEFAULT || id === null ? null : id)}
    >
      <SelectTrigger size="sm" aria-label={props.label}>
        <SelectValue>{current?.name ?? `Windows default ${props.label.toLowerCase()}`}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value={SYSTEM_DEFAULT}>Windows default {props.label.toLowerCase()}</SelectItem>
        {props.devices.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.name}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
