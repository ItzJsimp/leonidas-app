import type { ImageSourceStatus } from "@t3tools/contracts";
import { CheckIcon, ClipboardCopyIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useBuilderMode } from "../twoState/useBuilderMode";
import { Spinner } from "../ui/spinner";
import { HelpText } from "./catalogBadges";
import { COMFY_INSTALL_URL, COMFY_START_COMMAND } from "./imageTypes";

/** The ComfyUI address field. Saving checks the connection again. */
export function AddressField(props: {
  readonly baseUrl: string;
  readonly onSave: (baseUrl: string) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? props.baseUrl;
  const changed = draft !== null && draft.trim() !== props.baseUrl;
  const save = async () => {
    if (await props.onSave(value.trim())) setDraft(null);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        ComfyUI address
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          font="mono"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && changed) void save();
          }}
        />
        <Button variant="outline" disabled={!changed} onClick={() => void save()}>
          Save
        </Button>
      </div>
      <HelpText>The usual address is http://127.0.0.1:8188. It means this computer.</HelpText>
    </div>
  );
}

function Step(props: {
  readonly n: number;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
      >
        {props.n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-medium">{props.title}</h3>
        {props.children}
      </div>
    </li>
  );
}

/** Shown first when ComfyUI does not answer. Gives the next step, not only an error. */
export function SetupCard(props: {
  readonly source: ImageSourceStatus;
  readonly checking: boolean;
  readonly onRecheck: () => Promise<boolean>;
  readonly onSaveAddress: (baseUrl: string) => Promise<boolean>;
}) {
  const builder = useBuilderMode();
  const [copied, setCopied] = useState(false);
  const [lastCheck, setLastCheck] = useState<"none" | "failed">("none");
  const copy = () => {
    void navigator.clipboard.writeText(COMFY_START_COMMAND).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <section
      aria-labelledby="images-setup-title"
      className="flex flex-col gap-4 rounded-2xl border border-warning/40 bg-card p-4 shadow-xs/5 sm:p-5"
    >
      <div>
        <h2 id="images-setup-title" className="text-base font-semibold">
          Set up ComfyUI to make pictures
        </h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {props.source.message ?? "ComfyUI does not answer."} ComfyUI is a free program. It runs
          the image models on your graphics card.
        </p>
      </div>
      <ol className="flex flex-col gap-4">
        <Step n={1} title="Install ComfyUI">
          <Button
            variant="outline"
            className="self-start"
            render={<a href={COMFY_INSTALL_URL} target="_blank" rel="noreferrer" />}
          >
            Download ComfyUI
            <ExternalLinkIcon />
          </Button>
          <HelpText>Skip this step if ComfyUI is already on this PC.</HelpText>
        </Step>
        <Step n={2} title="Start ComfyUI">
          {builder ? (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 ps-3 pe-1">
              <code className="min-w-0 flex-1 font-mono text-xs break-words">
                {COMFY_START_COMMAND}
              </code>
              <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy the start command">
                {copied ? <CheckIcon /> : <ClipboardCopyIcon />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}
          <HelpText>
            {builder
              ? "Run this command in the ComfyUI folder. The desktop app of ComfyUI starts by itself."
              : "Open ComfyUI on this PC and wait until its page shows."}
          </HelpText>
        </Step>
        <Step n={3} title="Check the connection">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={props.checking}
              onClick={() =>
                void props.onRecheck().then((online) => setLastCheck(online ? "none" : "failed"))
              }
            >
              {props.checking ? <Spinner /> : <RefreshCwIcon />}
              Check again
            </Button>
            {lastCheck === "failed" && !props.checking ? (
              <span className="text-sm text-warning-foreground" role="status">
                Still no answer. Make sure ComfyUI shows its web page, then check again.
              </span>
            ) : null}
          </div>
          <AddressField baseUrl={props.source.baseUrl} onSave={props.onSaveAddress} />
        </Step>
      </ol>
    </section>
  );
}
