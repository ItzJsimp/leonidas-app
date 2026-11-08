import {
  ContentBadRecord,
  ContentDeal,
  ContentIntake,
  ContentProposal,
  ContentSlug,
  ContentStage,
  ContentVideo,
  ContentVideoFile,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as ServerSecretStore from "#server/auth/ServerSecretStore.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

/**
 * The content tool kit: agents read deals and draft scripts. No tool here approves, films,
 * delivers or marks paid; those are a person's acts in the Content screen.
 */

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  // The workspace root comes from the task board's AIOS, like the marketing tools.
  ProjectService.ProjectService,
  TaskBoardService.TaskBoardService,
  // Reads the approval key, so the stage an agent sees is the checked one.
  ServerSecretStore.ServerSecretStore,
];

/** A saved video and whether its Git commit went in. */
const Saved = Schema.Struct({
  video: ContentVideo,
  recorded: Schema.Boolean,
  detail: Schema.String,
});

const ContentReadTool = Tool.make("leo_content_read", {
  description:
    "Read the Content deals. Without deal: each deal with its video stages. With deal: the deal card (brief and terms), brand do-nots, every video with script and scorecard, and the voice bible. Read before you draft.",
  parameters: Schema.Struct({ deal: Schema.optional(ContentSlug) }),
  success: Schema.Struct({
    deals: Schema.optional(
      Schema.Array(
        Schema.Struct({
          slug: ContentSlug,
          brand: Schema.String,
          videos: Schema.Array(
            Schema.Struct({ file: Schema.String, title: Schema.String, stage: ContentStage }),
          ),
        }),
      ),
    ),
    deal: Schema.optional(ContentDeal),
    card: Schema.optional(Schema.String),
    voiceBible: Schema.optional(Schema.String),
    bad: Schema.Array(ContentBadRecord),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Read content deals")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ContentVideoCreateTool = Tool.make("leo_content_video_create", {
  description: "Add a video idea to a deal. It starts in idea as the next numbered file.",
  parameters: Schema.Struct({
    deal: ContentSlug,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
    idea: Schema.String.check(Schema.isMaxLength(5_000)),
  }),
  success: Saved,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Add a video idea")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const ContentScriptSaveTool = Tool.make("leo_content_script_save", {
  description:
    "Save your script draft for a video in idea or scripting (VISUAL, SPOKEN and SFX lines), with the critic's hook score and the models used. The server counts spoken seconds, banned words and brand do-nots.",
  parameters: Schema.Struct({
    deal: ContentSlug,
    file: ContentVideoFile,
    script: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
    hookScore: Schema.optional(
      Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(10)),
    ),
    writerModel: Schema.optional(Schema.String.check(Schema.isMaxLength(80))),
    criticModel: Schema.optional(Schema.String.check(Schema.isMaxLength(80))),
  }),
  success: Saved,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Save a script draft")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const ContentStageMoveTool = Tool.make("leo_content_stage_move", {
  description:
    "Move a video from idea to scripting, or from scripting to script_review when the draft is ready. A banned word or brand do-not blocks script_review. Only a person approves.",
  parameters: Schema.Struct({
    deal: ContentSlug,
    file: ContentVideoFile,
    to: Schema.Literals(["scripting", "script_review"]),
  }),
  success: Saved,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Move a video stage")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const Line = (max: number) => Schema.String.check(Schema.isMaxLength(max));

const ContentDealProposeTool = Tool.make("leo_content_deal_propose", {
  description:
    "Propose a new deal you found, for example from an email. A person confirms it in the Content screen. It is refused when deal intake is manual. Fill only what the source says.",
  parameters: Schema.Struct({
    brand: Line(120),
    contact: Schema.optional(Line(200)),
    terms: Schema.optional(Line(5_000)),
    deadline: Schema.optional(Line(10)),
    driveFolder: Schema.optional(Line(300)),
    briefLink: Schema.optional(Line(500)),
    source: Schema.optional(Line(300)),
  }),
  success: Schema.Struct({
    intake: ContentIntake,
    proposal: Schema.optional(ContentProposal),
    deal: Schema.optional(ContentDeal),
    recorded: Schema.Boolean,
    detail: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Propose a deal")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

export const ContentToolkit = Toolkit.make(
  ContentReadTool,
  ContentDealProposeTool,
  ContentVideoCreateTool,
  ContentScriptSaveTool,
  ContentStageMoveTool,
);
