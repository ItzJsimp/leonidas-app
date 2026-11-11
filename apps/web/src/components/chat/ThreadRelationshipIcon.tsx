import { resolveSubagentDriverKind } from "@t3tools/client-runtime/state/subagent-display";
import type { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { BotIcon, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

export function threadRelationshipStatusLabel(status: string | null): string {
  switch (status) {
    case "preparing":
    case "starting":
      return "Starting";
    case "running":
    case "in_progress":
      return "Running";
    case "pending":
    case "queued":
      return "Waiting";
    case "waiting":
    case "blocked":
      return "Waiting";
    case "completed":
      return "Done";
    case "failed":
    case "error":
      return "Failed";
    case "cancelled":
    case "interrupted":
      return "Stopped";
    case "rolled_back":
      return "Went back";
    case "resolved_native":
      return "Done";
    case "resolved_portable":
      return "Done";
    case "consumed":
      return "Used";
    case "superseded":
      return "Replaced";
    case "idle":
      return "Idle";
    default:
      return "Unknown";
  }
}

export function ThreadRelationshipIcon({
  driver,
  provider,
  model,
  providerInstanceId,
  providers,
  status,
  fallbackIcon: FallbackIcon = BotIcon,
}: {
  driver?: ProviderDriverKind | undefined;
  provider?: ServerProvider | undefined;
  model?: string | null | undefined;
  providerInstanceId?: ProviderInstanceId | undefined;
  providers?: ReadonlyArray<ServerProvider> | undefined;
  status: string | null;
  fallbackIcon?: LucideIcon;
}) {
  const resolvedDriver = resolveSubagentDriverKind({
    driver,
    provider,
    model,
    providerInstanceId,
    providers,
  });
  const resolvedProvider =
    provider ??
    (providerInstanceId && providers
      ? providers.find((p) => p.instanceId === providerInstanceId)
      : undefined);
  const iconClassName = "size-4 shrink-0 text-muted-foreground";
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      {resolvedDriver ? (
        <ProviderInstanceIcon
          driverKind={resolvedDriver}
          displayName={resolvedProvider?.displayName ?? resolvedDriver}
          acpRegistryIconUrl={resolvedProvider?.iconUrl}
          iconClassName={iconClassName}
          className="z-auto"
        />
      ) : (
        <FallbackIcon className={iconClassName} />
      )}
      <span
        className={cn(
          "absolute -bottom-1 -right-1 size-2 rounded-full border-2 border-card",
          status === "running" ||
            status === "in_progress" ||
            status === "pending" ||
            status === "waiting"
            ? "bg-info"
            : status === "failed" || status === "error"
              ? "bg-destructive"
              : status === "completed"
                ? "bg-success"
                : "bg-muted-foreground/45",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
