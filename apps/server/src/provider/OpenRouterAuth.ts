// @effect-diagnostics nodeBuiltinImport:off - OAuth loopback listener and PKCE use Node APIs.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import {
  ProviderDriverKind,
  ProviderSetupError,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as ProviderAuthFlow from "@t3tools/provider-core/server/providerAuthFlow";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";

import * as ServerSettings from "../serverSettings.ts";

const AUTH_URL = "https://openrouter.ai/auth";
const KEY_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const CALLBACK_PATH = "/openrouter/callback";
const METHOD = {
  id: "openrouter",
  name: "Sign in with OpenRouter",
  description: "Opens OpenRouter in your browser. Free models need no payment.",
  type: "agent" as const,
};
// Shown in the browser tab after the callback; the app does the rest.
const DONE_PAGE =
  "<!doctype html><meta charset=utf-8><title>Leonidas</title>" +
  "<p style='font:16px system-ui;margin:3rem'>OpenRouter is connected. Go back to Leonidas.</p>";

const isSetupError = Schema.is(ProviderSetupError);

const failure = (instanceId: ProviderInstanceId, operation: string, detail: string) =>
  new ProviderSetupError({ instanceId, operation, detail });

/** PKCE verifier and its S256 challenge, both base64url. */
export const openRouterPkcePair = () => {
  const verifier = NodeCrypto.randomBytes(48).toString("base64url");
  const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

export const buildOpenRouterAuthorizationUrl = (callbackUrl: string, challenge: string) => {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
};

const KeyResponse = Schema.Struct({ key: Schema.String });

/** Trade the one-time code for a user-owned OpenRouter key. */
export const exchangeOpenRouterCode = (
  instanceId: ProviderInstanceId,
  code: string,
  verifier: string,
) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http.execute(
      HttpClientRequest.post(KEY_EXCHANGE_URL).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          code,
          code_verifier: verifier,
          code_challenge_method: "S256",
        }),
      ),
    );
    if (response.status !== 200) {
      return yield* failure(
        instanceId,
        "exchange",
        "OpenRouter did not accept the sign-in. Start again.",
      );
    }
    const body = yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(KeyResponse)));
    return body.key;
  }).pipe(
    Effect.catchIf(
      (error) => !isSetupError(error),
      () =>
        Effect.fail(
          failure(
            instanceId,
            "exchange",
            "Could not reach OpenRouter. Check the internet and start again.",
          ),
        ),
    ),
  );

/**
 * One-click OpenRouter sign-in. OpenRouter sends a one-time code to a loopback
 * callback on a free port; the code and PKCE verifier buy a user key, which the
 * caller saves. The shared auth flow owns consent, cancel and the timeout.
 */
export const makeOpenRouterAuth = Effect.fn("makeOpenRouterAuth")(function* (options: {
  readonly instanceId: ProviderInstanceId;
  readonly saveKey: (key: string) => Effect.Effect<void, ProviderSetupError>;
  readonly removeKey: Effect.Effect<void, ProviderSetupError>;
  readonly exchangeCode: (
    code: string,
    verifier: string,
  ) => Effect.Effect<string, ProviderSetupError>;
}) {
  const { instanceId } = options;
  return yield* ProviderAuthFlow.make({
    instanceId,
    credentialBinding: { owner: "t3", key: `openrouter:${instanceId}` },
    methods: Effect.succeed([METHOD]),
    authenticate: (_method, context) =>
      Effect.gen(function* () {
        const { verifier, challenge } = openRouterPkcePair();
        const callback = Promise.withResolvers<URL>();
        let used = false;
        const server = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () =>
              new Promise<NodeHttp.Server>((resolve, reject) => {
                const server = NodeHttp.createServer((request, response) => {
                  const url = new URL(request.url ?? "/", "http://127.0.0.1");
                  if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
                    response.writeHead(404).end();
                    return;
                  }
                  if (used) {
                    response.writeHead(410).end("Sign-in is no longer active.");
                    return;
                  }
                  used = true;
                  response.writeHead(200, { "content-type": "text/html" }).end(DONE_PAGE);
                  callback.resolve(url);
                });
                server.once("error", reject);
                server.listen(0, "127.0.0.1", () => resolve(server));
              }),
            catch: () =>
              failure(instanceId, "callback", "Could not start the local sign-in. Try again."),
          }),
          (server) =>
            Effect.promise(
              () =>
                new Promise<void>((resolve) => {
                  server.closeAllConnections();
                  server.close(() => resolve());
                }),
            ),
        );
        const address = server.address();
        if (!address || typeof address === "string") {
          return yield* failure(instanceId, "callback", "Could not start the local sign-in.");
        }
        const callbackUrl = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
        yield* context.setInteraction({
          type: "browser",
          id: context.flowId,
          url: buildOpenRouterAuthorizationUrl(callbackUrl, challenge),
          requiresConsent: false,
        });
        const returned = yield* Effect.promise(() => callback.promise);
        const code = returned.searchParams.get("code");
        if (!code) {
          return yield* failure(
            instanceId,
            "callback",
            "OpenRouter sign-in was not finished. Start again.",
          );
        }
        yield* context.verifying;
        const key = yield* options.exchangeCode(code, verifier);
        yield* options.saveKey(key);
      }),
    logout: options.removeKey,
  });
});

/** Writes the key where a pasted key goes, so the settings watcher rebuilds the instance. */
export const makeOpenRouterKeyWriter = Effect.fn("makeOpenRouterKeyWriter")(function* (
  instanceId: ProviderInstanceId,
) {
  const settings = yield* Effect.serviceOption(ServerSettings.ServerSettingsService);
  const failed = failure(instanceId, "save", "Could not save the OpenRouter key. Try again.");
  return (apiKey: string): Effect.Effect<void, ProviderSetupError> =>
    Option.isNone(settings)
      ? Effect.fail(failed)
      : settings.value.getSettings.pipe(
          Effect.flatMap((current) => {
            const existing = current.providerInstances[instanceId];
            const config =
              existing?.config !== null && typeof existing?.config === "object"
                ? existing.config
                : {};
            return settings.value.updateProviderInstance({
              operation: "upsert",
              instanceId,
              instance: {
                ...existing,
                driver: existing?.driver ?? ProviderDriverKind.make("openrouter"),
                enabled: true,
                config: { ...config, enabled: true, apiKey },
              },
            });
          }),
          Effect.asVoid,
          Effect.mapError(() => failed),
        );
});
