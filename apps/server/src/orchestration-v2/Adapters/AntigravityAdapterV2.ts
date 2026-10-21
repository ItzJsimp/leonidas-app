import {
  ANTIGRAVITY_DEFAULT_MODEL,
  ProviderDriverKind,
  ProviderInstanceId,
  type OrchestrationV2ProviderCapabilities,
  type ProviderSetupError,
} from "@t3tools/contracts";
import type { SelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as EffectAcpErrors from "effect-acp/errors";

import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { readLatestAntigravityTurnTokenUsage } from "../../provider/Drivers/antigravityUsageReader.ts";
import { resolveAntigravityInstanceDirectories } from "../../provider/antigravityAuthSupport.ts";
import type { AntigravityAuth } from "../../provider/AntigravityAuth.ts";
import type * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";
import {
  antigravityPermissionMode,
  applyAntigravityAcpModelSelection,
  type AntigravityAcpRuntimeInput,
} from "../../provider/acp/AntigravityAcpSupport.ts";
import {
  readAntigravityClientTextFile,
  writeAntigravityClientTextFile,
} from "../../provider/acp/AntigravityClientFiles.ts";
import {
  antigravityApprovalOptions,
  antigravitySubagentOutput,
  classifyAntigravitySubagentToolCall,
  extractAntigravityUserInputQuestion,
  makeAntigravityUserInputResponse,
  normalizeAntigravityToolCall,
} from "../../provider/acp/AntigravityProtocol.ts";
import {
  AcpProviderCapabilitiesV2,
  makeAcpAdapterV2,
  type AcpAdapterV2Flavor,
  type AcpAdapterV2RuntimeInput,
} from "@t3tools/provider-acp/server/adapter";

const ANTIGRAVITY_PROVIDER = ProviderDriverKind.make("antigravity");
/** The agent names its conversation database for its session id, a UUID. */
const SAFE_SESSION_FILE_NAME = /^[A-Za-z0-9_-]{1,128}$/;

const AntigravityProviderCapabilitiesV2 = {
  ...AcpProviderCapabilitiesV2,
  sessions: {
    ...AcpProviderCapabilitiesV2.sessions,
    supportsModelSwitchInSession: true,
    supportsRuntimeModeSwitchInSession: true,
  },
  tools: {
    ...AcpProviderCapabilitiesV2.tools,
    supportsMcpTools: true,
  },
  subagents: {
    ...AcpProviderCapabilitiesV2.subagents,
    supportsSubagents: true,
  },
} satisfies OrchestrationV2ProviderCapabilities;

export interface AntigravityAdapterV2Options {
  readonly instanceId: ProviderInstanceId;
  readonly selfInvocation: SelfInvocation;
  /** Spawns the official agent with the instance's Google profile. */
  readonly makeRuntime: (
    input: Omit<AntigravityAcpRuntimeInput, "spawn" | "childProcessSpawner">,
  ) => Effect.Effect<
    AcpSessionRuntime.AcpSessionRuntime["Service"],
    EffectAcpErrors.AcpError | ProviderSetupError,
    Scope.Scope
  >;
  /** Serialises process ownership against sign-in and sign-out. */
  readonly withProcess: AntigravityAuth["withProcess"];
  /** Model to select for the provider default alias, from the manifest. */
  readonly defaultModel: Effect.Effect<string | undefined>;
  readonly onSessionStarted?: (
    started: AcpSessionRuntime.AcpSessionRuntimeStartResult,
    cwd: string,
  ) => Effect.Effect<void>;
  readonly onSessionEvent?: AcpAdapterV2Flavor["onSessionEvent"];
  readonly nativeLogging?: Parameters<typeof makeAcpAdapterV2>[0]["nativeLogging"];
  readonly continuationRequests?: Parameters<typeof makeAcpAdapterV2>[0]["continuationRequests"];
}

/**
 * ACP 1.1.1 exposes subagent invocations as ordinary `start_subagent` tools
 * without child session ids. Project them as subagent items keyed by the tool
 * call so the timeline shows them as delegated work.
 */
const extractAntigravitySubagentUpdate: NonNullable<AcpAdapterV2Flavor["extractSubagentUpdate"]> = (
  toolCall,
) => {
  if (classifyAntigravitySubagentToolCall(toolCall) !== "subagent") {
    return undefined;
  }
  const status =
    toolCall.status === "failed" ? "failed" : toolCall.status === "pending" ? "pending" : "running";
  return {
    nativeTaskId: toolCall.toolCallId,
    prompt:
      antigravitySubagentOutput(toolCall) ??
      toolCall.detail ??
      toolCall.title ??
      "Antigravity subagent batch",
    title: "Antigravity subagent batch",
    model: null,
    status,
    childSessionId: null,
    result: status === "failed" ? (antigravitySubagentOutput(toolCall) ?? null) : null,
  };
};

/** The services the Antigravity flavor runs its runtime and session files with. */
interface AntigravityFlavorServices {
  readonly crypto: Crypto.Crypto;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly host: ProviderHost.ProviderHost["Service"];
}

export function makeAntigravityAcpAdapterFlavor(
  options: AntigravityAdapterV2Options & AntigravityFlavorServices,
): AcpAdapterV2Flavor {
  // The attachments dir grant lets the agent read pasted files at the paths
  // the turn text references. It is a leaf directory of uploads. A session
  // without a workspace gets no workspace root rather than the server's cwd.
  const antigravityClientFileRoots = (cwd: string | null) =>
    cwd === null ? [options.host.paths.attachmentsDir] : [cwd, options.host.paths.attachmentsDir];
  const makeRuntime = (input: AcpAdapterV2RuntimeInput) =>
    Effect.gen(function* () {
      // AcpAdapterV2 owns the runtime scope; sign-in and sign-out stop the
      // process by closing a child of it, and the adapter respawns on the next turn.
      const scope = yield* Scope.fork(yield* Effect.scope);
      const runtime = yield* options
        .withProcess(
          Scope.close(scope, Exit.void),
          options.makeRuntime({
            ...input,
            clientFileSystem: true,
            additionalDirectories: [options.host.paths.attachmentsDir],
          }),
        )
        .pipe(Effect.provideService(Scope.Scope, scope));
      return {
        ...runtime,
        start: () =>
          runtime
            .start()
            .pipe(
              Effect.tap(
                (started) => options.onSessionStarted?.(started, input.cwd) ?? Effect.void,
              ),
            ),
      };
    }).pipe(
      Effect.provideService(Crypto.Crypto, options.crypto),
      Effect.mapError((cause): EffectAcpErrors.AcpError =>
        cause._tag === "ProviderSetupError"
          ? new EffectAcpErrors.AcpTransportError({ detail: cause.detail, cause })
          : cause,
      ),
    );

  return {
    driver: ANTIGRAVITY_PROVIDER,
    runtimeHarness: "Antigravity",
    capabilities: AntigravityProviderCapabilitiesV2,
    makeRuntime,
    // Loading history replays every tool call; resume restores the session
    // without the replay and is what the official client does.
    preferResumeSession: true,
    // The second form is the agent's reply when its own model request to a local port times out.
    connectionLostText:
      /^Agent (?:connection was lost and could not be re-established|execution error: doRequest: error sending request)/,
    subagentsIdleOnTurnCompletion: true,
    ...(options.onSessionEvent === undefined ? {} : { onSessionEvent: options.onSessionEvent }),
    applyModelSelection: ({ runtime, modelSelection }) =>
      Effect.gen(function* () {
        const defaultModel = yield* options.defaultModel;
        return yield* applyAntigravityAcpModelSelection({
          runtime,
          model:
            modelSelection.model === ANTIGRAVITY_DEFAULT_MODEL ? undefined : modelSelection.model,
          defaultModel,
          mapError: (cause) => cause,
        });
      }),
    sessionModeForPolicy: (policy) => antigravityPermissionMode(policy.runtimeMode),
    clientFileSystem: {
      readTextFile: (request, cwd) =>
        readAntigravityClientTextFile({
          fileSystem: options.fileSystem,
          path: options.path,
          allowedRoots: antigravityClientFileRoots(cwd),
          request,
        }),
      writeTextFile: (request, cwd) =>
        writeAntigravityClientTextFile({
          fileSystem: options.fileSystem,
          path: options.path,
          allowedRoots: antigravityClientFileRoots(cwd),
          request,
        }),
    },
    approvalOptions: antigravityApprovalOptions,
    extractPermissionQuestion: (request) => {
      const question = extractAntigravityUserInputQuestion(request);
      if (question === undefined) return undefined;
      return {
        question: {
          id: question.id,
          header: question.header,
          question: question.question,
          options: question.options.map((option) => ({
            label: option.label,
            description: option.description,
          })),
          multiSelect: false,
        },
        respond: (answers) => makeAntigravityUserInputResponse(request, answers),
      };
    },
    normalizeToolCall: normalizeAntigravityToolCall,
    extractSubagentUpdate: extractAntigravitySubagentUpdate,
    resolveTurnTokenUsage: (input) =>
      Effect.gen(function* () {
        // The database is named for the agent's own session id. `sessionId` is the app's
        // provider-session id, which never matches a file, so the real usage was never read.
        const agentSessionId = input.nativeThreadId ?? input.sessionId;
        if (!agentSessionId || !SAFE_SESSION_FILE_NAME.test(agentSessionId)) return undefined;
        const directories = yield* resolveAntigravityInstanceDirectories(
          options.host.paths.stateDir,
          options.instanceId,
        ).pipe(
          Effect.provideService(Crypto.Crypto, options.crypto),
          Effect.provideService(Path.Path, options.path),
        );
        const dbPath = options.path.join(
          directories.profile,
          "antigravity-acp",
          "conversations",
          `${agentSessionId}.db`,
        );
        const exists = yield* options.fileSystem
          .exists(dbPath)
          .pipe(Effect.orElseSucceed(() => false));
        if (!exists) return undefined;
        return yield* readLatestAntigravityTurnTokenUsage(dbPath, {
          startedAtMs: input.startedAt === null ? null : DateTime.toEpochMillis(input.startedAt),
        }).pipe(
          Effect.provide(NodeSqliteClient.layer({ filename: dbPath, readonly: true })),
          Effect.orElseSucceed(() => undefined),
        );
      }).pipe(
        // Token usage is best-effort telemetry; an unreadable profile directory just reports none.
        Effect.orElseSucceed(() => undefined),
      ),
    supportsImagePrompts: true,
    supportsCompaction: true,
  };
}

export const makeAntigravityAdapterV2 = Effect.fn("makeAntigravityAdapterV2")(function* (
  options: AntigravityAdapterV2Options,
) {
  const services: AntigravityFlavorServices = {
    crypto: yield* Crypto.Crypto,
    fileSystem: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    host: yield* ProviderHost.ProviderHost,
  };
  return yield* makeAcpAdapterV2({
    instanceId: options.instanceId,
    flavor: makeAntigravityAcpAdapterFlavor({ ...options, ...services }),
    selfInvocation: options.selfInvocation,
    ...(options.nativeLogging === undefined ? {} : { nativeLogging: options.nativeLogging }),
    ...(options.continuationRequests === undefined
      ? {}
      : { continuationRequests: options.continuationRequests }),
  });
});
