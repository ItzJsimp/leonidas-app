import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import {
  ImagesCancelInput,
  ImagesGenerateInput,
  ImagesState,
  ImagesGenerateResult,
  OrchestratorMcpFailure,
  ProjectId,
} from "@t3tools/contracts";
import * as ImageService from "#server/images/ImageService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ThreadManagement from "#server/orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const common = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ImageService.ImageService,
    ProjectService.ProjectService,
    ThreadManagement.ThreadManagementService,
  ],
};
export const ImagesToolkit = Toolkit.make(
  Tool.make("leo_images_status", {
    ...common,
    description:
      "Read local image readiness, models and recent jobs. Use jobId to follow a submitted job. Output files are relative to workspaceRoot.",
    parameters: Schema.Struct({
      projectId: Schema.optional(ProjectId),
      jobId: Schema.optional(Schema.String),
      offset: Schema.optional(
        Schema.Number.pipe(
          Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 100000 })),
        ),
      ),
    }),
    success: Schema.Struct({ ...ImagesState.fields, nextOffset: Schema.NullOr(Schema.Number) }),
  }).annotate(Tool.Readonly, true),
  Tool.make("leo_images_generate", {
    ...common,
    description:
      "Generate a requested image locally. Read status first. Ask for local image use once per chat, then set userApproved. Pass a stable clientRequestId, reused only for retries. Follow jobId with status and display the output image.",
    parameters: Schema.Struct({
      ...ImagesGenerateInput.fields,
      projectId: Schema.optional(ProjectId),
      modelIds: Schema.optional(ImagesGenerateInput.fields.modelIds),
      count: Schema.optional(ImagesGenerateInput.fields.count),
      clientRequestId: Schema.String.pipe(
        Schema.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
      ),
      userApproved: Schema.optional(Schema.Boolean),
    }),
    success: ImagesGenerateResult,
  }),
  Tool.make("leo_images_cancel", {
    ...common,
    description:
      "Cancel the job named by jobId. Use stopRunning to stop it if running. Omit jobId only when the user requests cancellation of all image jobs.",
    parameters: ImagesCancelInput,
    success: Schema.Struct({ cancelled: Schema.Number }),
  }),
);
