import { OrchestratorMcpFailure } from "@t3tools/contracts";
import {
  HTML_RENDER_COLUMN_WIDTH,
  HTML_RENDER_LAYOUT_GUIDE,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_TITLE_LENGTH,
  HTML_RENDER_MIN_HEIGHT,
  HTML_RENDER_THEME_GUIDE,
  HTML_RENDER_TOOL_NAME,
} from "@t3tools/shared/htmlRender";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as HtmlRender from "#server/htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const Html = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512_000)).annotate({
  description: "A complete, self-contained HTML document.",
});

const PAGE_RULES =
  "Inline <style> and <script>. Local images as absolute paths are inlined. Remote URLs load as-is.";

const CanvasText = Schema.String.check(Schema.isMaxLength(2000));
const CanvasCell = Schema.String.check(Schema.isMaxLength(80));
const CanvasTool = Tool.make("leo_canvas", {
  description:
    "Build an offline Leonidas canvas from structured sections: accessible pill tabs, KPI cards, an SVG flow, and tables. First read leonidas-canvas/SKILL.md. This returns HTML, not a published page. Check the HTML with html_preview at wide and narrow widths, then publish it with html_render before replying.",
  parameters: Schema.Struct({
    skillLoaded: Schema.Literal(true).annotate({
      description: "Confirm you actually read leonidas-canvas/SKILL.md this session.",
    }),
    title: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(HTML_RENDER_MAX_TITLE_LENGTH),
    ),
    sections: Schema.Array(
      Schema.Struct({
        title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
        summary: CanvasText,
        metrics: Schema.optional(
          Schema.Array(Schema.Struct({ label: CanvasCell, value: CanvasCell })).check(
            Schema.isMaxLength(4),
          ),
        ),
        flow: Schema.optional(
          Schema.Array(Schema.String.check(Schema.isMaxLength(40))).check(Schema.isMaxLength(8)),
        ),
        columns: Schema.optional(Schema.Array(CanvasCell).check(Schema.isMaxLength(6))),
        rows: Schema.optional(
          Schema.Array(Schema.Array(CanvasCell).check(Schema.isMaxLength(6))).check(
            Schema.isMaxLength(20),
          ),
        ),
      }).check(
        Schema.makeFilter(
          (section) =>
            !section.rows?.length ||
            Boolean(
              section.columns?.length &&
              section.rows.every((row) => row.length === section.columns!.length),
            ) ||
            "Table rows must match the columns.",
        ),
      ),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(6)),
  }),
  success: Schema.Struct({ html: Schema.String, title: Schema.String }),
  failure: OrchestratorMcpFailure,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Build canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const HtmlPreviewTool = Tool.make("leo_html_preview", {
  description: `Check an HTML page before html_render. Returns PNG, contentHeight, and console output. If it says the browser is still installing, call again in a minute. ${PAGE_RULES} Theme and layout rules are in html_render.`,
  parameters: Schema.Struct({
    html: Html,
    width: Schema.optional(
      Schema.Int.annotate({
        description: `CSS pixels, 240 to 1600. Default ${HTML_RENDER_COLUMN_WIDTH}. Use about 390 for phones.`,
      }),
    ),
    appearance: Schema.optional(
      Schema.Literals(["dark", "light"]).annotate({
        description: "Default dark.",
      }),
    ),
  }),
  success: Schema.Struct({
    width: Schema.Int,
    contentHeight: Schema.Int,
    capturedHeight: Schema.Int,
    consoleMessages: Schema.Array(
      Schema.Struct({
        level: Schema.Literals(["log", "info", "warning", "error"]),
        text: Schema.String,
      }),
    ),
    missingImages: Schema.optional(Schema.Array(Schema.String)),
    screenshot: Schema.Struct({
      mimeType: Schema.Literal("image/png"),
      data: Schema.String,
      width: Schema.Int,
      height: Schema.Int,
    }),
  }),
  failure: OrchestratorMcpFailure,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Preview HTML")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

// Read-only in the MCP sense: it shows a page in the caller's own thread and
// touches no workspace, so plan mode and read-only sandboxes can use it.
// Open-world, since the page may load remote resources, as in a preview.
const HtmlRenderTool = Tool.make(HTML_RENDER_TOOL_NAME, {
  description: `Show a finished HTML page inline in this thread, above your final reply. Do not announce or restate the page. The frame fits the page height. A height below contentHeight caps the frame and the rest scrolls. ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`,
  parameters: Schema.Struct({
    html: Html,
    title: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(HTML_RENDER_MAX_TITLE_LENGTH),
    ),
    height: Schema.Int.annotate({
      description: `Frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT} to ${HTML_RENDER_MAX_HEIGHT}. Use the contentHeight from html_preview.`,
    }),
  }),
  success: Schema.Struct({
    htmlRender: Schema.Struct({
      attachmentId: Schema.String,
      title: Schema.String,
      height: Schema.Number,
      heights: Schema.optional(Schema.Array(Schema.Tuple([Schema.Int, Schema.Int]))),
    }),
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Render HTML")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const HtmlPreviewToolkit = Toolkit.make(HtmlPreviewTool);

export const HtmlRenderToolkit = Toolkit.make(HtmlRenderTool, CanvasTool);

export const HtmlToolkit = Toolkit.make(HtmlPreviewTool, HtmlRenderTool, CanvasTool);
