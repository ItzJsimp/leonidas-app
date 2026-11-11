import {
  Grid2X2Icon,
  Gamepad2Icon,
  ImageIcon,
  LayersIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { DictationTextarea } from "../voice/DictationTextarea";
import {
  ASPECTS,
  SIZES,
  dimensionsFor,
  estimateRunRange,
  formatRange,
  needsConfirm,
  resolveSeed,
} from "./catalog.logic";
import { clampVariations } from "./images.logic";
import { IMAGE_KINDS, buildImagePrompt } from "./imagePrompt";
import type { CreateMemory } from "./useCreateMemory";
import type { ImagesApi } from "./useImagesCatalog";

const ICONS = {
  icon: Grid2X2Icon,
  game: Gamepad2Icon,
  logo: StarIcon,
  product: ImageIcon,
  poster: LayersIcon,
  anything: SparklesIcon,
};

export function MakePanel({
  api,
  memory,
  onChange,
}: {
  readonly api: ImagesApi;
  readonly memory: CreateMemory;
  readonly onChange: (patch: Partial<CreateMemory>) => void;
}) {
  const id = useId();
  const [editingRule, setEditingRule] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const improve = async () => {
    if (!api.improvePrompt || improving) return;
    setImproving(true);
    try {
      setSuggestion(await api.improvePrompt(memory.prompt));
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not improve the prompt",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImproving(false);
    }
  };
  const pending = useRef(false);
  const kind = IMAGE_KINDS.find((entry) => entry.id === memory.assetKind) ?? IMAGE_KINDS[5];
  const rule = memory.helperText || kind.rule;
  const prompt = buildImagePrompt(memory.prompt, rule, memory.promptHelper ?? false);
  const requestedModel = api.catalog.find((entry) => entry.id === memory.modelIds[0]);
  const model =
    requestedModel?.state === "ready"
      ? requestedModel
      : (api.catalog.find((entry) => entry.state === "ready" && entry.fit !== "too-big") ??
        requestedModel);
  const count = clampVariations(memory.count);
  const range = estimateRunRange(model ? [model] : [], count);
  const dimensions = dimensionsFor(memory.aspect, memory.size);
  const seed = resolveSeed(memory.seedMode, memory.seed);
  const ready =
    model?.state === "ready" &&
    model.fit !== "too-big" &&
    (api.source.online ||
      api.setupState?.phase === "ready" ||
      (api.setupState?.installedModelIds?.includes(model.id) ?? false)) &&
    api.setupState?.phase !== "downloading" &&
    api.setupState?.phase !== "extracting";
  const change = (patch: Partial<CreateMemory>) => {
    setConfirming(false);
    onChange(patch);
  };
  const submit = async () => {
    if (pending.current || !ready || !prompt || prompt.length > 4000 || seed === "invalid") return;
    if (needsConfirm(range) && !confirming) {
      setConfirming(true);
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setConfirming(false);
    try {
      await api.generate({
        prompt,
        modelIds: [model.id],
        seed,
        count,
        ...dimensions,
        steps: null,
        guidance: null,
        sampler: null,
        negativePrompt: "",
      });
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };
  return (
    <form
      aria-label="Make an image"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex h-full min-h-0 flex-col gap-3.5 border-r border-border pe-4"
    >
      <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Make</h2>
      <div role="group" aria-label="Asset type" className="grid grid-cols-2 gap-1.5">
        {IMAGE_KINDS.map((entry) => {
          const Icon = ICONS[entry.id];
          return (
            <Button
              key={entry.id}
              type="button"
              variant={kind.id === entry.id ? "secondary" : "outline"}
              size="sm"
              aria-pressed={kind.id === entry.id}
              className="justify-start"
              onClick={() => {
                const preferred = entry.models.find((modelId) =>
                  api.catalog.some(
                    (model) =>
                      model.id === modelId && model.state === "ready" && model.fit !== "too-big",
                  ),
                );
                change({
                  assetKind: entry.id,
                  promptHelper: entry.id !== "anything",
                  helperText: "",
                  ...(preferred ? { modelIds: [preferred] } : {}),
                });
              }}
            >
              <Icon />
              {entry.label}
            </Button>
          );
        })}
      </div>
      <DictationTextarea
        aria-label="Describe your image"
        placeholder="Describe the picture you want"
        value={memory.prompt}
        maxLength={4000}
        className="min-h-24"
        onChange={(event) => change({ prompt: event.target.value })}
      />
      {api.improvePrompt ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!memory.prompt.trim() || improving}
            onClick={() => setAiConsent(true)}
          >
            <SparklesIcon />
            {improving ? "Improving" : "Improve with AI"}
          </Button>
          {aiConsent ? (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-xs">
              <p>
                This sends your description to the AI account selected for text generation in
                Settings. It uses that account's allowance.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={improving}
                  onClick={() => {
                    setAiConsent(false);
                    void improve();
                  }}
                >
                  Send description
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAiConsent(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {suggestion !== null ? (
            <div className="flex flex-col gap-2">
              <Textarea
                aria-label="Improved prompt suggestion"
                value={suggestion}
                maxLength={4000}
                onChange={(event) => setSuggestion(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!suggestion.trim()}
                  onClick={() => {
                    change({ prompt: suggestion });
                    setSuggestion(null);
                  }}
                >
                  Use prompt
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <label htmlFor={`${id}-helper`} className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5">
          <SparklesIcon className="size-3.5" />
          Prompt helper
        </span>
        <Switch
          id={`${id}-helper`}
          checked={memory.promptHelper ?? false}
          onCheckedChange={(checked) => change({ promptHelper: checked })}
        />
      </label>
      {memory.promptHelper ? (
        editingRule ? (
          <Textarea
            aria-label="Prompt helper text"
            value={rule}
            maxLength={1000}
            onChange={(event) => change({ helperText: event.target.value })}
            onBlur={() => setEditingRule(false)}
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {rule || "Choose an asset type to add a prompt rule."}{" "}
            <button
              type="button"
              className="rounded-sm underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => setEditingRule(true)}
            >
              Edit
            </button>
          </div>
        )
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor={`${id}-size`}>
          Size
        </label>
        <Select
          value={`${memory.aspect}.${memory.size}`}
          onValueChange={(value) => {
            const choice = ASPECTS.flatMap((aspect) =>
              SIZES.map((size) => ({ aspect: aspect.id, size: size.id })),
            ).find((entry) => `${entry.aspect}.${entry.size}` === value);
            if (choice) change(choice);
          }}
        >
          <SelectTrigger id={`${id}-size`} className="w-full">
            <SelectValue>
              {ASPECTS.find((aspect) => aspect.id === memory.aspect)?.label} · {dimensions.width} ×{" "}
              {dimensions.height}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {ASPECTS.flatMap((aspect) =>
              SIZES.map((size) => {
                const dims = dimensionsFor(aspect.id, size.id);
                return (
                  <SelectItem key={`${aspect.id}.${size.id}`} value={`${aspect.id}.${size.id}`}>
                    {aspect.label} · {dims.width} × {dims.height}
                  </SelectItem>
                );
              }),
            )}
          </SelectPopup>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor={`${id}-model`}>
          Model
        </label>
        <Select
          value={model?.id ?? null}
          onValueChange={(value) => value && change({ modelIds: [value] })}
        >
          <SelectTrigger id={`${id}-model`} className="w-full">
            <SelectValue>{model?.label ?? "Choose a model"}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {api.catalog.map((entry) => (
              <SelectItem
                key={entry.id}
                value={entry.id}
                disabled={entry.state !== "ready" || entry.fit === "too-big"}
              >
                {entry.label}
                {entry.state !== "ready" ? " · Not installed" : ""}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      {prompt.length > 4000 ? (
        <p role="alert" className="text-xs text-error-foreground">
          Shorten the prompt or the helper text to 4,000 characters.
        </p>
      ) : null}
      {seed === "invalid" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => change({ seedMode: "random", seed: "" })}
        >
          Reset the invalid seed
        </Button>
      ) : null}
      <div className="flex-1" />
      <Button
        type="submit"
        disabled={!ready || !prompt || prompt.length > 4000 || submitting || seed === "invalid"}
        className="mt-2 w-full"
      >
        {submitting
          ? "Starting"
          : confirming
            ? "Confirm generation"
            : `Generate ${count} ${count === 1 ? "image" : "images"} · ${formatRange(range)}`}
      </Button>
    </form>
  );
}
