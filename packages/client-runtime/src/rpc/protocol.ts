import { WsRpcGroup } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { RpcClient } from "effect/rpc";

export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;

// Pings go out every 5 seconds, and a server busy for a few seconds stops
// answering them. Allow 15 seconds without any frame before dropping the socket.
export const PING_TIMEOUT = "15 seconds";

// The server on this same computer can freeze for 50 seconds when the disk is slow.
// Dropping the socket then only forces a reconnect that loads more from the same disk.
const LOCAL_PING_TIMEOUT = "90 seconds";

/** Ping timeout for a socket URL: long for this computer, short for remote hosts. */
export function pingTimeoutForSocketUrl(
  socketUrl: string,
): typeof PING_TIMEOUT | typeof LOCAL_PING_TIMEOUT {
  try {
    const { hostname } = new URL(socketUrl);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]"
      ? LOCAL_PING_TIMEOUT
      : PING_TIMEOUT;
  } catch {
    return PING_TIMEOUT;
  }
}
