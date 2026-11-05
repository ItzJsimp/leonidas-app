import { BookmarkIcon, PinIcon, PinOffIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { memo, useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";

import {
  MAX_PINNED_VIEWS,
  MAX_VIEWS,
  VIEW_NAME_MAX,
  cleanViewName,
  type SavedView,
} from "./taskLayout.logic";
import { TAB_CLASS, VIEW_ICONS } from "./TaskViewTabs";

const DEFAULT_VIEW = "default";

/** Pinned saved views as tabs. They go inside the view tablist, after the kind tabs. */
export const SavedViewTabs = memo(function SavedViewTabs(props: {
  readonly views: ReadonlyArray<SavedView>;
  readonly activeId: string | null;
  readonly onOpen: (id: string) => void;
}) {
  return props.views
    .filter((view) => view.pinned)
    .map((view) => {
      const Icon = VIEW_ICONS[view.prefs.view];
      return (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={props.activeId === view.id}
          onClick={() => props.onOpen(view.id)}
          className={TAB_CLASS}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="max-w-32 truncate">{view.name}</span>
        </button>
      );
    });
});

function SaveViewDialog(props: {
  readonly open: boolean;
  readonly onSave: (name: string) => void;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const clean = cleanViewName(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!clean) return;
    props.onSave(clean);
    setName("");
    props.onClose();
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogPopup className="max-w-sm">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Keeps the filters, sort, grouping and columns. Later changes save into the view.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
              Name
              <Input
                id={`${id}-name`}
                autoFocus
                maxLength={VIEW_NAME_MAX}
                placeholder="This week"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Label>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!clean}>
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** The Views menu (open, save, pin, delete) and the Reset button. */
export function SavedViewsMenu(props: {
  readonly views: ReadonlyArray<SavedView>;
  readonly activeId: string | null;
  readonly onOpen: (id: string | null) => void;
  readonly onSave: (name: string) => void;
  readonly onPin: (id: string, pinned: boolean) => void;
  readonly onDelete: (id: string) => void;
  /** Null when the default view already shows its defaults. */
  readonly onReset: (() => void) | null;
}) {
  const [saving, setSaving] = useState(false);
  const { views, activeId } = props;
  const open = views.find((view) => view.id === activeId);
  const pinFull = views.filter((view) => view.pinned).length >= MAX_PINNED_VIEWS;
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="compact"
              aria-label={`Views, ${open?.name ?? "Default"}`}
            />
          }
        >
          <BookmarkIcon />
          {/* An open view without a tab shows its name here, so the open view is always named. */}
          {open && !open.pinned ? (
            <span className="max-w-32 truncate">{open.name}</span>
          ) : (
            <span className="hidden sm:inline">Views</span>
          )}
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-56">
          <MenuGroup>
            <MenuGroupLabel>Views</MenuGroupLabel>
            <MenuRadioGroup
              value={activeId ?? DEFAULT_VIEW}
              onValueChange={(value) => props.onOpen(value === DEFAULT_VIEW ? null : String(value))}
            >
              <MenuRadioItem value={DEFAULT_VIEW}>Default</MenuRadioItem>
              {views.map((view) => (
                <MenuRadioItem key={view.id} value={view.id}>
                  <span className="truncate">{view.name}</span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem disabled={views.length >= MAX_VIEWS} onClick={() => setSaving(true)}>
            <BookmarkIcon aria-hidden />
            {views.length >= MAX_VIEWS ? `Save view (limit ${MAX_VIEWS})` : "Save as new view"}
          </MenuItem>
          {open ? (
            <>
              <MenuItem
                disabled={!open.pinned && pinFull}
                onClick={() => props.onPin(open.id, !open.pinned)}
              >
                {open.pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />}
                {open.pinned
                  ? "Unpin tab"
                  : pinFull
                    ? `Pin as tab (${MAX_PINNED_VIEWS} pinned)`
                    : "Pin as tab"}
              </MenuItem>
              <MenuItem variant="destructive" onClick={() => props.onDelete(open.id)}>
                <Trash2Icon aria-hidden />
                Delete view
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {props.onReset ? (
        <Button
          variant="ghost"
          size="compact"
          aria-label="Reset to default"
          onClick={props.onReset}
        >
          <RotateCcwIcon />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      ) : null}
      <SaveViewDialog open={saving} onSave={props.onSave} onClose={() => setSaving(false)} />
    </>
  );
}
