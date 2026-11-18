import { useAuth } from "@clerk/react";
import type { EnvironmentId } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { DESKTOP_DOWNLOAD_URL } from "~/branding";
import { useRelayEnvironmentDiscovery } from "../state/environments";
import { CommandBlock } from "./CommandBlock";
import { useT3ConnectAuthPrompt } from "./clerk/useT3ConnectAuthPrompt";
import { CloudEnvironmentConnectRows } from "./cloud/CloudEnvironmentConnectList";
import { Button } from "./ui/button";

export function T3ConnectSteps() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // Adding the first computer unmounts this screen. Wait for all health checks
  // so every compatible registration is queued before that happens.
  const [autoAddedComputers] = useState(() => new Set<EnvironmentId>());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<EnvironmentId>>(() => new Set());
  const discovered = [...useRelayEnvironmentDiscovery().environments.values()];
  const discoverySettled =
    discovered.length > 0 && discovered.every(({ availability }) => availability !== "checking");
  return (
    <>
      <SetupStep number={1}>
        {isSignedIn ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CheckIcon className="size-4" />
            Signed in
          </p>
        ) : (
          <Button size="sm" disabled={!isLoaded} onClick={openAuthPrompt}>
            Sign in
          </Button>
        )}
      </SetupStep>
      <SetupStep number={2}>
        <RunOnComputer command="npx t3 connect" />
        {isSignedIn ? (
          <div className="mt-4 space-y-1.5">
            <CloudEnvironmentConnectRows
              primaryEnvironmentId={null}
              savedEnvironments={[]}
              refreshWhileEmpty
              selection={{
                ...(discoverySettled ? { autoSelectedComputers: autoAddedComputers } : {}),
                selectedIds,
                onChange: (environmentId, selected) =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (selected) next.add(environmentId);
                    else next.delete(environmentId);
                    return next;
                  }),
              }}
              empty={<p className="text-xs text-muted-foreground">Waiting for your computer…</p>}
            />
          </div>
        ) : null}
      </SetupStep>
    </>
  );
}

function SetupStep({
  number,
  children,
}: {
  readonly number: number;
  readonly children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="w-2 shrink-0 pt-1 text-muted-foreground">{number}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function RunOnComputer({ command }: { readonly command: string }) {
  return (
    <>
      <p>Run on your computer:</p>
      <CommandBlock command={command} className="mt-2" />
      <a
        className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        href={DESKTOP_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer noopener"
      >
        Or download the desktop app
      </a>
    </>
  );
}
