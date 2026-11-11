import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";
export const imagesImprovePrompt = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:improve-prompt",
  tag: WS_METHODS.imagesImprovePrompt,
});

/** Live Images state of one project: connection, models, queue and finished images. */
export const imagesLive = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:images:live",
  tag: WS_METHODS.imagesSubscribe,
  idleTtlMs: 0,
});

export const imagesGenerate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:generate",
  tag: WS_METHODS.imagesGenerate,
});

export const imagesCancel = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:cancel",
  tag: WS_METHODS.imagesCancel,
});

export const imagesKeep = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:keep",
  tag: WS_METHODS.imagesKeep,
});

export const imagesRetry = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:retry",
  tag: WS_METHODS.imagesRetry,
});

export const imagesSetBaseUrl = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:set-base-url",
  tag: WS_METHODS.imagesSetBaseUrl,
});

export const imagesSetup = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:setup",
  tag: WS_METHODS.imagesSetup,
});

export const imagesImportReference = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:import-reference",
  tag: WS_METHODS.imagesImportReference,
});
export const imagesDelete = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:delete",
  tag: WS_METHODS.imagesDelete,
});
export const imagesSetRetention = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:images:set-retention",
  tag: WS_METHODS.imagesSetRetention,
});
