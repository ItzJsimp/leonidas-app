// @effect-diagnostics nodeBuiltinImport:off
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as ImageService from "#server/images/ImageService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller, resolveProjectId } from "../../threadAccess.ts";
import { ImagesToolkit } from "./tools.ts";

// Consent expires when the server restarts or the bounded session cache evicts it.
const approvedChats = new Set<string>();

const project = (id: Parameters<typeof resolveProjectId>[1]) =>
  Effect.gen(function* () {
    const context = yield* readCaller();
    const projects = yield* ProjectService.ProjectService;
    const projectId = yield* resolveProjectId(context, id);
    const target = yield* projects.getById(projectId).pipe(
      Effect.mapError(
        () =>
          new OrchestratorMcpFailure({
            code: "orchestration_error",
            message: "Could not read the image project.",
          }),
      ),
    );
    if (Option.isNone(target))
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "The image project was not found.",
      });
    return target.value;
  });

const imageFailure = (error: { readonly detail?: string | undefined }) =>
  new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: error.detail ?? "The image operation failed.",
  });

export const layer = McpToolAccess.toLayer(ImagesToolkit, {
  leo_images_status: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const target = yield* project(input?.projectId);
      const result = yield* (yield* ImageService.ImageService)
        .subscribe(target)
        .pipe(Stream.runHead, Effect.mapError(imageFailure));
      if (Option.isNone(result))
        return yield* new OrchestratorMcpFailure({
          code: "orchestration_error",
          message: "Image status is unavailable.",
        });
      const offset = input.offset ?? 0;
      const matches = result.value.items.filter(
        (item) => !input.jobId || item.jobId === input.jobId,
      );
      return {
        ...result.value,
        nextOffset: matches.length > offset + 20 ? offset + 20 : null,
        items: matches
          .slice(offset, offset + 20)
          .map((item) => ({ ...item, prompt: item.prompt.slice(0, 200) })),
      };
    }),
  ),
  leo_images_generate: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const caller = yield* readCaller();
      const chatKey = caller.caller?.id ?? caller.scope.requestNamespace;
      if (!approvedChats.has(chatKey) && input.userApproved !== true)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message:
            "Ask the user to allow local image generation for this chat. Set userApproved only after approval.",
        });
      const target = yield* project(input.projectId);
      const state = yield* (yield* ImageService.ImageService)
        .subscribe(target)
        .pipe(Stream.runHead, Effect.mapError(imageFailure));
      const modelIds =
        input.modelIds ??
        (Option.isSome(state) ? state.value.setup?.installedModelIds?.slice(0, 1) : undefined) ??
        [];
      if (!modelIds.length)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Set up a local image model in Images before generation.",
        });
      if (approvedChats.size >= 256) approvedChats.delete(approvedChats.values().next().value!);
      approvedChats.add(chatKey);
      const clientRequestId = NodeCrypto.createHash("sha256")
        .update(`${chatKey.length}:${chatKey}${input.clientRequestId}`)
        .digest("hex");
      return yield* (yield* ImageService.ImageService)
        .generate(target, {
          ...input,
          clientRequestId,
          projectId: target.id,
          modelIds,
          count: input.count ?? 1,
        })
        .pipe(Effect.mapError(imageFailure));
    }),
  ),
  leo_images_cancel: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      return yield* (yield* ImageService.ImageService)
        .cancel(input)
        .pipe(Effect.mapError(imageFailure));
    }),
  ),
});
