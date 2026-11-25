import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

/** One shared repair control. Account sign-in stays in the account rows. */
export function ClaudeRuntimeRepair({
  environmentId,
  instanceId,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly readOnly: boolean;
}) {
  const target = { environmentId, input: { instanceId } };
  const query = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const options = { reportFailure: false, reportDefect: false };
  const start = useAtomCommand(serverEnvironment.startProviderInstall, options);
  const cancel = useAtomCommand(serverEnvironment.cancelProviderInstall, options);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = query.data;
  const active =
    state?.phase === "downloading" || state?.phase === "extracting" || state?.phase === "verifying";
  const cause =
    error ?? (state?.phase === "failed" || state?.phase === "cancelled" ? state.message : null);
  const message = active
    ? state.phase === "downloading" && state.totalBytes
      ? `Repairing Claude. ${(state.downloadedBytes / 1_000_000).toFixed(1)} of ${(state.totalBytes / 1_000_000).toFixed(1)} MB.`
      : "Repairing Claude. Your accounts stay unchanged."
    : "Leonidas cannot find the shared Claude program. Your account settings are saved.";

  async function act() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result =
        active && state?.operationId
          ? await cancel({ environmentId, input: { instanceId, operationId: state.operationId } })
          : await start(target);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const failure = squashAtomCommandFailure(result);
        setError(
          failure instanceof Error ? failure.message : "Could not repair Claude. Try again.",
        );
      }
    } catch {
      setError("Could not contact the repair service. Check the connection, then try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
        {cause ? (
          <p role="alert" className="mt-1 text-xs break-words text-muted-foreground">
            {cause}
          </p>
        ) : null}
        {query.error ? (
          <p role="alert" className="mt-1 text-xs text-muted-foreground">
            Could not read repair status. Check the connection.
          </p>
        ) : null}
      </div>
      {!readOnly ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || Boolean(query.error) || (active && !state?.operationId)}
          onClick={() => void act()}
        >
          {active ? "Cancel" : "Repair Claude"}
        </Button>
      ) : null}
    </div>
  );
}
