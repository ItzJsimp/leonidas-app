import * as Effect from "effect/Effect";
import type {
  SkillPickCandidate,
  SkillPickResult,
} from "@t3tools/provider-core/server/textGeneration";
import type * as ServerSettings from "../serverSettings.ts";
import type { TextGeneration } from "../textGeneration/TextGeneration.ts";

/** The model stage must not keep a click waiting longer than this. */
export const SKILL_PICK_TIMEOUT = "12 seconds";

export interface SkillPickRequest {
  readonly cwd: string;
  readonly request: string;
  readonly project: string;
  readonly alreadyAdded: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<SkillPickCandidate>;
  readonly max: number;
}

export interface SkillPickResponse extends SkillPickResult {
  /** False when the model could not answer, so the caller must fall back to its own pick. */
  readonly modelUsed: boolean;
}

const UNAVAILABLE: SkillPickResponse = { picks: [], modelUsed: false };

/** Asks the text-generation model which of the shortlisted skills fit the request. */
export function make(
  textGeneration: TextGeneration["Service"],
  serverSettings: ServerSettings.ServerSettingsService["Service"],
) {
  return {
    pick: (input: SkillPickRequest): Effect.Effect<SkillPickResponse> =>
      Effect.gen(function* () {
        const generate = textGeneration.pickSkills;
        if (!generate || input.candidates.length === 0 || input.max < 1) return UNAVAILABLE;
        const settings = yield* serverSettings.getSettings;
        const result = yield* generate({
          ...input,
          modelSelection: settings.textGenerationModelSelection,
        }).pipe(Effect.timeout(SKILL_PICK_TIMEOUT));
        return { picks: result.picks, modelUsed: true };
      }).pipe(Effect.orElseSucceed(() => UNAVAILABLE)),
  };
}
