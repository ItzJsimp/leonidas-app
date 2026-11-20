/**
 * The spawn gate for native Claude Agent tool calls (ADR-0098). The Claude adapter asks it
 * before the SDK starts a subagent, so a native spawn meets the same rules as app delegate:
 * a free-tier model starts, any other model shows the card and waits, and a refusal or a Deny
 * returns text that the model reads. A failure while it checks refuses the spawn: the gate
 * never fails open. This file holds the types and the service tag, so the adapter can import it
 * with no heavy modules. The implementation is in `nativeSpawnGateLive.ts`.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface NativeSpawnRequest {
  /** The chat whose session calls the Agent tool. */
  readonly threadId: ThreadId;
  readonly threadTitle: string;
  /** The folder that holds `.agents/` for model tiers, or null. */
  readonly cwd: string | null;
  /** The provider account that pays, and its name on the card. */
  readonly instanceId: string;
  readonly account: string;
  /** The model the child would run, as the SDK resolved it. */
  readonly model: string;
  /** True when a native subagent, not the chat's own session, calls the Agent tool. */
  readonly callerIsSubagent: boolean;
  /** What the card calls the child, for example the Agent tool's `subagent_type`. */
  readonly label: string;
  readonly task: string;
  readonly reason: string;
  readonly toolUseId: string;
}

export type NativeSpawnVerdict =
  | { readonly allow: true }
  | { readonly allow: false; readonly message: string };

export class NativeSpawnGate extends Context.Service<
  NativeSpawnGate,
  { readonly check: (request: NativeSpawnRequest) => Effect.Effect<NativeSpawnVerdict> }
>()("t3/subagents/nativeSpawnGate") {}
