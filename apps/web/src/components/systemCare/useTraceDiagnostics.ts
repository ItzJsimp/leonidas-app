import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";

import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { environmentSession } from "../../state/session";

/** Trace diagnostics for the primary environment. The Overview counts and the logs panel share it. */
export function useTraceDiagnostics() {
  const environmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environment =
    environments.find((candidate) => candidate.environmentId === environmentId) ?? null;
  const session = useEnvironmentQuery(
    environmentId === null ? null : environmentSession.sessionStateAtom(environmentId),
  );
  const diagnosticsAccess = resolveUsageAccess({
    connectionPhase: environment?.connection.phase ?? "available",
    session: session.data,
    hasSessionError: session.error !== null,
  });
  const canReadDiagnostics = diagnosticsAccess.canReadDiagnostics;
  const query = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.traceDiagnostics({ environmentId, input: {} }),
  );
  return { environmentId, environment, diagnosticsAccess, canReadDiagnostics, ...query };
}
