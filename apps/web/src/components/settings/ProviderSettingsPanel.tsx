import { SettingsGroup } from "./SettingsGroup";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  AuthSettingsWriteScope,
  AuthProvidersManageScope,
  AuthOrchestrationReadScope,
} from "@t3tools/contracts";
import { useEnvironmentScope, readEnvironmentScope } from "../../state/session";
import { useAtomValue } from "@effect/atom-react";
import { connectionStatusTitle } from "@t3tools/client-runtime/connection";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  defaultInstanceIdForDriver,
  type EnvironmentId,
  type AcpRegistryUrlAuthAction,
  PROVIDER_DISPLAY_NAMES,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  resolveEnvironmentMachineKind,
  resolveProviderInstanceEnabled,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import {
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";
import * as Arr from "effect/Array";
import * as Duration from "effect/Duration";
import * as Result from "effect/Result";
import { PlusIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { isDesktopLocalConnectionTarget } from "../../connection/desktopLocal";
import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
  useUpdateEnvironmentSettings,
  useUpdateEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "../../hooks/useSettings";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { cn } from "../../lib/utils";
import { resolveAppModelSelectionState } from "../../modelSelection";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  type EnvironmentPresentation,
} from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useEnvironmentSessionState } from "../../state/session";
import { useProjects } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { getRelativeTimeState } from "../../timestampFormat";
import {
  ConnectionStatusDot,
  connectionPhaseDotClassName,
  connectionPhasePingClassName,
} from "../ConnectionStatusDot";
import {
  isProviderSettingsUpdateCandidate,
  isProviderUpdateActive,
  type ProviderSettingsUpdateCandidate,
} from "../ProviderUpdateLaunchNotification.logic";
import { ProviderUpdatesAction } from "../ProviderUpdatesAction";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Sheet, SheetDescription, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { AddProviderInstanceDialog } from "./AddProviderInstanceDialog";
import { ConnectAccountDialog } from "./ConnectAccountDialog";
import { CONNECT_CHOICES, type ConnectChoice } from "./ConnectAccountDialog.logic";
import { ClaudeSignInDialog, ConnectTiles, TextValueDialog } from "./ProviderAccountDialogs";
import { ProviderAccountGroups, type AccountRowView } from "./ProviderAccountGroups";
import { accountUsage, describeAccount, groupAccountRows } from "./providerAccounts.logic";
import { ClaudeRuntimeRepair } from "./ClaudeRuntimeRepair";
import { ExpandableText } from "./ExpandableText";
import { ProviderInstanceCard, providerInstanceNeedsApiKey } from "./ProviderInstanceCard";
import { sharedLoginPeerNames, sharedLoginWarning } from "../chat/signInAgain";
import { UsageProviderSettings } from "./UsageProviderSettings";
import { ProviderSetupSection, readAntigravityAuthMethod } from "./ProviderSetupSection";
import { ProviderAuthenticationSection } from "./ProviderAuthenticationSection";
import { CodexSetupSection, CodexManagedRuntimeFields } from "./CodexSetupSection";
import { readCodexSetupMode } from "./CodexSetupSection.logic";
import { providerClients } from "./providerDriverMeta";
import { searchableSetting } from "./settingsSearch";
import {
  backgroundActivityOverrideSettings,
  buildProviderInstanceUpdatePatch,
  durationToSeconds,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
} from "./SettingsPanels.logic";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import {
  buildProviderEnvironmentOptions,
  classifyProviderEnvironmentAccess,
  isProviderSettingsEnvironmentAvailable,
  type ProviderEnvironmentAccess,
  type ProviderOperateAccess,
  resolveRemoteOperateAccess,
  resolveSelectedProviderEnvironmentId,
} from "./ProviderSettingsPanel.logic";
import { userErrorToastFields } from "~/lib/userErrorToast";

function modelListChanges(current: ReadonlyArray<string>, next: ReadonlyArray<string>) {
  const currentSet = new Set(current);
  const nextSet = new Set(next.map((model) => model.trim()).filter(Boolean));
  return [...new Set([...currentSet, ...nextSet])]
    .filter((model) => currentSet.has(model) !== nextSet.has(model))
    .map((model) => ({ model, selected: nextSet.has(model) }));
}

function providerConfigString(config: unknown, key: string): string | null {
  if (config === null || typeof config !== "object") return null;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const PROVIDER_SETTINGS = providerClients.definitions.map((definition) => ({
  provider: definition.driverKind,
  hasDefaultInstance: definition.hasDefaultInstance !== false,
}));

function configuredBinaryPath(config: unknown): string {
  if (config === null || typeof config !== "object" || !("binaryPath" in config)) return "";
  return typeof config.binaryPath === "string" ? config.binaryPath.trim() : "";
}

function ProviderLastChecked({ lastCheckedAt }: { lastCheckedAt: string | null }) {
  useRelativeTimeTick();
  const lastCheckedRelative = getRelativeTimeState(lastCheckedAt);

  if (lastCheckedRelative.status === "missing") {
    return null;
  }

  if (lastCheckedRelative.status === "invalid") {
    return <span>Checked unavailable</span>;
  }

  return (
    <span>
      {lastCheckedRelative.suffix ? (
        <>
          Checked <span className="font-mono tabular-nums">{lastCheckedRelative.value}</span>{" "}
          {lastCheckedRelative.suffix}
        </>
      ) : (
        <>Checked {lastCheckedRelative.value}</>
      )}
    </span>
  );
}

function providerEnvironmentDetail(environment: EnvironmentPresentation): string {
  if (environment.entry.target._tag === "PrimaryConnectionTarget") return "Primary device";
  if (environment.relayManaged) return "Remote access";
  if (environment.entry.target._tag === "SshConnectionTarget") return "SSH";
  if (isDesktopLocalConnectionTarget(environment.entry.target)) return "Local device";
  return environment.displayUrl ?? "Remote device";
}

// Shared by the editor grid and the placeholder states so switching devices
// never changes the card's footprint.
const providerCardHeightClassName =
  "@min-[48rem]/providers:h-[min(44rem,calc(100dvh-11rem))] @min-[48rem]/providers:min-h-[32rem]";

/**
 * Same chrome as the provider editor (section heading, floating device tabs,
 * tall card) for states that cannot render provider settings yet.
 */
function ProviderSettingsPlaceholder({
  deviceTabs,
  icon,
  title,
  description,
  children,
}: {
  readonly deviceTabs?: ReactNode;
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <SettingsSection {...searchableSetting("providers")} variant="plain">
      {deviceTabs ? (
        <div className="flex min-h-11 min-w-0 items-center px-3 sm:px-4">{deviceTabs}</div>
      ) : null}
      <SettingsGroup
        divided={false}
        className={cn(
          providerCardHeightClassName,
          "scrollbar-gutter-both flex overflow-x-hidden overflow-y-auto",
        )}
      >
        <Empty>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          {children ? <EmptyContent className="max-w-xl">{children}</EmptyContent> : null}
        </Empty>
      </SettingsGroup>
    </SettingsSection>
  );
}

function EnvironmentUnavailablePlaceholder({
  environment,
  access,
  deviceTabs,
}: {
  readonly environment: EnvironmentPresentation;
  readonly access: Exclude<ProviderEnvironmentAccess, { kind: "editable" | "read-only" }>;
  readonly deviceTabs?: ReactNode;
}) {
  const isLoading = access.kind === "loading";
  const title = isLoading
    ? "Loading AI service settings"
    : access.kind === "error"
      ? "Could not connect to this device. Check the connection and try again."
      : "AI service settings are not available";
  // Keep the description to a short status; the raw failure can be a
  // multi-paragraph CLI dump, so it goes below, clamped and expandable.
  const description = isLoading
    ? access.reason === "permissions"
      ? "Checking what you are allowed to change."
      : `Waiting for the settings of ${environment.label}.`
    : connectionStatusTitle(environment.connection);
  const error = isLoading ? null : environment.connection.error;
  // No spinner: this state can persist indefinitely for a wedged device, and a
  // continuously repainting animation would run the whole time.
  return (
    <ProviderSettingsPlaceholder
      deviceTabs={deviceTabs}
      icon={
        <EnvironmentMachineIcon kind={resolveEnvironmentMachineKind(environment.serverConfig)} />
      }
      title={title}
      description={description}
    >
      {error ? (
        <ExpandableText
          key={environment.environmentId}
          text={error}
          className="w-full text-left font-mono text-xs leading-relaxed text-muted-foreground"
        />
      ) : null}
    </ProviderSettingsPlaceholder>
  );
}

interface ProviderSettingsTarget {
  readonly environmentId?: EnvironmentId;
  readonly instanceId?: ProviderInstanceId;
  readonly scoped?: boolean;
  readonly environmentIds?: readonly EnvironmentId[];
}

export function ProviderSettingsPanel(target: ProviderSettingsTarget) {
  return (
    <SettingsPageContainer className="@container/providers gap-8">
      <ProviderSettingsPanelContent
        key={`${target.environmentId ?? ""}:${target.instanceId ?? ""}`}
        {...target}
      />
    </SettingsPageContainer>
  );
}

function ProviderSettingsPanelContent(target: ProviderSettingsTarget) {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const searchTargetId = useSettingsSearchTargetId();
  const options = buildProviderEnvironmentOptions(
    environments,
    primaryEnvironmentId,
    target.environmentIds,
  );
  // Raw user intent; the effective selection is re-derived every render so a
  // device that drops out of the catalog falls back without erasing the pick —
  // if it reappears (e.g. after a reconnect) the selection is restored.
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    target.environmentId ?? primaryEnvironmentId,
  );
  const targetEnvironmentMissing =
    target.environmentId !== undefined &&
    selectedEnvironmentId === target.environmentId &&
    !options.some((environment) => environment.environmentId === target.environmentId);
  const effectiveEnvironmentId =
    target.scoped || targetEnvironmentMissing
      ? target.environmentId
      : resolveSelectedProviderEnvironmentId(options, selectedEnvironmentId, primaryEnvironmentId);
  const selectedEnvironment =
    options.find((environment) => environment.environmentId === effectiveEnvironmentId) ?? null;
  const selectedEnvironmentCanRenderSettings =
    selectedEnvironment !== null &&
    isProviderSettingsEnvironmentAvailable({
      connectionPhase: selectedEnvironment.connection.phase,
      hasServerConfig: selectedEnvironment.serverConfig !== null,
    });
  const searchableEnvironmentId = options.find((environment) =>
    isProviderSettingsEnvironmentAvailable({
      connectionPhase: environment.connection.phase,
      hasServerConfig: environment.serverConfig !== null,
    }),
  )?.environmentId;
  const searchableCursorEnvironmentId = options.find(
    (environment) =>
      environment.serverConfig?.environment.platform.os === "darwin" &&
      isProviderSettingsEnvironmentAvailable({
        connectionPhase: environment.connection.phase,
        hasServerConfig: true,
      }),
  )?.environmentId;
  const searchEnvironmentSelection =
    !target.scoped &&
    searchTargetId === searchableSetting("cursor-keychain-usage").id &&
    (!selectedEnvironmentCanRenderSettings ||
      selectedEnvironment?.serverConfig?.environment.platform.os !== "darwin") &&
    searchableCursorEnvironmentId !== undefined
      ? searchableCursorEnvironmentId
      : !target.scoped &&
          (searchTargetId === searchableSetting("provider-health-check-interval").id ||
            searchTargetId === searchableSetting("usage-providers").id) &&
          !selectedEnvironmentCanRenderSettings &&
          searchableEnvironmentId !== undefined
        ? searchableEnvironmentId
        : undefined;
  if (
    searchEnvironmentSelection !== undefined &&
    searchEnvironmentSelection !== selectedEnvironmentId
  ) {
    setSelectedEnvironmentId(searchEnvironmentSelection);
  }
  const onlyPrimaryDevice =
    options.length === 1 && options[0]?.entry.target._tag === "PrimaryConnectionTarget";
  const deviceTabs =
    !target.scoped && !onlyPrimaryDevice && options.length > 0 ? (
      <ScrollArea radius="none" hideScrollbars scrollFade className="h-11 min-w-0 flex-1">
        <ToggleGroup
          aria-label="Devices"
          variant="segmented"
          className="my-2"
          value={effectiveEnvironmentId ? [effectiveEnvironmentId] : []}
          onValueChange={(next) => {
            const environment = options.find((option) => option.environmentId === next[0]);
            if (environment) setSelectedEnvironmentId(environment.environmentId);
          }}
        >
          {options.map((environment) => {
            const machine = resolveEnvironmentMachineKind(environment.serverConfig);
            const detail = providerEnvironmentDetail(environment);
            const statusText = connectionStatusTitle(environment.connection);
            return (
              <Tooltip key={environment.environmentId}>
                <TooltipTrigger
                  render={
                    <Toggle value={environment.environmentId}>
                      <EnvironmentMachineIcon
                        kind={machine}
                        className="size-3.5 shrink-0"
                        aria-hidden
                      />
                      <span className="max-w-40 truncate">{environment.label}</span>
                      {environment.connection.phase !== "connected" ? (
                        <ConnectionStatusDot
                          dotClassName={connectionPhaseDotClassName(environment.connection.phase)}
                          pingClassName={connectionPhasePingClassName(environment.connection.phase)}
                        />
                      ) : null}
                      <span className="sr-only">
                        {detail}, {statusText}
                      </span>
                    </Toggle>
                  }
                />
                <TooltipPopup side="top">
                  {detail} · {statusText}
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </ScrollArea>
    ) : null;

  return (
    <>
      {targetEnvironmentMissing ? (
        <ProviderSettingsPlaceholder
          deviceTabs={deviceTabs}
          icon={<EnvironmentMachineIcon kind={resolveEnvironmentMachineKind(null)} />}
          title="Device unavailable"
          description="Connect this device again to set up its AI services, or choose another device."
        />
      ) : null}
      {options.length === 0 && !targetEnvironmentMissing ? (
        <ProviderSettingsPlaceholder
          icon={<EnvironmentMachineIcon kind={resolveEnvironmentMachineKind(null)} />}
          title={isReady ? "No connected devices" : "Loading devices"}
          description={
            isReady
              ? "Connect a computer, then set up AI services."
              : "Reading the connected computers."
          }
        />
      ) : null}

      {selectedEnvironment ? (
        <SelectedEnvironmentProviderSettings
          key={selectedEnvironment.environmentId}
          environment={selectedEnvironment}
          deviceTabs={deviceTabs}
          targetInstanceId={
            target.environmentId === undefined ||
            selectedEnvironment.environmentId === target.environmentId
              ? target.instanceId
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function SelectedEnvironmentProviderSettings({
  environment,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  return (
    <RemoteSessionGatedProviderSettings
      environment={environment}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

function RemoteSessionGatedProviderSettings({
  environment,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const sessionState = useEnvironmentSessionState(environment.environmentId);
  const operateAccess = resolveRemoteOperateAccess({
    session: sessionState.data,
    isPending: sessionState.isPending,
    hasError: sessionState.hasError,
  });
  return (
    <AccessGatedProviderSettings
      environment={environment}
      operateAccess={operateAccess}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

function AccessGatedProviderSettings({
  environment,
  operateAccess,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly operateAccess: ProviderOperateAccess;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const access = classifyProviderEnvironmentAccess({
    connectionPhase: environment.connection.phase,
    hasServerConfig: environment.serverConfig !== null,
    operateAccess,
  });
  if (access.kind !== "editable" && access.kind !== "read-only") {
    return (
      <EnvironmentUnavailablePlaceholder
        environment={environment}
        access={access}
        deviceTabs={deviceTabs}
      />
    );
  }
  return (
    <EnvironmentProviderSettings
      environmentId={environment.environmentId}
      environmentLabel={environment.label}
      readOnly={access.kind === "read-only"}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

export function EnvironmentProviderSettings({
  environmentId,
  environmentLabel,
  readOnly = false,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
  /**
   * Grey out and freeze every write control when this session's credential
   * lacks `providers:manage` on the environment. Selecting providers
   * still works so the real configuration stays readable; switches, forms,
   * are inert so no write is offered and then rejected.
   */
  readonly readOnly?: boolean;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const canWriteSettings = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const canRefreshProviders = useEnvironmentScope(environmentId, AuthOrchestrationReadScope);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const updateModelPreferences = useUpdateEnvironmentModelPreferences(environmentId);
  const toggleModelFavorite = useToggleEnvironmentModelFavorite(environmentId);
  const persistProviderInstance = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const serverProviders =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const refreshServerProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const uninstallAcpRegistryManagedBinary = useAtomCommand(
    serverEnvironment.uninstallAcpRegistryManagedBinary,
    { reportFailure: false },
  );
  const acceptAcpRegistryUrlAuth = useAtomCommand(serverEnvironment.acceptAcpRegistryUrlAuth, {
    reportFailure: false,
  });
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);
  const [isAddInstanceDialogOpen, setIsAddInstanceDialogOpen] = useState(false);
  const [isAdvancedAddOpen, setIsAdvancedAddOpen] = useState(false);
  const [connectChoice, setConnectChoice] = useState<ConnectChoice | undefined>(undefined);
  // One account dialog or sheet at a time, keyed by the account it acts on.
  const [accountPanel, setAccountPanel] = useState<{
    readonly kind: "settings" | "rename" | "apiKey" | "signIn" | "remove";
    readonly instanceId: ProviderInstanceId;
  } | null>(targetInstanceId ? { kind: "settings", instanceId: targetInstanceId } : null);
  const [updatingProviderInstanceIds, setUpdatingProviderInstanceIds] = useState<
    ReadonlySet<ProviderInstanceId>
  >(() => new Set());
  const refreshingRef = useRef(false);
  const updatingInstanceIdsRef = useRef<Set<ProviderInstanceId>>(new Set());

  const acceptUrlAuthentication = (
    instanceId: ProviderInstanceId,
    action: AcpRegistryUrlAuthAction,
  ) => {
    void acceptAcpRegistryUrlAuth({
      environmentId,
      input: { instanceId, elicitationId: action.elicitationId },
    }).then((result) => {
      if (result._tag === "Success" && !result.value.accepted) {
        toastManager.add({
          type: "warning",
          title: "The sign-in request ran out of time",
          description: "Refresh the AI service and start the sign-in again.",
        });
        return;
      }
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not continue sign-in",
          ...userErrorToastFields(error),
        });
      }
    });
  };

  const providerUpdateCandidateByInstanceId = new Map(
    serverProviders
      .filter(isProviderSettingsUpdateCandidate)
      .map((candidate) => [candidate.instanceId, candidate]),
  );
  const visibleProviderSettings = PROVIDER_SETTINGS.filter(
    (providerSettings) =>
      providerSettings.provider !== "cursor" ||
      serverProviders.some(
        (provider) =>
          provider.instanceId === defaultInstanceIdForDriver(ProviderDriverKind.make("cursor")),
      ),
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(settings, serverProviders);
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const providerHealthPreset = getBackgroundActivityPresetSettings(
    resolvedBackgroundActivity.profile,
  ).providerHealthRefreshInterval;
  const providerHealthRefreshIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.providerHealthRefreshInterval,
  );
  const defaultProviderHealthRefreshIntervalSeconds = durationToSeconds(providerHealthPreset);
  const lastCheckedAt =
    serverProviders.length > 0
      ? serverProviders.reduce(
          (latest, provider) => (provider.checkedAt > latest ? provider.checkedAt : latest),
          serverProviders[0]!.checkedAt,
        )
      : null;

  const refreshProviders = () => {
    if (refreshingRef.current || !readEnvironmentScope(environmentId, AuthOrchestrationReadScope))
      return;
    refreshingRef.current = true;
    setIsRefreshingProviders(true);
    void (async () => {
      const result = await refreshServerProviders({
        environmentId,
        input: { refreshModels: true },
      });
      refreshingRef.current = false;
      setIsRefreshingProviders(false);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        console.warn("Failed to refresh providers", {
          operation: "refresh-providers",
          environmentId,
          ...safeErrorLogAttributes(squashAtomCommandFailure(result)),
        });
      }
    })();
  };

  const runProviderUpdate = async (
    candidate: Pick<ProviderSettingsUpdateCandidate, "driver" | "instanceId">,
    targetVersion?: string,
  ) => {
    if (!readEnvironmentScope(environmentId, AuthProvidersManageScope)) return;
    // Ref-based re-entry guard, mirroring refreshProviders: a state updater
    // may run after this function returns, so it cannot gate the dispatch.
    if (updatingInstanceIdsRef.current.has(candidate.instanceId)) {
      return;
    }
    updatingInstanceIdsRef.current.add(candidate.instanceId);
    setUpdatingProviderInstanceIds((previous) => new Set(previous).add(candidate.instanceId));

    const result = await updateProvider({
      environmentId,
      input: {
        provider: candidate.driver,
        instanceId: candidate.instanceId,
        ...(targetVersion ? { targetVersion } : {}),
      },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: `Could not update ${PROVIDER_DISPLAY_NAMES[candidate.driver] ?? candidate.driver}`,
          ...userErrorToastFields(error),
        }),
      );
    }
    updatingInstanceIdsRef.current.delete(candidate.instanceId);
    setUpdatingProviderInstanceIds((previous) => {
      if (!previous.has(candidate.instanceId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(candidate.instanceId);
      return next;
    });
  };

  interface InstanceRow {
    readonly instanceId: ProviderInstanceId;
    readonly instance: ProviderInstanceConfig;
    readonly driver: ProviderDriverKind;
    readonly isDefault: boolean;
    readonly isDirty?: boolean;
  }

  const instancesByDriver = new Map<
    ProviderDriverKind,
    Array<[ProviderInstanceId, ProviderInstanceConfig]>
  >();
  for (const [rawId, instance] of Object.entries(settings.providerInstances ?? {})) {
    const driver = instance.driver;
    const list = instancesByDriver.get(driver) ?? [];
    list.push([rawId as ProviderInstanceId, instance]);
    instancesByDriver.set(driver, list);
  }

  const defaultSlotIdsBySource = new Set<string>(
    visibleProviderSettings.map((providerSettings) =>
      String(defaultInstanceIdForDriver(providerSettings.provider)),
    ),
  );

  const rows: InstanceRow[] = [];
  const visibleDriverKinds = new Set<ProviderDriverKind>(
    visibleProviderSettings.map((providerSettings) => providerSettings.provider),
  );

  for (const providerSettings of visibleProviderSettings) {
    const driver = providerSettings.provider;
    const defaultInstanceId = defaultInstanceIdForDriver(driver);
    const explicitInstance = settings.providerInstances?.[defaultInstanceId];
    // An unconfigured default slot runs with the driver's default config.
    const effectiveInstance: ProviderInstanceConfig = explicitInstance ?? { driver };
    const isDirty = explicitInstance !== undefined;
    // Drivers without a default instance list only their configured instances.
    const hasDefaultSlot = providerSettings.hasDefaultInstance || explicitInstance !== undefined;
    if (
      hasDefaultSlot &&
      (driver === "codex" ||
        driver === "claudeAgent" ||
        isDirty ||
        resolveProviderInstanceEnabled(effectiveInstance) ||
        defaultInstanceId === targetInstanceId)
    ) {
      rows.push({
        instanceId: defaultInstanceId,
        instance: effectiveInstance,
        driver,
        isDefault: true,
        isDirty,
      });
    }
    for (const [id, instance] of instancesByDriver.get(providerSettings.provider) ?? []) {
      if (id === defaultInstanceId) continue;
      rows.push({ instanceId: id, instance, driver: instance.driver, isDefault: false });
    }
  }
  for (const [driver, list] of instancesByDriver) {
    if (visibleDriverKinds.has(driver)) continue;
    for (const [id, instance] of list) {
      rows.push({
        instanceId: id,
        instance,
        driver: instance.driver,
        isDefault: defaultSlotIdsBySource.has(String(id)),
      });
    }
  }

  const updateProviderInstance = async (
    row: InstanceRow,
    next: ProviderInstanceConfig,
    options?: {
      readonly textGenerationModelSelection?: Parameters<
        typeof buildProviderInstanceUpdatePatch
      >[0]["textGenerationModelSelection"];
    },
  ) => {
    const { providerInstances: _providerInstances, ...patch } = buildProviderInstanceUpdatePatch({
      settings,
      instanceId: row.instanceId,
      instance: next,
      textGenerationModelSelection: options?.textGenerationModelSelection,
    });
    const result = await persistProviderInstance(
      { operation: "upsert", instanceId: row.instanceId, instance: next },
      patch,
    );
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not save the AI account. Try again",
        ...userErrorToastFields(error),
      });
    }
  };

  /** Save an account change. Turning off the account that writes titles resets that choice. */
  const applyInstanceUpdate = (row: InstanceRow, next: ProviderInstanceConfig) => {
    const wasEnabled = resolveProviderInstanceEnabled(row.instance);
    const isDisabling = next.enabled === false && wasEnabled;
    const shouldClearTextGen =
      isDisabling &&
      textGenInstanceId === row.instanceId &&
      readEnvironmentScope(environmentId, AuthSettingsWriteScope);
    void updateProviderInstance(
      row,
      next,
      shouldClearTextGen
        ? { textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection }
        : undefined,
    );
  };

  const deleteProviderInstance = async (row: InstanceRow) => {
    const updateResult = await persistProviderInstance({
      operation: "remove",
      instanceId: row.instanceId,
    });
    if (updateResult._tag === "Failure") {
      const error = squashAtomCommandFailure(updateResult);
      toastManager.add({
        type: "error",
        title: "Could not remove the AI account. Try again",
        ...userErrorToastFields(error),
      });
      return;
    }

    if (row.driver !== ProviderDriverKind.make("acpRegistry")) return;
    if (providerConfigString(row.instance.config, "source") === "local") return;
    const agentId = providerConfigString(row.instance.config, "agentId");
    if (agentId === null) return;

    // The server decides from its latest settings whether this was the last
    // instance using the managed agent. A client-side snapshot check can race
    // two removals and make both callers skip cleanup.
    const uninstallResult = await uninstallAcpRegistryManagedBinary({
      environmentId,
      input: { agentId },
    });
    if (uninstallResult._tag === "Failure" && !isAtomCommandInterrupted(uninstallResult)) {
      const error = squashAtomCommandFailure(uninstallResult);
      toastManager.add({
        type: "warning",
        title: "Provider deleted, but managed files remain",
        ...userErrorToastFields(error),
      });
    }
  };

  const resetDefaultInstance = async (driverKind: ProviderDriverKind) => {
    const result = await persistProviderInstance({
      operation: "remove",
      instanceId: defaultInstanceIdForDriver(driverKind),
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not reset the AI account. Try again",
        ...userErrorToastFields(error),
      });
    }
  };

  const renderProviderInstance = (row: InstanceRow) => {
    const driverOption = providerClients.get(row.driver);
    const liveProvider = serverProviders.find(
      (candidate) => candidate.instanceId === row.instanceId,
    );
    const updateCandidate = providerUpdateCandidateByInstanceId.get(row.instanceId);
    const isInstanceUpdateRunning =
      updatingProviderInstanceIds.has(row.instanceId) ||
      (liveProvider !== undefined && isProviderUpdateActive(liveProvider));
    const showInlineUpdateButton = updateCandidate !== undefined;
    const canRunInlineUpdate = updateCandidate !== undefined && !isInstanceUpdateRunning;
    const modelPreferences = settings.providerModelPreferences?.[row.instanceId] ?? {
      hiddenModels: [],
      modelOrder: [],
    };
    const favoriteModels = Arr.filterMap(settings.favorites ?? [], (favorite) =>
      favorite.provider === row.instanceId ? Result.succeed(favorite.model) : Result.failVoid,
    );
    const resetLabel = driverOption?.label ?? String(row.driver);

    return (
      <ProviderInstanceCard
        key={row.instanceId}
        environmentId={environmentId}
        acpProjects={projects}
        sharedLoginWarning={sharedLoginWarning(
          sharedLoginPeerNames(serverProviders, row.instanceId),
        )}
        onAcceptUrlAuth={
          readOnly ? undefined : (action) => acceptUrlAuthentication(row.instanceId, action)
        }
        instanceId={row.instanceId}
        instance={row.instance}
        driverOption={driverOption}
        liveProvider={liveProvider}
        readOnly={readOnly}
        runtime={
          row.driver === "codex" && readCodexSetupMode(row.instance.config) === "managed" ? (
            <CodexManagedRuntimeFields
              environmentId={environmentId}
              instanceId={row.instanceId}
              provider={liveProvider}
            />
          ) : undefined
        }
        canWriteSettings={canWriteSettings}
        setup={
          row.driver === "antigravity" ? (
            <ProviderSetupSection
              environmentId={environmentId}
              environmentLabel={environmentLabel}
              instanceId={row.instanceId}
              provider={liveProvider}
              binaryPath={configuredBinaryPath(row.instance.config)}
              authMethod={readAntigravityAuthMethod(row.instance.config)}
              enabled={resolveProviderInstanceEnabled(row.instance)}
              readOnly={readOnly}
              onEnable={() => updateProviderInstance(row, { ...row.instance, enabled: true })}
            />
          ) : row.driver === "codex" && readCodexSetupMode(row.instance.config) === "managed" ? (
            <CodexSetupSection
              environmentId={environmentId}
              instanceId={row.instanceId}
              provider={liveProvider}
              mode={readCodexSetupMode(row.instance.config)}
              enabled={resolveProviderInstanceEnabled(row.instance)}
              readOnly={readOnly}
              onModeChange={(setupMode) =>
                updateProviderInstance(row, {
                  ...row.instance,
                  enabled: true,
                  config: {
                    ...(row.instance.config !== null && typeof row.instance.config === "object"
                      ? row.instance.config
                      : {}),
                    enabled: true,
                    setupMode,
                  },
                })
              }
            />
          ) : !readOnly &&
            liveProvider &&
            (liveProvider.setup?.canAuthenticate ||
              liveProvider.driver === "claudeAgent" ||
              (liveProvider.driver === "acpRegistry" && liveProvider.installed)) ? (
            <ProviderAuthenticationSection
              key={`${environmentId}:${row.instanceId}`}
              environmentId={environmentId}
              environmentLabel={environmentLabel}
              instanceId={row.instanceId}
              provider={liveProvider}
              readOnly={readOnly}
            />
          ) : !readOnly &&
            row.driver === "cursor" &&
            liveProvider?.setup?.canAuthenticate === false ? (
            <SettingsRow
              title="Cursor account"
              description="Using CURSOR_API_KEY. Remove it from the variables of this AI service to sign in with the browser."
            />
          ) : null
        }
        onUpdate={(next) => applyInstanceUpdate(row, next)}
        onDelete={!row.isDefault ? () => deleteProviderInstance(row) : undefined}
        headerAction={
          row.isDefault && row.isDirty ? (
            <SettingResetButton
              label={`${resetLabel} settings`}
              onClick={() => resetDefaultInstance(row.driver)}
            />
          ) : null
        }
        hiddenModels={modelPreferences.hiddenModels}
        favoriteModels={favoriteModels}
        modelOrder={modelPreferences.modelOrder}
        onHiddenModelsChange={(next, affectedModels) => {
          const hidden = new Set(next);
          const models =
            affectedModels ??
            modelListChanges(modelPreferences.hiddenModels, next).map((change) => change.model);
          void updateModelPreferences({
            setModelsHidden: models.map((model) => ({
              provider: row.instanceId,
              model,
              hidden: hidden.has(model),
            })),
          });
        }}
        onToggleFavorite={(model) => {
          void toggleModelFavorite(row.instanceId, model);
        }}
        onFavoriteModelsChange={(next) => {
          void updateModelPreferences({
            setModelFavorites: modelListChanges(favoriteModels, next).map(
              ({ model, selected }) => ({ provider: row.instanceId, model, favorite: selected }),
            ),
          });
        }}
        onModelOrderChange={(modelOrder) => {
          void updateModelPreferences({
            setProviderModelOrder: { provider: row.instanceId, modelOrder },
          });
        }}
        onInstallRecommended={
          !readOnly &&
          liveProvider?.compatibilityAdvisory?.message &&
          liveProvider.compatibilityAdvisory.recommendedVersion &&
          liveProvider.versionAdvisory?.canInstallVersion
            ? () => {
                void runProviderUpdate(
                  liveProvider,
                  liveProvider.compatibilityAdvisory?.recommendedVersion ?? undefined,
                );
              }
            : undefined
        }
        onRunUpdate={
          !readOnly && showInlineUpdateButton && updateCandidate
            ? () => {
                if (canRunInlineUpdate) void runProviderUpdate(updateCandidate);
              }
            : undefined
        }
        isUpdating={isInstanceUpdateRunning}
      />
    );
  };

  const rowById = new Map(rows.map((row) => [row.instanceId, row]));
  // Group headings use the names on the Connect tiles, not internal program names.
  const tileLabelByDriver = new Map<string, string>(
    CONNECT_CHOICES.map((choice) => [choice.driver, choice.title]),
  );
  const labelForDriver = (driver: string) =>
    tileLabelByDriver.get(driver) ??
    providerClients.get(driver as ProviderDriverKind)?.label ??
    driver;
  const connectChoiceForDriver: Record<string, ConnectChoice> = {
    claudeAgent: "claude",
    codex: "chatgpt",
    antigravity: "google",
  };
  const accountGroups = groupAccountRows(rows, labelForDriver).map((group) => {
    const choice = connectChoiceForDriver[group.driver];
    return {
      driver: group.driver,
      label: labelForDriver(group.driver),
      onAdd: choice
        ? () => {
            setConnectChoice(choice);
            setIsAddInstanceDialogOpen(true);
          }
        : () => setIsAdvancedAddOpen(true),
      rows: group.rows.map((row): AccountRowView => {
        const liveProvider = serverProviders.find(
          (candidate) => candidate.instanceId === row.instanceId,
        );
        const enabled = resolveProviderInstanceEnabled(row.instance);
        return {
          instanceId: row.instanceId,
          driver: row.driver,
          displayName:
            row.instance.displayName ?? liveProvider?.displayName ?? labelForDriver(row.driver),
          accentColor: row.instance.accentColor,
          enabled,
          status: describeAccount({
            driver: row.driver,
            enabled,
            needsApiKey: providerInstanceNeedsApiKey(row.instance),
            provider: liveProvider,
          }),
          usage: accountUsage(liveProvider),
          canRemove: !row.isDefault,
        };
      }),
    };
  });
  const panelRow = accountPanel ? rowById.get(accountPanel.instanceId) : undefined;
  const missingClaude = serverProviders.find((provider) => {
    if (
      provider.driver !== "claudeAgent" ||
      !provider.enabled ||
      provider.installed ||
      provider.status !== "error"
    )
      return false;
    const row = rowById.get(provider.instanceId);
    const config = row?.instance.config;
    const binary =
      config && typeof config === "object" && "binaryPath" in config
        ? config.binaryPath
        : undefined;
    return binary === undefined || binary === "" || binary === "claude" || binary === "claude.exe";
  });
  const panelProvider = panelRow
    ? serverProviders.find((candidate) => candidate.instanceId === panelRow.instanceId)
    : undefined;
  const panelName = panelRow
    ? (panelRow.instance.displayName ??
      panelProvider?.displayName ??
      labelForDriver(panelRow.driver))
    : "";
  const closeAccountPanel = () => setAccountPanel(null);

  return (
    <>
      <SettingsSection
        {...searchableSetting("providers")}
        variant="plain"
        titleAction={
          !readOnly ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    onClick={() => {
                      setConnectChoice(undefined);
                      setIsAddInstanceDialogOpen(true);
                    }}
                    aria-label="Connect an account"
                  >
                    <PlusIcon />
                  </Button>
                }
              />
              <TooltipPopup side="top">Connect an account</TooltipPopup>
            </Tooltip>
          ) : null
        }
        headerAction={
          <div className="flex min-w-0 items-center gap-2">
            <ProviderUpdatesAction />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="xs"
                    variant="ghost-muted"
                    disabled={isRefreshingProviders || !canRefreshProviders}
                    aria-busy={isRefreshingProviders}
                    onClick={() => void refreshProviders()}
                  >
                    <RefreshIcon refreshing={isRefreshingProviders} />
                    <span className="sr-only">Refresh AI service status</span>
                    <span className="hidden min-w-0 truncate sm:inline">
                      {isRefreshingProviders ? (
                        "Refreshing AI services"
                      ) : (
                        <ProviderLastChecked lastCheckedAt={lastCheckedAt} />
                      )}
                    </span>
                  </Button>
                }
              />
              <TooltipPopup side="top">Refresh AI service status</TooltipPopup>
            </Tooltip>
          </div>
        }
      >
        {deviceTabs ? (
          <div className="flex min-h-11 min-w-0 items-center gap-2 px-3 sm:px-4">{deviceTabs}</div>
        ) : null}
        {readOnly ? (
          <SettingsGroup divided={false} className="overflow-hidden">
            <SettingsRow
              title="Limited permissions"
              description={`You can see the AI services on ${environmentLabel}, but you cannot change their settings.`}
            />
          </SettingsGroup>
        ) : null}
        <div className="@container/providers space-y-5 px-3 pt-1 pb-2 sm:px-4">
          <ConnectTiles
            disabled={readOnly}
            onConnect={(choice) => {
              setConnectChoice(choice);
              setIsAddInstanceDialogOpen(true);
            }}
            onMore={() => setIsAdvancedAddOpen(true)}
          />
          {accountGroups.length > 0 ? (
            <>
              {missingClaude ? (
                <ClaudeRuntimeRepair
                  environmentId={environmentId}
                  instanceId={missingClaude.instanceId}
                  readOnly={readOnly}
                />
              ) : null}
              <ProviderAccountGroups
                groups={accountGroups}
                readOnly={readOnly}
                onAction={(account, action) => {
                  const row = rowById.get(account.instanceId);
                  if (!row) return;
                  if (action === "addKey") {
                    setAccountPanel({ kind: "apiKey", instanceId: row.instanceId });
                  } else if (
                    (action === "install" || action === "signIn") &&
                    row.driver === "claudeAgent"
                  ) {
                    setAccountPanel({ kind: "signIn", instanceId: row.instanceId });
                  } else {
                    setAccountPanel({ kind: "settings", instanceId: row.instanceId });
                  }
                }}
                onRename={(account) =>
                  setAccountPanel({ kind: "rename", instanceId: account.instanceId })
                }
                onToggle={(account, enabled) => {
                  const row = rowById.get(account.instanceId);
                  if (row) applyInstanceUpdate(row, { ...row.instance, enabled });
                }}
                onRemove={(account) =>
                  setAccountPanel({ kind: "remove", instanceId: account.instanceId })
                }
                onSettings={(account) =>
                  setAccountPanel({ kind: "settings", instanceId: account.instanceId })
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect an account to start. Use the plan you already pay for.
            </p>
          )}
        </div>
      </SettingsSection>

      <UsageProviderSettings
        key={environmentId}
        environmentId={environmentId}
        environmentLabel={environmentLabel}
        sources={settings.usageLimitSources}
        cursorKeychainUsageEnabled={settings.cursorKeychainUsageEnabled}
        readOnly={readOnly}
      />

      <SettingsSection title="Advanced">
        <SettingsRow
          id={searchableSetting("provider-health-check-interval").id}
          title={
            <span className="inline-flex items-center gap-1.5">
              {searchableSetting("provider-health-check-interval").title}
              <PolicyTooltip>
                You set the time here. Then the Background activity setting decides whether the
                check can run. Custom times show as Advanced in General settings.
              </PolicyTooltip>
            </span>
          }
          description="Update the status, versions, and models of the AI services in the background. Set to 0 to turn this off."
          resetAction={
            providerHealthRefreshIntervalSeconds !== defaultProviderHealthRefreshIntervalSeconds ? (
              <span
                inert={!canWriteSettings}
                className={!canWriteSettings ? "opacity-50" : undefined}
              >
                <SettingResetButton
                  label="status check interval"
                  onClick={() =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        { providerHealthRefreshInterval: undefined },
                      ),
                    )
                  }
                />
              </span>
            ) : null
          }
          control={
            <div
              inert={!canWriteSettings}
              aria-disabled={!canWriteSettings || undefined}
              className={cn(
                "flex shrink-0 items-center gap-2",
                !canWriteSettings && "opacity-50 select-none",
              )}
            >
              <NumberField
                value={providerHealthRefreshIntervalSeconds}
                min={0}
                step={PROVIDER_HEALTH_INTERVAL_STEP_SECONDS}
                size="sm"
                className="w-32"
                onValueChange={(value) =>
                  updateSettings(
                    backgroundActivityOverrideSettings(
                      settings.backgroundActivity,
                      resolvedBackgroundActivity,
                      {
                        providerHealthRefreshInterval: Duration.seconds(
                          normalizeIntervalSeconds(value),
                        ),
                      },
                    ),
                  )
                }
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement aria-label="Decrease status check interval" />
                  <NumberFieldInput aria-label="Status check interval in seconds" />
                  <NumberFieldIncrement aria-label="Increase status check interval" />
                </NumberFieldGroup>
              </NumberField>
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          }
        />
      </SettingsSection>

      {isAddInstanceDialogOpen && !readOnly ? (
        <ConnectAccountDialog
          environmentId={environmentId}
          environmentLabel={environmentLabel}
          initialChoice={connectChoice}
          onOpenChange={setIsAddInstanceDialogOpen}
          onAdvanced={() => {
            setIsAddInstanceDialogOpen(false);
            setIsAdvancedAddOpen(true);
          }}
        />
      ) : null}
      {isAdvancedAddOpen && !readOnly ? (
        <AddProviderInstanceDialog
          open
          environmentId={environmentId}
          environmentLabel={environmentLabel}
          onOpenChange={setIsAdvancedAddOpen}
        />
      ) : null}
      <Sheet
        open={accountPanel?.kind === "settings" && panelRow !== undefined}
        onOpenChange={(open) => (open ? undefined : closeAccountPanel())}
      >
        <SheetPopup elevated className="w-full max-w-2xl">
          <SheetHeader>
            <SheetTitle>{panelName} settings</SheetTitle>
            <SheetDescription>
              Sign-in, models, and advanced options for this account. Most people never need these.
            </SheetDescription>
          </SheetHeader>
          {accountPanel?.kind === "settings" && panelRow ? (
            <ScrollArea scrollFade className="min-h-0 flex-1">
              <div className="space-y-6 px-4 pb-6 sm:px-6">{renderProviderInstance(panelRow)}</div>
            </ScrollArea>
          ) : null}
        </SheetPopup>
      </Sheet>
      {accountPanel?.kind === "rename" && panelRow ? (
        <TextValueDialog
          title="Rename account"
          description="Pick a name you will know in the model picker, for example Personal or Work."
          label="Name"
          initialValue={panelName}
          submitLabel="Save"
          onSave={(displayName) =>
            applyInstanceUpdate(panelRow, { ...panelRow.instance, displayName })
          }
          onClose={closeAccountPanel}
        />
      ) : null}
      {accountPanel?.kind === "apiKey" && panelRow ? (
        <TextValueDialog
          title={`Add your ${labelForDriver(panelRow.driver)} API key`}
          description="Create a key on your account page, then paste it here. It stays on this computer."
          label="API key"
          initialValue=""
          secret
          submitLabel="Save and turn on"
          onSave={(apiKey) =>
            applyInstanceUpdate(panelRow, {
              ...panelRow.instance,
              enabled: true,
              config: {
                ...(panelRow.instance.config !== null &&
                typeof panelRow.instance.config === "object"
                  ? panelRow.instance.config
                  : {}),
                apiKey,
              },
            })
          }
          onClose={closeAccountPanel}
        />
      ) : null}
      {accountPanel?.kind === "signIn" && panelProvider ? (
        <ClaudeSignInDialog
          environmentId={environmentId}
          provider={panelProvider}
          onClose={closeAccountPanel}
        />
      ) : null}
      <AlertDialog
        open={accountPanel?.kind === "remove" && panelRow !== undefined}
        onOpenChange={(open) => (open ? undefined : closeAccountPanel())}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {panelName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Leonidas stops using this account. Your plan and your chats stay. You can connect it
              again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (panelRow) void deleteProviderInstance(panelRow);
                closeAccountPanel();
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
