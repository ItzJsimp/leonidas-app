import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import { scribePatchSettings, scribeSettingsQuery } from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { commandErrorReason } from "./home.logic";
import {
  DEFAULT_REWRITE_PRESETS,
  MAX_REWRITE_PRESETS,
  cleanPresets,
  hasPresetErrors,
  movePreset,
  readRewritePresets,
  samePresets,
  validatePresets,
  type PresetErrors,
  type RewritePreset,
} from "./rewrite.logic";
import { KeyCaps } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import { rewriteBindings, settingsErrorMessage } from "./settings.logic";

interface Row extends RewritePreset {
  readonly id: string;
}

let nextRowId = 0;
const withIds = (list: readonly RewritePreset[]): Row[] =>
  list.map((preset) => ({ ...preset, id: `preset-${++nextRowId}` }));

/** Focus after React has drawn the change. */
const focusLater = (id: string) =>
  requestAnimationFrame(() => document.getElementById(id)?.focus());

export function ScribeRewriteTab({ environmentId, live }: ScribeTabProps) {
  const settingsQuery = useEnvironmentQuery(scribeSettingsQuery({ environmentId, input: {} }));
  const runPatch = useAtomCommand(scribePatchSettings, { reportFailure: false });
  // What the last save sent, so the page shows it before the next read.
  const [saved, setSaved] = useState<readonly RewritePreset[] | null>(null);
  // `rows` holds the page's changes; null means nothing is edited.
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const previousConnected = useRef(live.connected);
  const { refresh, error } = settingsQuery;
  useEffect(() => {
    if (error !== null && live.connected === true && previousConnected.current !== true) refresh();
    previousConnected.current = live.connected;
  }, [live.connected, error, refresh]);

  const settings = settingsQuery.data;
  const current = useMemo(
    () =>
      saved !== null
        ? readRewritePresets({ rewrite: saved })
        : settings === null
          ? null
          : readRewritePresets(settings.sections.presets),
    [saved, settings],
  );
  const savedRows = useMemo(() => (current === null ? [] : withIds(current.list)), [current]);
  const draft = rows ?? savedRows;
  const errors = useMemo(() => validatePresets(draft), [draft]);
  const changed = current !== null && !samePresets(draft, current.list);

  if (settings === null || current === null) {
    if (settingsQuery.error !== null) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm" role="alert">
          <p>
            {live.connected === false
              ? "Scribe engine is not running."
              : "Could not load your rewrite presets."}
          </p>
          <Button size="sm" variant="outline" onClick={settingsQuery.refresh}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading rewrite presets">
        <Skeleton className="h-36 w-full" />
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const edit = (change: (list: Row[]) => Row[]) => setRows((list) => change([...(list ?? draft)]));
  const setOpenRow = (id: string, value: boolean) =>
    setOpen((set) => {
      const copy = new Set(set);
      if (value) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  const add = () => {
    if (draft.length >= MAX_REWRITE_PRESETS) return;
    const [row] = withIds([{ name: "", instruction: "" }]) as [Row];
    edit((list) => [...list, row]);
    setOpenRow(row.id, true);
    setAnnouncement(`Preset ${draft.length + 1} added.`);
    focusLater(`${row.id}-name`);
  };

  const move = (index: number, delta: -1 | 1) => {
    const row = draft[index];
    if (!row) return;
    const target = index + delta;
    edit((list) => movePreset(list, index, delta));
    setAnnouncement(`${row.name.trim() || "Preset"} is now number ${target + 1}.`);
    // Keep focus on the moved preset; at an edge, use its other arrow.
    const edge = target === 0 || target === draft.length - 1;
    focusLater(`${row.id}-${edge ? (delta < 0 ? "down" : "up") : delta < 0 ? "up" : "down"}`);
  };

  const remove = (index: number) => {
    const row = draft[index];
    if (!row) return;
    edit((list) => list.filter((item) => item.id !== row.id));
    setAnnouncement(`${row.name.trim() || "Preset"} deleted. Discard brings it back.`);
    const neighbour = draft[index + 1] ?? draft[index - 1];
    focusLater(neighbour ? `${neighbour.id}-title` : "rewrite-add");
  };

  const reset = () => {
    setRows(withIds(DEFAULT_REWRITE_PRESETS));
    setOpen(new Set());
    setShowErrors(false);
    setAnnouncement("Built-in presets restored. Save to keep them.");
  };

  const discard = () => {
    setRows(null);
    setOpen(new Set());
    setShowErrors(false);
  };

  const save = async () => {
    if (hasPresetErrors(errors)) {
      setShowErrors(true);
      const bad = draft.filter((_, index) => Object.keys(errors[index] ?? {}).length > 0);
      setOpen((set) => new Set([...set, ...bad.map((row) => row.id)]));
      const first = draft.findIndex((_, index) => Object.keys(errors[index] ?? {}).length > 0);
      const row = draft[first];
      if (row) focusLater(`${row.id}-${errors[first]?.name ? "name" : "instruction"}`);
      return;
    }
    const rewrite = cleanPresets(draft);
    setBusy(true);
    const result = await runPatch({
      environmentId,
      input: { section: "presets", values: { rewrite } },
    });
    setBusy(false);
    if (result._tag !== "Success") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: settingsErrorMessage(commandErrorReason(squashAtomCommandFailure(result))),
        });
      }
      return;
    }
    setSaved(rewrite);
    setRows(null);
    setOpen(new Set());
    setShowErrors(false);
    toastManager.add({
      type: "success",
      title: rewrite.length === 0 ? "Saved. The picker uses the built-in presets." : "Saved.",
    });
  };

  const keys = rewriteBindings(settings.sections.hotkeys);
  const full = draft.length >= MAX_REWRITE_PRESETS;

  return (
    <div className="flex flex-col gap-6">
      <HowItWorks keys={keys} />

      <section aria-labelledby="rewrite-presets" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 id="rewrite-presets" className="text-base font-semibold">
              Presets
            </h2>
            <p className="text-sm text-muted-foreground">
              {current.builtIn && rows === null
                ? "These are the built-in presets. Change them to make them yours."
                : "The picker shows them in this order. The number is the key to press."}
            </p>
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>
            Reset to defaults
          </Button>
        </div>

        {draft.length === 0 ? (
          <Empty size="compact" className="rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WandSparklesIcon />
              </EmptyMedia>
              <EmptyTitle>No presets</EmptyTitle>
              <EmptyDescription>
                The picker uses the built-in presets until you add one.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button id="rewrite-add" size="sm" onClick={add}>
                <PlusIcon aria-hidden />
                Add preset
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {draft.map((row, index) => (
                <PresetRow
                  key={row.id}
                  row={row}
                  index={index}
                  last={index === draft.length - 1}
                  open={open.has(row.id)}
                  errors={showErrors ? (errors[index] ?? {}) : {}}
                  busy={busy}
                  onOpen={(value) => setOpenRow(row.id, value)}
                  onChange={(patch) =>
                    edit((list) =>
                      list.map((item) => (item.id === row.id ? { ...item, ...patch } : item)),
                    )
                  }
                  onMove={(delta) => move(index, delta)}
                  onDelete={() => remove(index)}
                />
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Button id="rewrite-add" variant="outline" disabled={busy || full} onClick={add}>
                <PlusIcon aria-hidden />
                Add preset
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {full
                  ? `${MAX_REWRITE_PRESETS} of ${MAX_REWRITE_PRESETS}. The picker holds no more.`
                  : `${draft.length} of ${MAX_REWRITE_PRESETS}`}
              </span>
            </div>
          </>
        )}
      </section>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 p-3 backdrop-blur">
        <Button disabled={busy || !changed} onClick={() => void save()}>
          {busy ? "Saving" : "Save presets"}
        </Button>
        <Button variant="ghost" disabled={busy || !changed} onClick={discard}>
          Discard
        </Button>
        {changed ? (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Unsaved changes
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HowItWorks(props: { readonly keys: readonly string[] }) {
  return (
    <section
      aria-labelledby="rewrite-how"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <div>
        <h2 id="rewrite-how" className="text-base font-semibold">
          Rewrite text in any app
        </h2>
        <p className="text-sm text-muted-foreground">
          Scribe rewrites the text you select and puts the result in its place.
        </p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        <Step number={1} title="Select text">
          In any app or text box.
        </Step>
        <Step number={2} title="Press the rewrite key">
          {props.keys.length === 0 ? (
            "No key is set. Add one on the Settings tab."
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {props.keys.map((binding, index) => (
                <span key={binding} className="inline-flex items-center gap-2">
                  {index > 0 ? <span>or</span> : null}
                  <KeyCaps binding={binding} />
                </span>
              ))}
            </span>
          )}
        </Step>
        <Step number={3} title="Pick a preset">
          Press its number. Scribe pastes the result.
        </Step>
      </ol>
    </section>
  );
}

function Step(props: {
  readonly number: number;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground"
      >
        {props.number}
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          <span className="sr-only">Step {props.number}: </span>
          {props.title}
        </p>
        <div className="mt-1 text-muted-foreground">{props.children}</div>
      </div>
    </li>
  );
}

function PresetRow(props: {
  readonly row: Row;
  readonly index: number;
  readonly last: boolean;
  readonly open: boolean;
  readonly errors: PresetErrors;
  readonly busy: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly onChange: (patch: Partial<RewritePreset>) => void;
  readonly onMove: (delta: -1 | 1) => void;
  readonly onDelete: () => void;
}) {
  const { row, index, errors } = props;
  const name = row.name.trim() || "New preset";
  const panel = `${row.id}-panel`;
  const invalid = errors.name !== undefined || errors.instruction !== undefined;
  return (
    <li
      className="rounded-lg border border-border bg-card data-[invalid]:border-destructive/40"
      data-invalid={invalid || undefined}
    >
      <div className="flex items-center gap-1 p-2 pl-3">
        <Kbd
          aria-hidden
          className="h-6 min-w-6 border border-border bg-background text-foreground tabular-nums"
        >
          {index + 1}
        </Kbd>
        <button
          id={`${row.id}-title`}
          type="button"
          aria-expanded={props.open}
          aria-controls={panel}
          onClick={() => props.onOpen(!props.open)}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="sr-only">Key {index + 1}: </span>
            <span className="block truncate text-sm font-medium">{name}</span>
            {props.open ? null : (
              <span className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                {row.instruction.trim() || "No instruction yet."}
              </span>
            )}
          </span>
          {props.open ? (
            <ChevronDownIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <ChevronRightIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
        </button>
        <Button
          id={`${row.id}-up`}
          size="icon-sm"
          variant="ghost"
          aria-label={`Move ${name} up`}
          disabled={props.busy || index === 0}
          onClick={() => props.onMove(-1)}
        >
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button
          id={`${row.id}-down`}
          size="icon-sm"
          variant="ghost"
          aria-label={`Move ${name} down`}
          disabled={props.busy || props.last}
          onClick={() => props.onMove(1)}
        >
          <ArrowDownIcon aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${name}`}
          disabled={props.busy}
          onClick={props.onDelete}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
      {props.open ? (
        <div id={panel} className="flex flex-col gap-4 border-t border-border/60 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${row.id}-name`}>Name</Label>
            <Input
              id={`${row.id}-name`}
              className="sm:max-w-72"
              maxLength={40}
              placeholder="For example: Formal"
              value={row.name}
              aria-invalid={errors.name !== undefined || undefined}
              aria-describedby={errors.name ? `${row.id}-name-error` : undefined}
              onChange={(event) => props.onChange({ name: event.target.value })}
            />
            {errors.name ? (
              <p id={`${row.id}-name-error`} className="text-sm text-destructive-foreground">
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${row.id}-instruction`}>Instruction</Label>
            <Textarea
              id={`${row.id}-instruction`}
              placeholder="Tell the AI how to rewrite the text. For example: Make it formal and keep every fact."
              value={row.instruction}
              aria-invalid={errors.instruction !== undefined || undefined}
              aria-describedby={errors.instruction ? `${row.id}-instruction-error` : undefined}
              onChange={(event) => props.onChange({ instruction: event.target.value })}
            />
            {errors.instruction ? (
              <p id={`${row.id}-instruction-error`} className="text-sm text-destructive-foreground">
                {errors.instruction}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
