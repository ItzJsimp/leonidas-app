import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { buildCanvasDocument } from "@t3tools/shared/canvas";

import * as HtmlRender from "#server/htmlRender/HtmlRender.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { HtmlPreviewToolkit, HtmlRenderToolkit, type HtmlToolkit } from "./tools.ts";

const INVALID_PAGE_ERRORS = new Set([
  "HtmlRenderImagesNotFoundError",
  "HtmlRenderImageTooLargeError",
  "HtmlRenderPageTooLargeError",
  "HtmlRenderViewportHeightError",
]);

const toFailure = (error: { readonly _tag: string; readonly message: string }) =>
  new OrchestratorMcpFailure({
    code: INVALID_PAGE_ERRORS.has(error._tag) ? "invalid_request" : "orchestration_error",
    message: error.message,
  });

// shortcut: drafts live in memory and are lost on a server restart; the agent then sends html again.
// Ids only need to be unique in this process: every caller is a local agent of the same user.
const MAX_DRAFTS = 8;
const drafts = new Map<string, string>();
let draftCount = 0;

const saveDraft = (html: string): string => {
  const draftId = `draft-${++draftCount}`;
  drafts.set(draftId, html);
  if (drafts.size > MAX_DRAFTS) drafts.delete(drafts.keys().next().value!);
  return draftId;
};

/** One page is written once: later calls refer to it by draftId. */
const resolvePage = (input: {
  readonly html?: string | undefined;
  readonly draftId?: string | undefined;
}) => {
  if (input.html !== undefined)
    return Effect.succeed({ html: input.html, draftId: saveDraft(input.html) });
  const html = input.draftId === undefined ? undefined : drafts.get(input.draftId);
  return html === undefined
    ? Effect.fail(
        new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Unknown draftId. Send the html again.",
        }),
      )
    : Effect.succeed({ html, draftId: input.draftId! });
};

const handlers = {
  leo_canvas: McpToolAccess.readsAsCaller((input) =>
    Effect.succeed({ draftId: saveDraft(buildCanvasDocument(input)), title: input.title }),
  ),
  // The headless browser runs on the host and can open local files, so only
  // agents T3 launched, which already work on this machine, get it.
  leo_html_preview: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const htmlRender = yield* HtmlRender.HtmlRender;
      const { draftId: _, ...rest } = input;
      const page = yield* resolvePage(input);
      const { png, ...preview } = yield* htmlRender
        .preview({ ...rest, html: page.html })
        .pipe(Effect.mapError(toFailure));
      return {
        draftId: page.draftId,
        ...preview,
        screenshot: {
          mimeType: "image/png" as const,
          data: png,
          width: preview.width,
          height: preview.capturedHeight,
        },
      };
    }),
  ),
  // The page is stored in the calling thread, so it needs that thread's live run.
  leo_html_render: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "leo_html_render");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const { draftId: _, ...rest } = input;
      const page = yield* resolvePage(input);
      const reference = yield* htmlRender
        .publish({ threadId: thread.threadId, ...rest, html: page.html })
        .pipe(Effect.mapError(toFailure));
      return {
        htmlRender: reference,
        message:
          "Shown to the reader above your reply. Don't mention or describe the page; reply with only what it doesn't already say.",
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof HtmlToolkit.tools>;

export const layerPreview = McpToolAccess.toLayer(HtmlPreviewToolkit, {
  leo_html_preview: handlers.leo_html_preview,
});

export const layerRender = McpToolAccess.toLayer(HtmlRenderToolkit, {
  leo_html_render: handlers.leo_html_render,
  leo_canvas: handlers.leo_canvas,
});
