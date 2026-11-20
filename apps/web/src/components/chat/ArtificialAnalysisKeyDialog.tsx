import type { EnvironmentId } from "@t3tools/contracts";
import { getApiKeyProvider } from "@t3tools/shared/apiKeyProviders";
import { CheckCircle2Icon, ExternalLinkIcon, LockIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useBenchmarkUi } from "../../benchmarkUiStore";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQueryRefresh } from "../../state/query";
import { useApiKeyField } from "../settings/useApiKeyField";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

function Step(props: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border/70 bg-card p-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-medium">
        {props.n}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium">{props.title}</div>
        {props.children}
      </div>
    </li>
  );
}

/**
 * Three plain steps to a free Artificial Analysis key. It tests the key first and saves it only when
 * the test passes, so a typo never replaces a key that works. Settings, the model picker and the
 * benchmarks window all open this one dialog.
 */
function ArtificialAnalysisKeyDialog(props: {
  environmentId: EnvironmentId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = getApiKeyProvider("artificialAnalysis");
  if (!provider) return null;
  return <KeyDialogBody {...props} provider={provider} />;
}

function KeyDialogBody(props: {
  environmentId: EnvironmentId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: NonNullable<ReturnType<typeof getApiKeyProvider>>;
}) {
  const { environmentId, open, onOpenChange, provider } = props;
  const { draft, setDraft, busy, test, save } = useApiKeyField(environmentId, provider);
  const { refresh: refreshCatalog } = useEnvironmentQueryRefresh(
    serverEnvironment.modelBenchmarkCatalog({ environmentId, input: {} }),
  );
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft("");
      setError(null);
      setConnected(false);
      setReveal(false);
    }
  };

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setError(null);
    const result = await test();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await save(draft.trim());
    refreshCatalog();
    setConnected(true);
  };

  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogPopup className="max-w-lg">
        {connected ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="size-5 text-success" aria-hidden="true" />
                <DialogTitle>Connected</DialogTitle>
              </div>
              <DialogDescription>
                Every effort level now shows its own numbers. The list can take a few seconds to
                fill in.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Connect {provider.label}</DialogTitle>
              <DialogDescription>
                A free key shows every effort level for every model. It takes about 2 minutes.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <ol className="space-y-2">
                <Step n={1} title={`Open the ${provider.label} API page`}>
                  <p className="text-xs text-muted-foreground">
                    Sign in or create a free account. Then create an API key on that page.
                  </p>
                  <Button
                    size="sm"
                    type="button"
                    render={<a href={provider.keyUrl} target="_blank" rel="noreferrer noopener" />}
                  >
                    Open {provider.label}
                    <ExternalLinkIcon aria-hidden className="size-3" />
                  </Button>
                </Step>
                <Step n={2} title="Copy your key">
                  <p className="text-xs text-muted-foreground">
                    Copy the whole key. It is one long line of letters and numbers.
                  </p>
                </Step>
                <Step n={3} title="Paste it here">
                  <div className="flex gap-2">
                    <Input
                      type={reveal ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      size="sm"
                      aria-label={`${provider.label} key`}
                      aria-invalid={error !== null}
                      placeholder="Paste your key"
                      value={draft}
                      disabled={busy}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        setError(null);
                      }}
                    />
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost-muted"
                      onClick={() => setReveal((value) => !value)}
                      aria-pressed={reveal}
                    >
                      {reveal ? "Hide" : "Show"}
                    </Button>
                    {canPaste ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          navigator.clipboard
                            .readText()
                            .then((text) => {
                              setDraft(text.trim());
                              setError(null);
                            })
                            // The browser refuses clipboard reads without permission; typing still works.
                            .catch(() => undefined);
                        }}
                      >
                        Paste
                      </Button>
                    ) : null}
                  </div>
                  {error ? (
                    <p role="alert" className="text-xs text-destructive-foreground">
                      {error}
                    </p>
                  ) : null}
                </Step>
              </ol>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <LockIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                Your key stays on this computer. Leonidas sends it only to {provider.label}, to load
                benchmarks.
              </p>
            </DialogPanel>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || draft.trim().length === 0}>
                {busy ? <Spinner className="size-3.5" /> : null}
                {busy ? "Testing" : "Test and save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

/** Mounted once at the app root. `useBenchmarkUi().openKeyDialog()` opens it from anywhere. */
export function ArtificialAnalysisKeyDialogHost() {
  const environmentId = usePrimaryEnvironmentId();
  const open = useBenchmarkUi((state) => state.keyDialogOpen);
  const closeKeyDialog = useBenchmarkUi((state) => state.closeKeyDialog);
  if (!environmentId) return null;
  return (
    <ArtificialAnalysisKeyDialog
      environmentId={environmentId}
      open={open}
      onOpenChange={(next) => (next ? undefined : closeKeyDialog())}
    />
  );
}
