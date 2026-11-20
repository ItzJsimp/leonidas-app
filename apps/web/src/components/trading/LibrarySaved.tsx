import type { TradingResourceListResult } from "@t3tools/contracts";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";

import { EmptyLine } from "./LibrarySections";
import {
  RESOURCE_KINDS,
  resourceInput,
  type ResourceKind,
  type ResourceSaveValue,
} from "./library.logic";

export type SavedResource = TradingResourceListResult["resources"][number];

const KIND_LABEL: Record<ResourceKind, string> = Object.fromEntries(
  RESOURCE_KINDS.map((kind) => [kind.value, kind.label]),
) as Record<ResourceKind, string>;

/** Saved resources and the form that adds one. Crew is on by default; Private keeps it on this PC. */
export function SavedView({
  resources,
  onSave,
}: {
  readonly resources: readonly SavedResource[];
  /** Returns an error to show, or null when the save worked. */
  readonly onSave: (value: ResourceSaveValue) => Promise<string | null>;
}) {
  const id = useId();
  const [kind, setKind] = useState<ResourceKind>("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [shareWithCrew, setShareWithCrew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const checked = resourceInput({ kind, title, url, text, shareWithCrew });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const failure = await onSave(checked.value);
    setBusy(false);
    setError(failure);
    if (failure === null) {
      setTitle("");
      setUrl("");
      setText("");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => void submit(event)}
        aria-label="Save a resource"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-kind`}>Kind</Label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value as ResourceKind)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {RESOURCE_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-url`}>Link</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-text`}>Text (optional)</Label>
          <Textarea
            id={`${id}-text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            id={`${id}-crew`}
            checked={shareWithCrew}
            onCheckedChange={(checked) => setShareWithCrew(Boolean(checked))}
          />
          <Label htmlFor={`${id}-crew`}>Share with the Crew</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          On: the Crew gets it on the next sync. Off: it stays private on this PC.
        </p>
        {error === null ? null : (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={busy}>
            Save resource
          </Button>
        </div>
      </form>
      {resources.length === 0 ? (
        <EmptyLine>Nothing saved yet. Save a link, a note or a call you want to keep.</EmptyLine>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {resources.map((resource) => (
            <li key={resource.id} className="flex min-w-0 flex-col gap-1 py-3">
              <p className="text-sm font-medium break-words">{resource.title}</p>
              <p className="text-xs text-muted-foreground">
                {KIND_LABEL[resource.kind]} ·{" "}
                {resource.private ? "Private" : "Shared with the Crew"}
              </p>
              {resource.url === null ? null : (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs underline underline-offset-4"
                >
                  {resource.url}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
