import type { EnvironmentId, WorkspaceOrgResult } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { workspaceOrgDecide } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

// Cards rise in with the same values as the Team view (design/motion-language.md).
const ENTER =
  "transition-[opacity,transform] duration-[240ms] ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:translate-y-0 motion-reduce:starting:opacity-100";

/**
 * Changes that widen access and wait for an Owner (ADR-0088). An Owner sees Approve and Reject.
 * Everyone else sees that the change waits. The server checks the Owner again on every tap.
 */
export function ProposalCards(props: {
  readonly environmentId: EnvironmentId;
  readonly scope: { readonly workspaceId?: string };
  readonly proposals: WorkspaceOrgResult["proposals"];
  readonly canDecide: boolean;
  readonly onDecided: () => void;
}) {
  const run = useAtomCommand(workspaceOrgDecide, { reportFailure: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (props.proposals.length === 0) return null;

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    setMessage(null);
    const response = await run({
      environmentId: props.environmentId,
      input: { ...props.scope, id, decision },
    });
    setBusyId(null);
    if (response._tag !== "Success") setMessage("The decision could not be sent. Try again.");
    else if (response.value.result === "applied" || response.value.result === "rejected")
      props.onDecided();
    else setMessage(response.value.message);
  };

  return (
    <section aria-labelledby="team-proposals-title" className="space-y-2">
      <h4 id="team-proposals-title" className="text-sm font-medium">
        Waiting for an Owner
      </h4>
      <ul className="grid gap-2">
        {props.proposals.map((proposal, index) => (
          <li
            key={proposal.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 ${ENTER}`}
            style={{ transitionDelay: `${Math.min(index, 6) * 60}ms` }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{proposal.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                Proposed by {proposal.proposedBy}
              </p>
            </div>
            {props.canDecide ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void decide(proposal.id, "reject")}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void decide(proposal.id, "approve")}
                >
                  {busyId === proposal.id ? <Spinner /> : null}
                  Approve
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">An Owner has to approve this.</p>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className="min-h-5 text-xs text-destructive">
        {message}
      </p>
    </section>
  );
}
