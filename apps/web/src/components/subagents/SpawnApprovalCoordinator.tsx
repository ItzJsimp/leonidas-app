import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  SubagentSpawnApproval,
  SubagentSpawnDecision,
} from "@t3tools/contracts";
import { BotIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useEnvironmentIds } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { subagentRespondSpawnApproval, subagentSpawnApprovalsLive } from "~/state/subagents";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatLabel, formatStartCost, modelDisplayName } from "./spawnApproval.logic";

const TIER_SOURCE_LABEL: Record<SubagentSpawnApproval["tierSource"], string> = {
  app: "app map",
  aios: "your AIOS map",
  subagent: "set by this helper",
};

/**
 * Confirm cards for premium subagent spawns (ADR-0082). They float at the top right of every
 * screen, clear of the composer, so a spawn asked in a background chat still reaches the user.
 */
export function SpawnApprovalCoordinator() {
  const environmentIds = useEnvironmentIds();
  return (
    <div className="pointer-events-none fixed top-14 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {environmentIds.map((environmentId) => (
        <EnvironmentSpawnApprovals key={environmentId} environmentId={environmentId} />
      ))}
    </div>
  );
}

function EnvironmentSpawnApprovals({ environmentId }: { environmentId: EnvironmentId }) {
  // A server without this stream fails the subscription; `data` then stays null and nothing shows.
  const approvals = useEnvironmentQuery(
    subagentSpawnApprovalsLive({ environmentId, input: {} }),
  ).data;
  if (!approvals || approvals.length === 0) return null;
  return approvals.map((approval) => (
    <SpawnApprovalCard key={approval.id} environmentId={environmentId} approval={approval} />
  ));
}

function SpawnApprovalCard(props: {
  readonly environmentId: EnvironmentId;
  readonly approval: SubagentSpawnApproval;
}) {
  const { approval } = props;
  const respond = useAtomCommand(subagentRespondSpawnApproval, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectText, setRedirectText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const model = modelDisplayName(approval.model);
  const titleId = `spawn-approval-${approval.id}`;

  const answer = async (decision: SubagentSpawnDecision) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await respond({
      environmentId: props.environmentId,
      input: { id: approval.id, decision },
    });
    setBusy(false);
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
    const failure = squashAtomCommandFailure(result);
    setError(
      failure instanceof Error && failure.message.length > 0
        ? failure.message
        : "The answer did not reach the server. Try again.",
    );
  };

  const submitRedirect = (event: FormEvent) => {
    event.preventDefault();
    const text = redirectText.trim();
    if (text.length > 0) void answer({ kind: "redirect", text });
  };

  return (
    <section
      role="alertdialog"
      aria-labelledby={titleId}
      className="pointer-events-auto flex flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
    >
      <header className="flex items-start gap-2.5">
        <BotIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate font-medium">
            Start {approval.subagent} on {model}?
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            Asked in {approval.threadTitle || "a chat"}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Model</dt>
        <dd className="truncate" title={approval.model}>
          {model}
        </dd>
        {approval.effort === undefined ? null : (
          <>
            <dt className="text-muted-foreground">Effort</dt>
            <dd>{formatLabel(approval.effort)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Account</dt>
        <dd className="truncate">{approval.account}</dd>
        {approval.accountUsage === undefined ? null : (
          <>
            <dt className="text-muted-foreground">Usage</dt>
            <dd className="break-words">{approval.accountUsage}</dd>
          </>
        )}
        {approval.runtimeMode === undefined ? null : (
          <>
            <dt className="text-muted-foreground">Access</dt>
            <dd>{formatLabel(approval.runtimeMode)}</dd>
          </>
        )}
        {approval.workspace === undefined ? null : (
          <>
            <dt className="text-muted-foreground">Folder</dt>
            <dd className="break-all font-mono text-2xs">{approval.workspace}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Start cost</dt>
        <dd className="tabular-nums">
          {formatStartCost(approval.estimatedStartTokens)} · {approval.toolCount}{" "}
          {approval.toolCount === 1 ? "tool" : "tools"}
        </dd>
        {approval.roughCost === undefined ? null : (
          <>
            <dt className="text-muted-foreground">Rough cost</dt>
            <dd className="tabular-nums">{approval.roughCost}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Files</dt>
        <dd className="min-w-0">
          {approval.filesInScope.length === 0 ? (
            <span className="text-muted-foreground">Persona only</span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {approval.filesInScope.slice(0, 5).map((file) => (
                <li key={file} className="truncate font-mono text-[11px]" title={file}>
                  {file}
                </li>
              ))}
              {approval.filesInScope.length > 5 ? (
                <li className="text-muted-foreground">
                  and {approval.filesInScope.length - 5} more
                </li>
              ) : null}
            </ul>
          )}
        </dd>
        <dt className="text-muted-foreground">Reason</dt>
        <dd className="line-clamp-3 break-words">{approval.reason}</dd>
        {approval.task === undefined || approval.task === approval.reason ? null : (
          <>
            <dt className="text-muted-foreground">Task</dt>
            <dd className="line-clamp-4 break-words">{approval.task}</dd>
          </>
        )}
      </dl>

      {approval.capWarning === true ? (
        <p role="status" className="rounded-md bg-warning/10 px-2 py-1.5 text-xs">
          You have used 80 percent of today's agent cap. Change it in Settings.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Confirm tier ({TIER_SOURCE_LABEL[approval.tierSource]}): {approval.goodFor}
      </p>
      {approval.engineNote === undefined ? null : (
        <p className="text-xs text-muted-foreground">{approval.engineNote}</p>
      )}

      {redirecting ? (
        <form className="flex flex-col gap-2" onSubmit={submitRedirect}>
          <Textarea
            autoFocus
            aria-label="Tell the agent what to do instead"
            placeholder="Tell the agent what to do instead"
            value={redirectText}
            onChange={(event) => setRedirectText(event.target.value)}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setRedirecting(false)}>
              Back
            </Button>
            <Button size="sm" type="submit" disabled={busy || redirectText.trim().length === 0}>
              Send
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void answer({ kind: "allow_once" })}>
            Allow once
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void answer({ kind: "allow_thread" })}
          >
            Allow for this thread
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void answer({ kind: "deny" })}
          >
            Deny
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRedirecting(true)}>
            Redirect
          </Button>
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      )}
    </section>
  );
}
