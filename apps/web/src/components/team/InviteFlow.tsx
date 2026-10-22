import type { EnvironmentId, WorkspaceOrg, WorkspaceOrgResult } from "@t3tools/contracts";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { workspaceOrgChange } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

import { githubPeopleUrl, inviteDaysLeft, welcomeFacts } from "./teamView.logic";

// Same entrance values as the Team view (design/motion-language.md): 240ms, ease-out, 12px rise.
const ENTER =
  "transition-[opacity,transform] duration-[240ms] ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:translate-y-0 motion-reduce:starting:opacity-100";

type Invite = WorkspaceOrgResult["invites"][number];
type Scope = { readonly workspaceId?: string };

function InviteRow(props: {
  readonly invite: Invite;
  readonly index: number;
  readonly busy: boolean;
  readonly onRenew: (slug: string) => void;
}) {
  const { invite } = props;
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const days = inviteDaysLeft(invite, Date.now());
  const people = githubPeopleUrl(invite.link);
  return (
    <li
      className={`rounded-lg border px-3 py-2 ${ENTER}`}
      style={{ transitionDelay: `${Math.min(props.index, 6) * 60}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{invite.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{invite.github} ·{" "}
            {days === null ? "Expired" : `Open for ${days} ${days === 1 ? "day" : "days"}`}
          </p>
        </div>
        {days === null ? (
          <Button size="sm" disabled={props.busy} onClick={() => props.onRenew(invite.slug)}>
            {props.busy ? <Spinner /> : null}
            Send a new Invite
          </Button>
        ) : invite.link ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => copyToClipboard(invite.link, undefined)}
          >
            {isCopied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            {isCopied ? "Copied" : "Copy the link"}
          </Button>
        ) : null}
      </div>
      {days !== null ? (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
          <li>
            {people ? (
              <>
                Add @{invite.github} to your GitHub organization on{" "}
                <a
                  className="underline underline-offset-2"
                  href={people}
                  target="_blank"
                  rel="noreferrer"
                >
                  the people page
                </a>
                .
              </>
            ) : (
              <>Add @{invite.github} to your GitHub organization.</>
            )}
          </li>
          <li>
            {invite.link
              ? "Send them the link by text or email. It works for their GitHub account only."
              : "The Home repo has no remote yet, so there is no link. Connect it to GitHub first."}
          </li>
        </ol>
      ) : null}
    </li>
  );
}

/** Open Invites for an Owner: who, how long is left, the link to send, and the two steps. */
export function InviteCards(props: {
  readonly environmentId: EnvironmentId;
  readonly scope: Scope;
  readonly invites: WorkspaceOrgResult["invites"];
  readonly onChanged: () => void;
}) {
  const run = useAtomCommand(workspaceOrgChange, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (props.invites.length === 0) return null;

  const renew = async (member: string) => {
    setBusy(true);
    setMessage(null);
    const response = await run({
      environmentId: props.environmentId,
      input: { ...props.scope, change: { kind: "renewInvite", member } },
    });
    setBusy(false);
    if (response._tag !== "Success") setMessage("The new Invite could not be sent. Try again.");
    else if (response.value.result === "applied") props.onChanged();
    else setMessage(response.value.message);
  };

  return (
    <section aria-labelledby="team-invites-title" className="space-y-2">
      <h4 id="team-invites-title" className="text-sm font-medium">
        Invites
      </h4>
      <ul className="grid gap-2">
        {props.invites.map((invite, index) => (
          <InviteRow key={invite.slug} invite={invite} index={index} busy={busy} onRenew={renew} />
        ))}
      </ul>
      <p role="status" className="min-h-5 text-xs text-destructive">
        {message}
      </p>
    </section>
  );
}

/**
 * First open for an invited person: who is here and what they can reach, then one button that
 * accepts their own Invite. The server checks the GitHub account again on the tap.
 */
export function WelcomeCard(props: {
  readonly environmentId: EnvironmentId;
  readonly scope: Scope;
  readonly org: WorkspaceOrg;
  readonly slug: string;
  readonly onJoined: () => void;
}) {
  const run = useAtomCommand(workspaceOrgChange, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const facts = welcomeFacts(props.org, props.slug);

  const join = async () => {
    setBusy(true);
    setMessage(null);
    const response = await run({
      environmentId: props.environmentId,
      input: { ...props.scope, change: { kind: "acceptInvite" } },
    });
    setBusy(false);
    if (response._tag !== "Success") setMessage("Joining did not work. Try again.");
    else if (response.value.result === "applied") props.onJoined();
    else setMessage(response.value.message);
  };

  return (
    <section
      aria-labelledby="team-welcome-title"
      className={`rounded-lg border border-primary/30 bg-primary/5 p-5 ${ENTER}`}
    >
      <h3 id="team-welcome-title" className="text-lg font-semibold">
        Welcome{facts.business ? ` to ${facts.business}` : ""}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {facts.members} {facts.members === 1 ? "Member is" : "Members are"} here, in{" "}
        {facts.departments} {facts.departments === 1 ? "Department" : "Departments"}.
      </p>
      {facts.roles.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your Roles">
          {facts.roles.map((entry, index) => (
            <li
              key={entry.area}
              className={`rounded-md border bg-background px-2.5 py-1 text-xs ${ENTER}`}
              style={{ transitionDelay: `${120 + Math.min(index, 6) * 60}ms` }}
            >
              {entry.role} in {entry.area}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={busy} onClick={() => void join()}>
          {busy ? <Spinner /> : null}
          Join the team
        </Button>
        <p role="status" className="min-h-5 text-sm text-destructive">
          {message}
        </p>
      </div>
    </section>
  );
}
