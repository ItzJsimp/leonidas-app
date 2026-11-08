import * as Effect from "effect/Effect";
import * as LocalVmService from "#server/localVm/LocalVmService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { LocalVmStandardToolkit, LocalVmScreenshotToolkit } from "./tools.ts";

const caller = McpInvocationContext.McpInvocationContext.pipe(
  Effect.flatMap((scope) => McpInvocationContext.requireThreadScope(scope, "AI Desktop")),
);
export const layerStandard = McpToolAccess.toLayer(LocalVmStandardToolkit, {
  leo_local_vm_list: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const scope = yield* caller;
      const service = yield* LocalVmService.LocalVmService;
      const state = yield* service.list;
      return {
        ...state,
        sessions: state.sessions.filter((session) => session.threadId === scope.thread.threadId),
      };
    }),
  ),
  leo_local_vm_input: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* caller;
      const service = yield* LocalVmService.LocalVmService;
      yield* service.input({ threadId: scope.thread.threadId, action: input.action });
    }),
  ),
});
export const layerScreenshot = McpToolAccess.toLayer(LocalVmScreenshotToolkit, {
  leo_local_vm_screenshot: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const scope = yield* caller;
      const service = yield* LocalVmService.LocalVmService;
      return yield* service.screenshot({ threadId: scope.thread.threadId });
    }),
  ),
});
