import {
  getProviderReadiness,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { InlineButton } from "../ui/button";
import { useNowMinute } from "../../hooks/useNowMinute";

const actionLabels = {
  install: "Install",
  sign_in: "Sign in",
  switch_account: "Switch account",
  wait: "Wait",
  check: "Check again",
  check_connection: "Check connection",
} as const;
export const READINESS_DOT = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
} as const;

/** The picker and setup share the same instance-scoped commands and progress view. */
export function ProviderReadinessControl(props: {
  environmentId: EnvironmentId | null;
  provider: ServerProvider;
  onOpenProviderSetup?: ((instanceId: ProviderInstanceId) => void) | undefined;
  onSwitchAccount?: (() => void) | undefined;
}) {
  const nowMinute = useNowMinute();
  const readiness = getProviderReadiness(props.provider, {
    nowMs: Date.parse(`${nowMinute}:00Z`),
    canSwitch: props.onSwitchAccount !== undefined,
  });
  const commands = { reportFailure: false, reportDefect: false };
  const install = useAtomCommand(serverEnvironment.startProviderInstall, commands);
  const update = useAtomCommand(serverEnvironment.updateProvider, commands);
  const signIn = useAtomCommand(serverEnvironment.startProviderAuth, commands);
  const check = useAtomCommand(serverEnvironment.refreshProviders, commands);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = readiness.action;
  async function repair() {
    if (busy.current || !props.environmentId || !action) return;
    if (action === "switch_account") {
      props.onSwitchAccount?.();
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    const target = {
      environmentId: props.environmentId,
      input: { instanceId: props.provider.instanceId },
    };
    try {
      if (
        action === "install" &&
        !props.provider.setup?.canInstall &&
        !props.provider.versionAdvisory?.canUpdate
      ) {
        setError(
          "Automatic install is unavailable for this account. Open its settings to install the CLI.",
        );
        props.onOpenProviderSetup?.(props.provider.instanceId);
        return;
      }
      if (action === "sign_in" && props.provider.setup?.canAuthenticate === false) {
        setError("This account requires external sign-in. Open its settings for instructions.");
        props.onOpenProviderSetup?.(props.provider.instanceId);
        return;
      }
      const result =
        action === "install"
          ? props.provider.installed && props.provider.versionAdvisory?.canUpdate
            ? await update({
                ...target,
                input: {
                  ...target.input,
                  provider: props.provider.driver,
                  ...(props.provider.compatibilityAdvisory?.recommendedVersion
                    ? { targetVersion: props.provider.compatibilityAdvisory.recommendedVersion }
                    : {}),
                },
              })
            : await install(target)
          : action === "sign_in"
            ? await signIn(target)
            : await check(target);
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const failure = squashAtomCommandFailure(result);
          setError(
            failure instanceof Error ? failure.message : "Connection check failed. Try again.",
          );
        }
      } else if (action === "install" || action === "sign_in") {
        props.onOpenProviderSetup?.(props.provider.instanceId);
      }
    } catch {
      setError("Repair failed. Try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div
      // A healthy account is a quiet one-line hint; only problems get the full row.
      className={
        readiness.color === "green" && !error
          ? "flex flex-col px-3 py-1 text-2xs opacity-60"
          : "flex flex-col gap-1 px-3 py-2 text-xs"
      }
      data-provider-readiness={readiness.color}
    >
      <div className="flex items-center gap-2">
        <span
          className={`size-1.5 shrink-0 rounded-full ${READINESS_DOT[readiness.color]}`}
          aria-hidden="true"
        />
        <span role="status" className="min-w-0 flex-1 text-muted-foreground">
          {readiness.reason}
          {readiness.resetsAt
            ? `; resets ${new Date(readiness.resetsAt).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}`
            : ""}
        </span>
        {action && props.environmentId ? (
          <InlineButton onClick={() => void repair()} disabled={pending || action === "wait"}>
            {pending ? "Checking..." : actionLabels[action]}
          </InlineButton>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
