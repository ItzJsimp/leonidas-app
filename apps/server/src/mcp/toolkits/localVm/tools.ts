import {
  LocalVmAction,
  LocalVmError,
  LocalVmState,
  LocalVmScreenshotResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as LocalVmService from "#server/localVm/LocalVmService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";

const dependencies = [
  LocalVmService.LocalVmService,
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
];
const failure = Schema.Union([LocalVmError, OrchestratorMcpFailure]);
const list = Tool.make("leo_local_vm_list", {
  description:
    "List existing VirtualBox VMs on the Windows environment server and this thread's AI Desktop connection. The user must connect a running VM in AI Desktop to grant control. Agents cannot claim a VM or resume paused input. These tools only target the guest, never the host desktop.",
  parameters: Schema.Struct({ inspect: Schema.optional(Schema.Boolean) }),
  success: LocalVmState,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);
const input = Tool.make("leo_local_vm_input", {
  description:
    "Send a click, move, scroll, printable ASCII text or supported key to this thread's connected VirtualBox guest. Observe local_vm_screenshot first and use its pixel coordinates. Refuses input when paused or unconnected. No host mouse, clipboard or window control is used.",
  parameters: Schema.Struct({ action: LocalVmAction }),
  success: Schema.Void,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);
export const LocalVmScreenshotTool = Tool.make("leo_local_vm_screenshot", {
  description:
    "Return a PNG image of this thread's connected VirtualBox guest. Works while AI input is paused. Requires a human connection through AI Desktop.",
  parameters: Schema.Struct({ includeImage: Schema.optional(Schema.Boolean) }),
  success: LocalVmScreenshotResult,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);
export const LocalVmStandardToolkit = Toolkit.make(list, input);
export const LocalVmScreenshotToolkit = Toolkit.make(LocalVmScreenshotTool);
