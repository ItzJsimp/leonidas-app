import { getProviderReadiness, type ServerProvider } from "@t3tools/contracts";

/** True when providers have loaded and none of the enabled ones can run a chat. */
export function shouldShowNoAiBanner(
  providers: ReadonlyArray<ServerProvider>,
  nowMs: number,
): boolean {
  const enabled = providers.filter((provider) => provider.enabled);
  if (enabled.length === 0) return false;
  if (enabled.some((provider) => getProviderReadiness(provider, { nowMs }).code === "unchecked"))
    return false;
  return !enabled.some((provider) => getProviderReadiness(provider, { nowMs }).color === "green");
}
