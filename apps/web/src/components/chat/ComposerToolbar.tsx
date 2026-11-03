import type { ComposerToolbarPrefs } from "@t3tools/contracts/settings";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";

import { cn, randomUUID } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerBanner } from "./ComposerBanner";
import { moveToolbarEntry, resolveToolbarEntries } from "./composerToolbar.logic";
import { useIconsOnly } from "./toolbarLabels";

/**
 * Button bar above the prompt. Built-in buttons come from the caller as nodes keyed by id; the
 * order, hidden ids and custom prompt buttons come from `prefs`. Collapsed, it keeps the icons
 * and shrinks to a thin icon-only strip so the team can still see every button.
 */
export const ComposerToolbar = memo(function ComposerToolbar(props: {
  prefs: ComposerToolbarPrefs;
  collapsed: boolean;
  builtins: Readonly<Record<string, ReactNode>>;
  onFillPrompt: (prompt: string) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onPrefsChange: (prefs: ComposerToolbarPrefs) => void;
}) {
  const entries = resolveToolbarEntries(props.prefs);
  const customById = new Map(props.prefs.custom.map((button) => [button.id, button]));
  const roomRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iconsOnly = useIconsOnly(roomRef, contentRef);
  return (
    <ComposerBanner.Attachment data-chat-composer-toolbar="true">
      <ComposerBanner.Root
        density="comfortable"
        className={cn(props.collapsed && "[--composer-banner-padding-block:--spacing(0.5)]")}
      >
        <div
          data-icons-only={iconsOnly}
          className={cn(
            // When the labels do not fit, chips show icons only, so no label cuts mid-word.
            "flex min-w-0 items-center gap-0.5 px-1 data-[icons-only=true]:[&_[data-composer-toolbar-label]]:sr-only data-[icons-only=true]:[&_[data-slot=composer-banner-content]]:sr-only",
            // The strip is one surface: the shoulder tabs inside it lose their own.
            "[&_[data-composer-banner-surface]]:py-0 [&_[data-composer-banner-surface]]:before:hidden [&_[data-composer-banner-surface]]:after:hidden",
            props.collapsed &&
              "[&_[data-composer-banner-surface]]:[--composer-banner-icon-column:--spacing(4)] [&_[data-slot=composer-banner-content]]:sr-only [&_svg]:size-3",
          )}
        >
          <div
            ref={roomRef}
            className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div ref={contentRef} className="flex w-max shrink-0 items-center gap-0.5">
              {entries.map((entry) => {
                if (entry.hidden) return null;
                const custom = customById.get(entry.id);
                if (!custom) {
                  return (
                    <div key={entry.id} className="contents">
                      {props.builtins[entry.id]}
                    </div>
                  );
                }
                return (
                  <ComposerBanner.Root
                    key={entry.id}
                    density="comfortable"
                    width="content"
                    data-composer-shoulder-tab
                  >
                    <ComposerBanner.Row
                      render={<button type="button" />}
                      aria-label={custom.label}
                      title={custom.label}
                      className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => props.onFillPrompt(custom.prompt)}
                    >
                      <ComposerBanner.Icon>
                        <ZapIcon />
                      </ComposerBanner.Icon>
                      <ComposerBanner.Content>{custom.label}</ComposerBanner.Content>
                    </ComposerBanner.Row>
                  </ComposerBanner.Root>
                );
              })}
            </div>
          </div>
          <CustomizePopover prefs={props.prefs} onPrefsChange={props.onPrefsChange} />
          <ComposerBanner.Root density="comfortable" width="content" data-composer-shoulder-tab>
            <ComposerBanner.Row
              render={<button type="button" />}
              aria-label={props.collapsed ? "Show button bar" : "Hide button bar"}
              title={props.collapsed ? "Show button bar" : "Hide button bar"}
              className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => props.onCollapsedChange(!props.collapsed)}
            >
              <ComposerBanner.Icon>
                {props.collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </ComposerBanner.Icon>
            </ComposerBanner.Row>
          </ComposerBanner.Root>
        </div>
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
});

function CustomizePopover(props: {
  prefs: ComposerToolbarPrefs;
  onPrefsChange: (prefs: ComposerToolbarPrefs) => void;
}) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const { prefs, onPrefsChange } = props;
  const entries = resolveToolbarEntries(prefs);

  const toggleHidden = (id: string) =>
    onPrefsChange({
      ...prefs,
      hidden: prefs.hidden.includes(id)
        ? prefs.hidden.filter((hiddenId) => hiddenId !== id)
        : [...prefs.hidden, id],
    });
  const addCustom = () => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) return;
    onPrefsChange({
      ...prefs,
      custom: [
        ...prefs.custom,
        { id: `custom-${randomUUID()}`, label: trimmedLabel, prompt: trimmedPrompt },
      ],
    });
    setLabel("");
    setPrompt("");
  };
  const removeCustom = (id: string) =>
    onPrefsChange({
      hidden: prefs.hidden.filter((hiddenId) => hiddenId !== id),
      order: prefs.order.filter((orderId) => orderId !== id),
      custom: prefs.custom.filter((button) => button.id !== id),
    });

  return (
    <Popover>
      <ComposerBanner.Root density="comfortable" width="content" data-composer-shoulder-tab>
        <PopoverTrigger
          render={<ComposerBanner.Row render={<button type="button" />} />}
          aria-label="Customize button bar"
          title="Customize button bar"
          className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground"
          onPointerDown={(event) => event.preventDefault()}
        >
          <ComposerBanner.Icon>
            <SlidersHorizontalIcon />
          </ComposerBanner.Icon>
        </PopoverTrigger>
      </ComposerBanner.Root>
      <PopoverPopup side="top" align="end" className="w-80">
        <div className="flex flex-col gap-1 p-2">
          {entries.map((entry, index) => (
            <div key={entry.id} className="flex items-center gap-1 text-sm">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={entry.hidden ? `Show ${entry.label}` : `Hide ${entry.label}`}
                onClick={() => toggleHidden(entry.id)}
              >
                {entry.hidden ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
              <span className={cn("min-w-0 flex-1 truncate", entry.hidden && "opacity-50")}>
                {entry.label}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Move ${entry.label} earlier`}
                disabled={index === 0}
                onClick={() =>
                  onPrefsChange({ ...prefs, order: moveToolbarEntry(entries, entry.id, -1) })
                }
              >
                <ChevronUpIcon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Move ${entry.label} later`}
                disabled={index === entries.length - 1}
                onClick={() =>
                  onPrefsChange({ ...prefs, order: moveToolbarEntry(entries, entry.id, 1) })
                }
              >
                <ChevronDownIcon />
              </Button>
              {entry.custom ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${entry.label}`}
                  onClick={() => removeCustom(entry.id)}
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1 border-t border-border/60 pt-2">
            <Input
              value={label}
              placeholder="New button name"
              aria-label="New button name"
              onChange={(event) => setLabel(event.target.value)}
            />
            <Input
              value={prompt}
              placeholder="Message it writes"
              aria-label="Message the new button writes"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addCustom();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={addCustom}
              disabled={!label.trim() || !prompt.trim()}
            >
              <PlusIcon /> Add button
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
