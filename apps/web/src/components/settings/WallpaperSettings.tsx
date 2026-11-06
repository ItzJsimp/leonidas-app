import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import { CheckIcon, ImagePlusIcon, XIcon } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Tip } from "~/components/twoState/Tip";
import { cn } from "~/lib/utils";
import {
  removeCustomWallpaper,
  saveCustomWallpaper,
  useCustomWallpaperUrl,
} from "~/wallpaper/customWallpaperStore";
import { useWallpaperSettings } from "~/wallpaper/useWallpaperSettings";
import {
  BUILT_IN_WALLPAPER_IDS,
  builtInWallpaperThumbUrl,
  DEFAULT_WALLPAPER_SETTINGS,
  themeWallpaperId,
  WALLPAPER_BLUR,
  WALLPAPER_BRIGHTNESS,
  WALLPAPER_CONTRAST,
  WALLPAPER_UPLOAD_TYPES,
  type WallpaperChoice,
  type WallpaperSettings as WallpaperSettingsValue,
} from "~/wallpaper/wallpaper.logic";
import { useThemeSnapshot } from "~/wallpaper/WallpaperLayer";

import { searchableSetting } from "./settingsSearch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const THEME_LABELS = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme.label]));

/** Settings > Appearance > Wallpaper: pick an image, then tune blur, brightness and contrast. */
export function WallpaperSettings() {
  const { settings, update } = useWallpaperSettings();
  const customUrl = useCustomWallpaperUrl();
  const { themeId } = useThemeSnapshot();
  const themeArt = themeWallpaperId(themeId) ?? "leonidas";
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = settings.choice === "none";
  const slidersChanged =
    settings.blur !== DEFAULT_WALLPAPER_SETTINGS.blur ||
    settings.brightness !== DEFAULT_WALLPAPER_SETTINGS.brightness ||
    settings.contrast !== DEFAULT_WALLPAPER_SETTINGS.contrast;

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    const failure = await saveCustomWallpaper(file);
    setUploading(false);
    if (failure) setError(failure);
    else update({ choice: "custom" });
  };

  const choose = (choice: WallpaperChoice) => {
    setError(null);
    update({ choice });
  };

  return (
    <SettingsSection
      {...searchableSetting("setting-wallpaper")}
      title="Wallpaper"
      headerAction={
        slidersChanged ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              update({
                blur: DEFAULT_WALLPAPER_SETTINGS.blur,
                brightness: DEFAULT_WALLPAPER_SETTINGS.brightness,
                contrast: DEFAULT_WALLPAPER_SETTINGS.contrast,
              })
            }
          >
            Reset sliders
          </Button>
        ) : null
      }
    >
      <SettingsRow
        title="Image"
        description="Shows behind chats, the Command Center and every page on this device. Text stays readable on any image."
      >
        <div className="flex flex-wrap gap-2 pt-1 pb-3" role="radiogroup" aria-label="Wallpaper">
          <WallpaperTile
            label="None"
            selected={settings.choice === "none"}
            onSelect={() => choose("none")}
          >
            <span className="flex size-full items-center justify-center bg-background text-xs text-muted-foreground">
              Off
            </span>
          </WallpaperTile>
          <WallpaperTile
            label="Match theme"
            tooltip={`Uses the art of the current theme (${THEME_LABELS.get(themeArt) ?? "Leonidas"}) and follows theme changes.`}
            selected={settings.choice === "theme"}
            onSelect={() => choose("theme")}
          >
            <img
              alt=""
              src={builtInWallpaperThumbUrl(themeArt)}
              className="size-full object-cover"
            />
          </WallpaperTile>
          {BUILT_IN_WALLPAPER_IDS.filter((id) => id !== themeArt).map((id) => (
            <WallpaperTile
              key={id}
              label={THEME_LABELS.get(id) ?? id}
              selected={settings.choice === id}
              onSelect={() => choose(id)}
            >
              <img alt="" src={builtInWallpaperThumbUrl(id)} className="size-full object-cover" />
            </WallpaperTile>
          ))}
          {customUrl ? (
            <div className="relative">
              <WallpaperTile
                label="Your image"
                selected={settings.choice === "custom"}
                onSelect={() => choose("custom")}
              >
                <img alt="" src={customUrl} className="size-full object-cover" />
              </WallpaperTile>
              <Tip text="Remove your image">
                <button
                  type="button"
                  aria-label="Remove your image"
                  className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-xs hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => {
                    if (settings.choice === "custom") choose("none");
                    void removeCustomWallpaper();
                  }}
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              </Tip>
            </div>
          ) : null}
          <div className="flex w-24 flex-col gap-1">
            <Tip text="Upload a PNG, JPEG, WebP or GIF. Large images are made smaller on this device.">
              <button
                type="button"
                aria-label={customUrl ? "Upload a different image" : "Upload an image"}
                disabled={uploading}
                className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-64"
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? <Spinner /> : <ImagePlusIcon aria-hidden className="size-4" />}
              </button>
            </Tip>
            <span className="truncate text-center text-xs text-muted-foreground">
              {uploading ? "Saving" : "Upload"}
            </span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={WALLPAPER_UPLOAD_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
        </div>
        {error ? (
          <p role="alert" className="pb-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </SettingsRow>
      <WallpaperSlider
        label="Blur"
        unit="px"
        settingKey="blur"
        range={WALLPAPER_BLUR}
        settings={settings}
        disabled={off}
        update={update}
      />
      <WallpaperSlider
        label="Brightness"
        unit="%"
        settingKey="brightness"
        range={WALLPAPER_BRIGHTNESS}
        settings={settings}
        disabled={off}
        update={update}
      />
      <WallpaperSlider
        label="Image contrast"
        unit="%"
        settingKey="contrast"
        range={WALLPAPER_CONTRAST}
        settings={settings}
        disabled={off}
        update={update}
      />
    </SettingsSection>
  );
}

function WallpaperTile(props: {
  readonly label: string;
  readonly tooltip?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}) {
  const tile = (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      aria-label={props.label}
      onClick={props.onSelect}
      className={cn(
        "relative block aspect-video w-full overflow-hidden rounded-lg border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.selected
          ? "border-primary ring-2 ring-primary ring-inset"
          : "border-border hover:border-foreground/40",
      )}
    >
      {props.children}
      {props.selected ? (
        <span className="absolute right-1 bottom-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon aria-hidden className="size-3" />
        </span>
      ) : null}
    </button>
  );
  return (
    <div className="flex w-24 flex-col gap-1">
      {props.tooltip ? <Tip text={props.tooltip}>{tile}</Tip> : tile}
      <span
        className={cn(
          "truncate text-center text-xs",
          props.selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {props.label}
      </span>
    </div>
  );
}

function WallpaperSlider(props: {
  readonly label: string;
  readonly unit: string;
  readonly settingKey: "blur" | "brightness" | "contrast";
  readonly range: Readonly<{ min: number; max: number; step: number }>;
  readonly settings: WallpaperSettingsValue;
  readonly disabled: boolean;
  readonly update: (patch: Partial<WallpaperSettingsValue>) => void;
}) {
  const value = props.settings[props.settingKey];
  const ratio = (value - props.range.min) / (props.range.max - props.range.min);
  const id = `wallpaper-${props.settingKey}`;
  return (
    <SettingsRow
      title={props.label}
      aria-disabled={props.disabled || undefined}
      control={
        <div className="flex w-full items-center gap-3 sm:w-52">
          <output
            className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
            htmlFor={id}
          >
            {value}
            {props.unit}
          </output>
          <input
            id={id}
            aria-label={`Wallpaper ${props.label.toLowerCase()}`}
            className="settings-slider min-w-0 flex-1"
            type="range"
            min={props.range.min}
            max={props.range.max}
            step={props.range.step}
            value={value}
            disabled={props.disabled}
            style={
              {
                "--settings-slider-progress": `${ratio * 100}%`,
                "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
              } as CSSProperties
            }
            onChange={(event) =>
              props.update({ [props.settingKey]: Number(event.currentTarget.value) })
            }
          />
        </div>
      }
    />
  );
}
