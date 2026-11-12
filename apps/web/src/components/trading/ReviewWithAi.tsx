import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

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
import { Spinner } from "~/components/ui/spinner";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useOnboardingChat } from "~/onboarding/useOnboardingChat";
import { deriveProviderInstanceEntries } from "~/providerInstances";
import { useEnvironmentProviders } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";

import { reviewPrompt, tokenEstimate } from "./journal.logic";

const NO_PROVIDERS = [] as const;

/** What the trader sees before a review runs: the engine, the model and a rough size. */
export function ReviewDialogView({
  day,
  engine,
  model,
  characters,
  ready,
  submitting,
  failure,
  onConfirm,
  onCancel,
}: {
  readonly day: string;
  readonly engine: string;
  readonly model: string;
  /** The characters the day files hold. The token count is an estimate from this. */
  readonly characters: number;
  readonly ready: boolean;
  readonly submitting: boolean;
  readonly failure: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Review with AI</DialogTitle>
          <DialogDescription>
            Leonidas Chat opens a new thread and reads this day&apos;s notes and trades. Nothing
            runs until you start the review.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Engine</dt>
            <dd>{engine}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="break-all">{model}</dd>
            <dt className="text-muted-foreground">Cost</dt>
            <dd>Cost depends on your plan</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="tabular-nums">
              About {tokenEstimate(characters).toLocaleString("en-US")} tokens (estimate for {day})
            </dd>
          </dl>
          {failure ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!ready || submitting}>
            {submitting ? <Spinner /> : null}
            Start review
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Review with AI. It uses the model the Ask box uses, and starts a chat only when the trader
 * confirms. Cancel calls nothing.
 */
export function ReviewWithAi({
  environmentId,
  day,
  workspaceRoot,
  characters,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly day: string;
  readonly workspaceRoot: string | null;
  readonly characters: number;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const { ensureFolderProject, startChat, defaultSelection } = useOnboardingChat(environmentId);
  const providers = useEnvironmentProviders().get(environmentId) ?? NO_PROVIDERS;
  const entries = deriveProviderInstanceEntries(providers);
  const stickyProvider = useComposerDraftStore((store) => store.stickyActiveProvider);
  const stickySelection = useComposerDraftStore((store) =>
    store.stickyActiveProvider
      ? (store.stickyModelSelectionByProvider[store.stickyActiveProvider] ?? null)
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const sticky =
    stickyProvider &&
    stickySelection &&
    entries.some((entry) => entry.instanceId === stickyProvider)
      ? stickySelection
      : null;
  const selection: ModelSelection | null = sticky ?? defaultSelection;
  const engine = selection
    ? (entries.find((entry) => entry.instanceId === selection.instanceId)?.displayName ??
      selection.instanceId)
    : "No AI connected";

  const start = async () => {
    if (!selection || submitting) return;
    if (workspaceRoot === null) {
      setFailure("Open a Trading workspace first.");
      return;
    }
    setSubmitting(true);
    setFailure(null);
    const project = await ensureFolderProject(workspaceRoot);
    const chat = project.ok
      ? await startChat({
          projectId: project.projectId,
          title: `Review ${day}`,
          prompt: reviewPrompt(day),
          modelSelection: selection,
        })
      : project;
    setSubmitting(false);
    if (!chat.ok) {
      setFailure(chat.message);
      return;
    }
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, chat.threadId)),
    });
    onClose();
  };

  return (
    <ReviewDialogView
      day={day}
      engine={engine}
      model={selection?.model ?? "None"}
      characters={characters}
      ready={selection !== null}
      submitting={submitting}
      failure={failure ?? (selection ? null : "Connect an AI first.")}
      onConfirm={() => void start()}
      onCancel={onClose}
    />
  );
}
