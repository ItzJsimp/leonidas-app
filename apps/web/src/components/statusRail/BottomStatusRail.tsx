import {
  AuthGameModeControlScope,
  type EnvironmentId,
  type GameModeAction,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  BellIcon,
  CpuIcon,
  Gamepad2Icon,
  MicIcon,
  MicOffIcon,
  ServerIcon,
} from "lucide-react";
import { useState } from "react";

import { APP_VERSION_LABEL } from "~/branding";
import { GameModeControls, LEVELS } from "~/components/commandCenter/GameModeControls";
import { openReleaseHistoryDialog } from "~/components/desktop/ReleaseHistoryDialog";
import { KeyCaps } from "~/components/scribe/ScribeParts";
import { INITIAL_SCRIBE_LIVE } from "~/components/scribe/scribeLive.logic";
import { useScribeToggle } from "~/components/scribe/useScribeToggle";
import { Tip } from "~/components/twoState/Tip";
import { useBuilderMode } from "~/components/twoState/useBuilderMode";
import { useTwoStateCounts } from "~/components/twoState/useTwoStateData";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Switch } from "~/components/ui/switch";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useDesktopUpdateState, useUpdatePreferencesStore } from "~/state/desktopUpdate";
import {
  useEnvironmentProviders,
  useEnvironments,
  usePrimaryEnvironment,
} from "~/state/environments";
import { gameModeRun, gameModeStatusQuery } from "~/state/gameMode";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { scribeLive } from "~/state/scribe";

import {
  deriveAgentsRailStatus,
  deriveEnvironmentRailStatus,
  deriveGameModeRailStatus,
  describeGameMode,
  deriveProvidersRailStatus,
  deriveScribeRailStatus,
  deriveUpdateRailStatus,
  type RailStatusTone,
} from "./statusRail.logic";

const STATUS_DOT: Readonly<Record<RailStatusTone, string>> = {
  success: "bg-state",
  info: "bg-state animate-pulse motion-reduce:animate-none",
  warning: "bg-warning",
  error: "bg-error",
  update: "bg-update",
  muted: "bg-muted-foreground",
};

const ITEM_CLASS =
  "inline-flex h-5 shrink-0 pointer-coarse:h-8 items-center gap-1.5 rounded px-1.5 text-2xs whitespace-nowrap text-muted-foreground outline-hidden ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none";

function StatusDot({
  tone,
  className,
}: {
  readonly tone: RailStatusTone;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[tone], className)}
    />
  );
}

function RailDivider() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-border" />;
}

/**
 * Persistent bottom status rail across the app: shows Leonidas Scribe live status + instant
 * on/off switch alongside server, AI provider, agent activity, and update indicators.
 */
export function BottomStatusRail() {
  const primary = usePrimaryEnvironment();
  const { environments, networkStatus } = useEnvironments();
  const providersByEnvironment = useEnvironmentProviders();
  const counts = useTwoStateCounts();
  const desktopUpdateState = useDesktopUpdateState();
  const noticeLevel = useUpdatePreferencesStore((store) => store.updateNotice);

  const environmentId = primary?.environmentId ?? null;
  const providers = environmentId ? (providersByEnvironment.get(environmentId) ?? []) : [];

  const envStatus = deriveEnvironmentRailStatus({
    label: primary?.label ?? null,
    phase: primary?.connection.phase ?? null,
    networkStatus,
    environmentCount: environments.length,
    displayUrl: primary?.displayUrl ?? null,
  });
  const providersStatus = deriveProvidersRailStatus(providers);
  const agentsStatus = deriveAgentsRailStatus({ running: counts.running });
  const updateStatus = deriveUpdateRailStatus({
    isElectron,
    state: desktopUpdateState,
    noticeLevel,
    versionLabel: APP_VERSION_LABEL,
  });
  const needsYou = counts.needsYou ?? 0;

  return (
    <footer
      aria-label="System status"
      data-slot="bottom-status-rail"
      className="box-content flex h-7 shrink-0 items-center justify-between gap-2 overflow-x-auto border-t border-border bg-card px-2.5 pb-safe text-2xs text-muted-foreground select-none pointer-coarse:h-10 pointer-coarse:text-xs"
    >
      {/* Scribe, Game Mode and the rest control the computer, so only the desktop app shows them. */}
      {isElectron ? (
        <div className="flex min-w-0 items-center gap-1">
          <ScribeRailItem environmentId={environmentId} />
          <RailDivider />
          <Tip text={envStatus.tooltip}>
            <Link
              to="/settings/environments"
              aria-label={`Server status: ${envStatus.label}`}
              className={ITEM_CLASS}
            >
              <ServerIcon aria-hidden className="size-3 shrink-0" />
              <StatusDot tone={envStatus.tone} />
              <span className="truncate">{envStatus.label}</span>
            </Link>
          </Tip>
          <RailDivider />
          <ProvidersRailItem status={providersStatus} />
          {environmentId ? <GameModeRailItem environmentId={environmentId} /> : null}
        </div>
      ) : null}
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Tip text={agentsStatus.tooltip}>
          <Link
            to="/command-center"
            aria-label={`Agents: ${agentsStatus.label}`}
            className={ITEM_CLASS}
          >
            <ActivityIcon aria-hidden className="size-3 shrink-0" />
            <StatusDot tone={agentsStatus.tone} />
            <span className="tabular-nums">{agentsStatus.label}</span>
          </Link>
        </Tip>
        {needsYou > 0 ? (
          <>
            <RailDivider />
            <Tip
              text={`${needsYou} item${needsYou === 1 ? "" : "s"} waiting for you. Select to open Notifications.`}
            >
              <Link
                to="/inbox"
                aria-label={`${needsYou} waiting for you`}
                className={cn(ITEM_CLASS, "text-foreground")}
              >
                <BellIcon aria-hidden className="size-3 shrink-0 text-warning-foreground" />
                <StatusDot tone="warning" />
                <span className="tabular-nums">{needsYou} need you</span>
              </Link>
            </Tip>
          </>
        ) : null}
        <RailDivider />
        <Tip text={updateStatus.tooltip}>
          <button
            type="button"
            onClick={openReleaseHistoryDialog}
            aria-label={`App version and updates: ${updateStatus.label}`}
            className={cn(
              ITEM_CLASS,
              "tabular-nums",
              updateStatus.kind !== null && "text-foreground",
            )}
          >
            {updateStatus.kind !== null ? <StatusDot tone={updateStatus.tone} /> : null}
            <span>{updateStatus.label}</span>
          </button>
        </Tip>
      </div>
    </footer>
  );
}

function ScribeRailItem({ environmentId }: { readonly environmentId: EnvironmentId | null }) {
  const [open, setOpen] = useState(false);
  const live =
    useEnvironmentQuery(environmentId ? scribeLive({ environmentId, input: {} }) : null).data ??
    INITIAL_SCRIBE_LIVE;
  const { settings, enabled, busy, toggle } = useScribeToggle(environmentId);
  const builder = useBuilderMode();
  const status = deriveScribeRailStatus({
    hasEnvironment: environmentId !== null,
    live,
    enabled,
    builder,
  });

  const switchTip =
    live.connected !== true
      ? "Scribe engine is not running."
      : enabled === false
        ? "Turn Leonidas Scribe on."
        : "Turn Leonidas Scribe off.";

  const ScribeIcon = enabled === false || live.connected === false ? MicOffIcon : MicIcon;
  const holdBinding = settings?.sections.hotkeys.hold[0] ?? null;
  const toggleBinding = settings?.sections.hotkeys.toggle[0] ?? null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <Tip text={status.tooltip}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`Leonidas Scribe status: ${status.shortLabel}`}
                className={ITEM_CLASS}
              />
            }
          >
            <ScribeIcon aria-hidden className="size-3 shrink-0" />
            <StatusDot tone={status.tone} />
            <span className="font-medium text-foreground">Scribe</span>
            <span className="tabular-nums">{status.shortLabel}</span>
          </PopoverTrigger>
        </Tip>
        <PopoverPopup side="top" align="start" width="sm" aria-label="Leonidas Scribe status">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot tone={status.tone} className="size-2" />
                  <h2 className="text-sm font-semibold text-foreground">Leonidas Scribe</h2>
                  <span className="text-xs text-muted-foreground">{status.shortLabel}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{status.detailLabel}</p>
              </div>
              {environmentId !== null ? (
                <Switch
                  size="sm"
                  aria-label="Enable Leonidas Scribe"
                  checked={enabled ?? false}
                  disabled={!status.canToggle || busy}
                  onCheckedChange={() => void toggle()}
                />
              ) : null}
            </div>
            {live.lastError ? (
              <p
                role="alert"
                className="rounded-md bg-error-surface px-2.5 py-1.5 text-xs text-error-foreground"
              >
                {live.lastError.message}
              </p>
            ) : null}
            {settings ? (
              <dl className="grid gap-1.5 border-t border-border pt-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Microphone</dt>
                  <dd className="truncate font-medium text-foreground">
                    {settings.sections.audio.device ?? "System default"}
                  </dd>
                </div>
                {holdBinding ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Hold to talk</dt>
                    <dd>
                      <KeyCaps binding={holdBinding} />
                    </dd>
                  </div>
                ) : null}
                {toggleBinding ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Start and stop</dt>
                    <dd>
                      <KeyCaps binding={toggleBinding} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="flex items-center gap-2 border-t border-border pt-2.5">
              <Button
                size="xs"
                variant="outline"
                render={<Link to="/scribe" onClick={() => setOpen(false)} />}
              >
                Open Scribe
              </Button>
              <Button
                size="xs"
                variant="ghost"
                render={
                  <Link to="/scribe" search={{ tab: "settings" }} onClick={() => setOpen(false)} />
                }
              >
                Scribe settings
              </Button>
            </div>
          </div>
        </PopoverPopup>
      </Popover>
      {environmentId !== null ? (
        <Tip text={switchTip}>
          <Switch
            size="sm"
            aria-label="Turn Leonidas Scribe on or off"
            checked={enabled ?? false}
            disabled={!status.canToggle || busy}
            onCheckedChange={() => void toggle()}
          />
        </Tip>
      ) : null}
    </div>
  );
}

function ProvidersRailItem({
  status,
}: {
  readonly status: ReturnType<typeof deriveProvidersRailStatus>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip text={status.tooltip}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`AI providers status: ${status.label}`}
              className={ITEM_CLASS}
            />
          }
        >
          <CpuIcon aria-hidden className="size-3 shrink-0" />
          <StatusDot tone={status.tone} />
          <span className="tabular-nums">{status.label}</span>
        </PopoverTrigger>
      </Tip>
      <PopoverPopup side="top" align="start" width="sm" aria-label="AI provider status">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">AI Providers</h2>
            <span className="text-xs text-muted-foreground">{status.label}</span>
          </div>
          {status.rows.length > 0 ? (
            <ul className="flex flex-col gap-1.5 border-t border-border pt-2.5 text-xs">
              {status.rows.map((row) => (
                <li key={row.instanceId} className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusDot tone={row.tone} className="size-2" />
                    <span className="truncate font-medium text-foreground">{row.name}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-muted-foreground">{row.statusLabel}</span>
                    {row.tone !== "success" && row.message ? (
                      <p className="max-w-44 truncate text-3xs text-muted-foreground">
                        {row.message}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No AI providers are enabled on this server.
            </p>
          )}
          <div className="flex items-center border-t border-border pt-2.5">
            <Button
              size="xs"
              variant="outline"
              render={<Link to="/settings/providers" onClick={() => setOpen(false)} />}
            >
              Manage providers
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function GameModeRailItem({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const allowed = useEnvironmentScope(environmentId, AuthGameModeControlScope);
  const query = useEnvironmentQuery(
    allowed ? gameModeStatusQuery({ environmentId, input: {} }) : null,
  );
  const run = useAtomCommand(gameModeRun);
  const [busy, setBusy] = useState(false);

  if (!allowed) return null;
  const status = query.data;
  const view = deriveGameModeRailStatus(status);

  const act = async (action: GameModeAction) => {
    setBusy(true);
    await run({ environmentId, input: { action } });
    setBusy(false);
  };

  return (
    <>
      <RailDivider />
      <Popover onOpenChange={(open) => open && query.refresh()}>
        <Tip text={view.tooltip}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`Game Mode status: ${view.label}`}
                className={ITEM_CLASS}
              />
            }
          >
            <Gamepad2Icon aria-hidden className="size-3 shrink-0" />
            <StatusDot tone={view.tone} />
            <span className="whitespace-nowrap">{view.label}</span>
          </PopoverTrigger>
        </Tip>
        <PopoverPopup side="top" align="start" width="sm" aria-label="Game Mode">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">Game Mode</h2>
            {status === null ? (
              <p className="text-xs text-muted-foreground">Reading Game Mode…</p>
            ) : status.error !== null ? (
              <p className="text-xs text-error-foreground">{status.error}</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <GameModeControls
                    status={status}
                    busy={busy}
                    onAct={(action) => void act(action)}
                  />
                </div>
                <p className="text-xs font-medium text-foreground">{describeGameMode(status)}</p>
                <p className="text-xs text-muted-foreground">
                  {LEVELS.find((item) => item.level === status.level)?.hint}
                </p>
              </>
            )}
          </div>
        </PopoverPopup>
      </Popover>
    </>
  );
}
