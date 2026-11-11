import type { DpopFailureReason } from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse, RelayProtectedError } from "@t3tools/contracts/relay";

export const DPOP_CLOCK_HINT =
  "Hint: Turn on automatic date and time on both devices. Then try again.";

/** Older servers omit the DPoP category, but newer servers can also omit it for
 * a credential failure that happens after proof verification. */
export const DPOP_UNKNOWN_HINT =
  "Hint: Try again. If it still fails, the clocks of the two devices may differ. Turn on automatic date and time on both devices.";

export const DPOP_RETRY_HINT =
  "Hint: Try again. If the problem continues, copy the trace ID and send it to us.";

function dpopFailureHint(reason: DpopFailureReason | undefined): string {
  if (reason === "time_window") return DPOP_CLOCK_HINT;
  if (reason === undefined) return DPOP_UNKNOWN_HINT;
  return DPOP_RETRY_HINT;
}

export function dpopFailureMessage(message: string, reason: DpopFailureReason | undefined): string {
  return `${message} ${dpopFailureHint(reason)}`;
}

export function relayProtectedErrorMessage(error: RelayProtectedError): string {
  switch (error._tag) {
    case "RelayAuthInvalidError":
      switch (error.reason) {
        case "missing_bearer":
        case "invalid_bearer":
          return "Remote access did not accept your sign-in. Sign in again.";
        case "invalid_dpop":
          return dpopFailureMessage(
            "Remote access did not accept this device.",
            error.dpopFailureReason,
          );
        case "not_authorized":
          return "Remote access did not allow this request.";
      }
    case "RelayEnvironmentLinkProofExpiredError":
      return "The link to this computer ran out of time. Link the computer again.";
    case "RelayEnvironmentLinkProofInvalidError":
      return `Remote access did not accept the link to this computer (${error.reason}). Link the computer again.`;
    case "RelayEnvironmentConnectNotAuthorizedError":
      // "Not authorized" covers non-auth causes too; surface the reason so a
      // missing link does not read as a credential problem.
      if (error.reason === "environment_link_not_found") {
        return "Remote access has no link to this computer yet. Wait a moment, then try again.";
      }
      if (error.reason === "managed_endpoint_allocation_not_ready") {
        return "Remote access is still being set up. Wait a moment, then try again.";
      }
      return error.reason
        ? `Remote access did not accept the request to connect to this computer (${error.reason}).`
        : "Remote access did not accept the request to connect to this computer.";
    case "RelayEnvironmentEndpointUnavailableError":
      return `Remote access could not reach this computer (${error.reason}). Check that it is on.`;
    case "RelayEnvironmentEndpointTimedOutError":
      return "Remote access waited too long for this computer. Check that it is on, then try again.";
    case "RelayEnvironmentLinkFailedError":
      return `Remote access could not link this computer (${error.reason}). Try again.`;
    case "RelayEnvironmentLinkUnavailableError":
      return `Relay cannot provision the managed endpoint (${error.reason}).${
        error.provisioningStage ? ` Failed stage: ${error.provisioningStage}.` : ""
      }`;
    case "RelayEnvironmentLinkLimitExceededError":
      return `This account already has ${error.maxTunnels} remote access connections. That is the most it can have. Remove a computer to make room.`;
    case "RelayAgentActivityPublishProofExpiredError":
      return "Remote access did not accept an expired activity update. Try again.";
    case "RelayAgentActivityPublishProofInvalidError":
      return `Remote access did not accept the activity update (${error.reason}). Try again.`;
    case "RelayInternalError":
      return `Remote access had an error (${error.reason}). Try again later.`;
  }
}

// The relay cuts off a request it cannot finish in time with a 504 that no
// endpoint declares, so the client sees only the status.
export const RELAY_GATEWAY_TIMEOUT_MESSAGE =
  "Relay timed out before it finished the request (HTTP 504). Try again in a few minutes. If it keeps failing, copy the trace ID when you report it.";

export function relayRequestFailureDetail(error: {
  readonly relayError?: RelayProtectedError | undefined;
  readonly status?: number | undefined;
}): string | null {
  if (error.relayError) return relayProtectedErrorMessage(error.relayError);
  if (error.status === 504) return RELAY_GATEWAY_TIMEOUT_MESSAGE;
  if (error.status !== undefined) return `Relay returned an unexpected HTTP ${error.status}.`;
  return null;
}

export const RELAY_TUNNEL_RELEASED_MESSAGE =
  "This computer was offline for a while, so remote access was removed. Start Leonidas there and update it to reconnect.";

export function relayOfflineReasonMessage(
  status: Pick<RelayEnvironmentStatusResponse, "offlineReason">,
): string | null {
  switch (status.offlineReason) {
    case "tunnel_released":
      return RELAY_TUNNEL_RELEASED_MESSAGE;
    case undefined:
      return null;
  }
}
