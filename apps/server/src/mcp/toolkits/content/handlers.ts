// @effect-diagnostics globalDate:off - each change is stamped with the wall-clock time.
import { type ContentActor, type ContentVideo, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { contentApprovalKey } from "#server/content/approvalKey.ts";
import * as ContentFiles from "#server/content/contentFiles.ts";
import { type Change, recordChange, videoRel } from "#server/content/contentGit.ts";
import { proposalRel, proposeDeal } from "#server/content/contentIntake.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { workspaceRoot } from "../marketing/handlers.ts";
import { ContentToolkit } from "./tools.ts";

const failure = (code: "invalid_request" | "orchestration_error", message: string) =>
  new OrchestratorMcpFailure({ code, message });

const caller = Effect.map(McpInvocationContext.McpInvocationContext, (scope): ContentActor => ({
  kind: "agent",
  name: scope.thread ? `thread ${scope.thread.threadId}` : (scope.client?.label ?? "agent"),
}));

const key = contentApprovalKey.pipe(
  Effect.mapError(() => failure("orchestration_error", "Could not read the approval key.")),
);

/** Runs file work on the root; a ContentError becomes a message the agent can act on. */
const onRoot = <A>(work: (root: string, key: Uint8Array) => A) =>
  Effect.flatMap(Effect.all([workspaceRoot, key]), ([root, signingKey]) =>
    Effect.try({
      try: () => work(root, signingKey),
      catch: (error) =>
        error instanceof ContentFiles.ContentError
          ? failure("invalid_request", error.message)
          : failure("orchestration_error", `Content files failed: ${String(error)}`),
    }).pipe(Effect.map((value) => ({ root, value }))),
  );

/** A file write by the calling agent, then its Git commit. A failed commit keeps the file. */
const write = (
  what: "video" | "script" | "stage",
  work: (root: string, key: Uint8Array, actor: ContentActor, now: string) => ContentVideo,
) =>
  Effect.gen(function* () {
    const actor = yield* caller;
    const { root, value: video } = yield* onRoot((root, signingKey) =>
      work(root, signingKey, actor, new Date().toISOString()),
    );
    const ref = { actor, deal: video.deal, file: video.file };
    const change: Change = what === "stage" ? { ...ref, what, to: video.stage } : { ...ref, what };
    const { committed, detail } = yield* Effect.promise(() =>
      recordChange(root, videoRel(video.deal, video.file), change),
    );
    return { video, recorded: committed, detail };
  });

const handlers = {
  leo_content_read: McpToolAccess.reads((input) =>
    Effect.map(
      onRoot((root, signingKey) => {
        const voiceBible = ContentFiles.readVoiceBible(root).text;
        if (input.deal) {
          const deal = ContentFiles.readDeal(root, signingKey, input.deal);
          if (!deal)
            throw new ContentFiles.ContentError(`No deal ${input.deal}. Read the deals first.`);
          return { deal, card: ContentFiles.dealCard(root, input.deal), voiceBible, bad: [] };
        }
        const { records, bad } = ContentFiles.listDeals(root, signingKey);
        return {
          deals: records.map(({ slug, brand, videos }) => ({
            slug,
            brand,
            videos: videos.map(({ file, title, stage }) => ({ file, title, stage })),
          })),
          bad,
        };
      }),
      ({ value }) => value,
    ),
  ),
  leo_content_deal_propose: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const actor = yield* caller;
      const { root, value } = yield* onRoot((root, signingKey) =>
        proposeDeal(root, signingKey, input, actor, new Date().toISOString()),
      );
      const slug = value.proposal?.slug ?? value.deal?.slug;
      // A proposal is its own file; an `auto` deal is the new deal card.
      const { committed, detail } = yield* Effect.promise(() =>
        slug
          ? recordChange(
              root,
              value.deal ? `deals/${slug}/deal.md` : proposalRel(slug),
              value.deal
                ? { actor, what: "deal", deal: slug }
                : { actor, what: "proposal", deal: slug, outcome: "proposed" },
            )
          : Promise.resolve({ committed: false, detail: "Nothing was saved." }),
      );
      return { ...value, recorded: committed, detail };
    }),
  ),
  leo_content_video_create: McpToolAccess.writes((input) =>
    write("video", (root, signingKey, actor, now) =>
      ContentFiles.createVideo(root, signingKey, input, actor, now),
    ),
  ),
  leo_content_script_save: McpToolAccess.writes((input) =>
    write("script", (root, signingKey, actor, now) =>
      ContentFiles.saveScript(root, signingKey, input, actor, now),
    ),
  ),
  leo_content_stage_move: McpToolAccess.writes((input) =>
    write("stage", (root, signingKey, actor, now) =>
      ContentFiles.moveStage(root, signingKey, input, actor, now),
    ),
  ),
} satisfies McpToolAccess.Handlers<typeof ContentToolkit.tools>;

export const layer = McpToolAccess.toLayer(ContentToolkit, handlers);
