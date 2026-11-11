import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, TradingPackView, TradingStateInput } from "@t3tools/contracts";
import { useId, useState } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { tradingPackConsent } from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";

type Answer = (allow: boolean) => Promise<string | null>;

/** Asks once before the pack's check module runs. The trader sees the exact file that would run. */
export function PackConsentView({
  module,
  onAnswer,
}: {
  readonly module: string;
  readonly onAnswer: Answer;
}) {
  const id = useId();
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = async (allow: boolean) => {
    setBusy(allow);
    setError(null);
    const failure = await onAnswer(allow);
    setBusy(null);
    setError(failure);
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          Allow the rule check?
        </h2>
        <p className="text-sm text-muted-foreground">
          Your pack wants to run this file on your PC to grade each imported trade. It cannot read
          or write files. It can use the internet, and it sees your trade export. Allow it only if
          you trust the pack.
        </p>
        <code className="mt-1 block break-all text-xs text-muted-foreground">{module}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void answer(true)} disabled={busy !== null}>
          {busy === true ? <Spinner size="sm" aria-hidden /> : null}
          Allow
        </Button>
        <Button variant="outline" onClick={() => void answer(false)} disabled={busy !== null}>
          {busy === false ? <Spinner size="sm" aria-hidden /> : null}
          Decline
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** A pack that did not load, or a check module that waits for the trader's answer. */
export function PackNotice({
  environmentId,
  scope,
  pack,
}: {
  readonly environmentId: EnvironmentId;
  readonly scope: TradingStateInput;
  readonly pack: TradingPackView;
}) {
  const send = useAtomCommand(tradingPackConsent, { reportFailure: false });
  if (pack.status === "invalid") {
    return (
      <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        The linked pack did not load: {pack.reason}. Fix trading-pack.json in {pack.folder}. The
        tracker works without it.
      </p>
    );
  }
  if (pack.status !== "ready" || pack.check.status !== "pending") return null;
  const { module, sha256 } = pack.check;
  if (module === null || sha256 === null) return null;
  const onAnswer: Answer = async (allow) => {
    const result = await send({ environmentId, input: { ...scope, allow, sha256 } });
    if (result._tag === "Success") return null;
    const failure = squashAtomCommandFailure(result) as { readonly reason?: string } | undefined;
    return failure?.reason === "pack_changed"
      ? "The check file changed. Read the new path and answer again."
      : "Your answer was not saved. Try again.";
  };
  return <PackConsentView key={sha256} module={module} onAnswer={onAnswer} />;
}
