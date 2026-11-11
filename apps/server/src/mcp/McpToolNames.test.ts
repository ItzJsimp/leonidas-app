import {
  LEGACY_MCP_TOOL_NAMES,
  MCP_TOOL_PREFIX,
  toCurrentMcpToolName,
} from "@t3tools/shared/mcpServerName";
import { describe, expect, it } from "@effect/vitest";

import { ActionToolkit } from "./toolkits/actions/tools.ts";
import { AttachmentToolkit } from "./toolkits/attachment/tools.ts";
import { ContentToolkit } from "./toolkits/content/tools.ts";
import { ImagesToolkit } from "./toolkits/images/tools.ts";
import { DeviceToolkit } from "./toolkits/device/tools.ts";
import { EnvironmentToolkit } from "./toolkits/environment/tools.ts";
import { HtmlToolkit } from "./toolkits/html/tools.ts";
import { InsightToolkit } from "./toolkits/insight/tools.ts";
import { LocalVmScreenshotToolkit, LocalVmStandardToolkit } from "./toolkits/localVm/tools.ts";
import { MarketingToolkit } from "./toolkits/marketing/tools.ts";
import { OrchestratorToolkit } from "./toolkits/orchestrator/tools.ts";
import { PreviewToolkit } from "./toolkits/preview/tools.ts";
import { PreviewControlsToolkit } from "./toolkits/previewControls/tools.ts";
import { ProjectToolkit } from "./toolkits/project/tools.ts";
import { PullRequestsToolkit } from "./toolkits/pullRequests/tools.ts";
import { ThreadToolkit } from "./toolkits/thread/tools.ts";
import { WorktreeToolkit } from "./toolkits/worktree/tools.ts";

const toolkits = [
  ActionToolkit,
  AttachmentToolkit,
  ContentToolkit,
  ImagesToolkit,
  DeviceToolkit,
  EnvironmentToolkit,
  HtmlToolkit,
  InsightToolkit,
  LocalVmStandardToolkit,
  LocalVmScreenshotToolkit,
  MarketingToolkit,
  OrchestratorToolkit,
  PreviewToolkit,
  PreviewControlsToolkit,
  ProjectToolkit,
  PullRequestsToolkit,
  ThreadToolkit,
  WorktreeToolkit,
];
const registered = toolkits.flatMap((toolkit) => Object.keys(toolkit.tools));

describe("MCP tool names", () => {
  it("starts every registered tool name with the Leonidas prefix", () => {
    const stray = registered.filter((name) => !name.startsWith(MCP_TOOL_PREFIX));
    expect(stray).toEqual([]);
  });

  it("registers no name twice", () => {
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("maps every legacy name to a registered tool", () => {
    const known = new Set(registered);
    const missing = [...LEGACY_MCP_TOOL_NAMES].filter(
      (name) => !known.has(toCurrentMcpToolName(name)),
    );
    expect(missing).toEqual([]);
  });
});
