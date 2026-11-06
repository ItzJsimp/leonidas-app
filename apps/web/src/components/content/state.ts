import {
  AuthFilesystemWriteScope,
  CONTENT_NO_WORKSPACE,
  type ContentListResult,
  WS_METHODS,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../../connection/runtime";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";

const contentListQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:content:list",
  tag: WS_METHODS.contentList,
  staleTimeMs: 15_000,
  idleTtlMs: 5 * 60_000,
  refreshIntervalMs: 30_000,
});

export const contentMove = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:move",
  tag: WS_METHODS.contentMove,
});

export const contentSaveScript = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:save-script",
  tag: WS_METHODS.contentSaveScript,
});

export const contentCreateDeal = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:create-deal",
  tag: WS_METHODS.contentCreateDeal,
});

export const contentDecideDeal = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:decide-deal",
  tag: WS_METHODS.contentDecideDeal,
});

export const contentSync = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:sync",
  tag: WS_METHODS.contentSync,
});

export const contentPairingStart = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:pairing-start",
  tag: WS_METHODS.contentPairingStart,
});

export const contentPairingAccept = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:pairing-accept",
  tag: WS_METHODS.contentPairingAccept,
});

export const contentHistory = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:content:history",
  tag: WS_METHODS.contentHistory,
});

export interface ContentData {
  readonly environmentId: ReturnType<typeof usePrimaryEnvironmentId>;
  readonly list: ContentListResult | null;
  readonly error: string | null;
  /** No AIOS folder is connected, so there are no deal files to read. */
  readonly noWorkspace: boolean;
  readonly refresh: () => void;
  /** When the list last arrived, in ms since 1970. 0 before the first answer. */
  readonly updatedAt: number;
  /** Only a person's session holds this. An agent access level never does. */
  readonly canAct: boolean;
}

/** The Content data of the open workspace, refreshed every 30 s. */
export function useContent(): ContentData {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId ? contentListQuery({ environmentId, input: {} }) : null,
  );
  const canAct = useEnvironmentScope(environmentId, AuthFilesystemWriteScope);
  return {
    environmentId,
    list: query.data,
    error: query.error,
    noWorkspace:
      typeof query.failure === "object" &&
      query.failure !== null &&
      "message" in query.failure &&
      query.failure.message === CONTENT_NO_WORKSPACE,
    refresh: query.refresh,
    updatedAt: query.dataUpdatedAt,
    canAct,
  };
}
