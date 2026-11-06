import * as Effect from "effect/Effect";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";

/** The secrets-store name of the key that signs approval decisions. It is made on first use. */
const APPROVAL_KEY_NAME = "marketing-approval-key";

export const approvalKey = Effect.flatMap(ServerSecretStore.ServerSecretStore, (store) =>
  store.getOrCreateRandom(APPROVAL_KEY_NAME, 32),
);
