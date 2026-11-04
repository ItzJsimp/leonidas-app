"use client";

import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthProvidersManageScope,
  ProviderInstanceId,
  type EnvironmentId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { userErrorToastFields } from "~/lib/userErrorToast";
import { cn } from "../../lib/utils";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { WizardHeader, WizardPanel, WizardPopup } from "../ui/wizard";
import {
  CONNECT_CHOICES,
  planQuickConnect,
  sharesLoginWithOtherAccount,
  type ConnectChoice,
} from "./ConnectAccountDialog.logic";
import { AddManagedCodexAccountDialog } from "./CodexSetupSection";
import { ProviderWizardAuthenticationStep } from "./ProviderWizardAuthenticationStep";
import { ClaudeSignInCard } from "../onboarding/ClaudeSignInCard";

const noop = () => {};
const STEP_LABELS = ["Pick", "Sign in", "Done"] as const;

function StepDots({ step }: { readonly step: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Progress">
      {STEP_LABELS.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5",
            index === step && "font-medium text-foreground",
          )}
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border border-border text-2xs",
              index <= step && "border-foreground/40 bg-foreground/10",
            )}
          >
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

/**
 * The simple way to connect an account: pick a service, sign in, done.
 * Names, ids and folders are chosen for the user. Full control stays in the
 * advanced dialog, reached from the footer link.
 */
export function ConnectAccountDialog({
  environmentId,
  environmentLabel,
  initialChoice,
  onOpenChange,
  onCreated,
  onAdvanced,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly initialChoice?: ConnectChoice | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (instanceId: ProviderInstanceId) => void;
  readonly onAdvanced: () => void;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const persist = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const canManage = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
    reportDefect: false,
  });
  const [chatGpt, setChatGpt] = useState(initialChoice === "chatgpt");
  const [instanceId, setInstanceId] = useState<ProviderInstanceId | null>(null);
  const [busy, setBusy] = useState<ConnectChoice | null>(null);

  const existingIds = useMemo(
    () => new Set(["codex", "claudeAgent", ...Object.keys(settings.providerInstances ?? {})]),
    [settings.providerInstances],
  );

  const connectedProvider =
    instanceId === null
      ? undefined
      : providers.find((provider) => provider.instanceId === instanceId);
  const [signedInHere, setSignedInHere] = useState(false);
  // A new Claude account that already shows another account's email has no login of its own.
  const sharesLogin =
    connectedProvider?.driver === "claudeAgent" &&
    sharesLoginWithOtherAccount(
      { instanceId: connectedProvider.instanceId, email: connectedProvider.auth.email },
      providers
        .filter((provider) => provider.driver === "claudeAgent")
        .map((provider) => ({ instanceId: provider.instanceId, email: provider.auth.email })),
    );
  const signedIn =
    connectedProvider?.auth.status === "authenticated" && (!sharesLogin || signedInHere);
  const step = instanceId === null ? 0 : signedIn ? 2 : 1;

  const connect = async (choice: ConnectChoice) => {
    if (choice === "chatgpt") {
      setChatGpt(true);
      return;
    }
    const info = CONNECT_CHOICES.find((entry) => entry.id === choice)!;
    const sameDriver = providers.filter((provider) => provider.driver === info.driver);
    const reusable = sameDriver.length === 1 ? sameDriver[0] : undefined;
    if (reusable && reusable.auth.status !== "authenticated") {
      setInstanceId(reusable.instanceId);
      return;
    }
    const plan = planQuickConnect({
      choice,
      existingIds,
      sameDriverCount: sameDriver.length,
    });
    const nextInstance: ProviderInstanceConfig = {
      driver: info.driver as ProviderInstanceConfig["driver"],
      enabled: true,
      displayName: plan.displayName,
      ...(plan.config ? { config: plan.config } : {}),
    };
    const brandedId = ProviderInstanceId.make(plan.instanceId);
    setBusy(choice);
    const result = await persist({
      operation: "create",
      instanceId: brandedId,
      instance: nextInstance,
    });
    setBusy(null);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "Could not connect the account",
        ...userErrorToastFields(squashAtomCommandFailure(result)),
      });
      return;
    }
    onCreated?.(brandedId);
    setInstanceId(brandedId);
    // The new account has no status until the server probes it once.
    void refreshProviders({ environmentId, input: {} });
  };

  // A tile on the page already chose the service: start right away.
  const autoConnected = useRef(false);
  useEffect(() => {
    if (autoConnected.current || !initialChoice || initialChoice === "chatgpt" || !canManage) {
      return;
    }
    autoConnected.current = true;
    void connect(initialChoice);
    // `connect` reads current settings; the ref keeps this to one run on open.
  }, [initialChoice, canManage, connect]);

  if (chatGpt) {
    return (
      <AddManagedCodexAccountDialog
        environmentId={environmentId}
        onClose={() => onOpenChange(false)}
      />
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <WizardPopup>
        <WizardHeader
          title="Connect an account"
          description="Use the plan you already pay for. Nothing extra to set up."
        >
          <StepDots step={step} />
        </WizardHeader>
        {instanceId === null ? (
          <WizardPanel>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONNECT_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={!canManage || busy !== null}
                  onClick={() => void connect(choice.id)}
                  className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-60"
                >
                  <span className="text-sm font-medium text-foreground">
                    {busy === choice.id ? "Connecting…" : choice.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{choice.plans}</span>
                </button>
              ))}
            </div>
          </WizardPanel>
        ) : signedIn ? (
          <WizardPanel>
            <p className="text-sm text-foreground">
              {connectedProvider?.displayName ?? "Your account"} is connected. Your usage will show
              up in Providers.
            </p>
          </WizardPanel>
        ) : connectedProvider?.driver === "claudeAgent" ? (
          <WizardPanel>
            <ClaudeSignInCard
              environmentId={environmentId}
              provider={connectedProvider}
              displayName={connectedProvider.displayName || "Claude"}
              autoStart
              forceSignIn
              onSignedIn={() => setSignedInHere(true)}
              onAutoStartConsumed={noop}
              terminalOpen={false}
              terminalAvailable={false}
              onOpenTerminal={noop}
            />
          </WizardPanel>
        ) : connectedProvider === undefined ? (
          <WizardPanel>
            <p className="text-sm text-muted-foreground">Getting your account ready…</p>
          </WizardPanel>
        ) : (
          <ProviderWizardAuthenticationStep
            environmentId={environmentId}
            environmentLabel={environmentLabel}
            instanceId={connectedProvider.instanceId}
            onFinish={() => onOpenChange(false)}
          />
        )}
        <div className="flex items-center justify-between gap-2 px-6 pt-1 pb-5">
          <Button variant="ghost-muted" size="sm" onClick={onAdvanced}>
            Advanced setup
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {step === 2 ? "Done" : "Close"}
          </Button>
        </div>
      </WizardPopup>
    </Dialog>
  );
}
