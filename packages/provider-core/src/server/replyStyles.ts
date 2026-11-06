// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import {
  AUTOPILOT_REPLY_STYLE_SLUG,
  LEONIDAS_REPLY_STYLE_SLUG,
  parseReplyStyleFile,
  REPLY_STYLE_DIRECTORY,
  REPLY_STYLE_SLUG_PATTERN,
  type ReplyStylePreset,
  type ReplyStyleProblem,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { AUTOPILOT_REPLY_STYLE, LEONIDAS_REPLY_STYLE } from "./outputStandard.ts";

export interface ResolvedReplyStyle {
  readonly slug: string;
  readonly name: string;
  readonly body: string;
  /** Set when the selected preset could not be used and Leonidas replaced it. */
  readonly notice?: { readonly slug: string; readonly problem: ReplyStyleProblem };
}

const LEONIDAS: ReplyStylePreset = {
  slug: LEONIDAS_REPLY_STYLE_SLUG,
  name: "Leonidas",
  description: "The shipped Leonidas reply style.",
  builtin: true,
};

const AUTOPILOT: ReplyStylePreset = {
  slug: AUTOPILOT_REPLY_STYLE_SLUG,
  name: "Autopilot",
  description: "Short replies. Decides small things and asks only at real gates.",
  builtin: true,
};

const readPreset = Effect.fn("readReplyStylePreset")(function* (
  fileSystem: FileSystem.FileSystem,
  workspace: string | null,
  slug: string,
) {
  if (
    !REPLY_STYLE_SLUG_PATTERN.test(slug) ||
    slug === LEONIDAS_REPLY_STYLE_SLUG ||
    slug === AUTOPILOT_REPLY_STYLE_SLUG
  ) {
    return { problem: "bad-slug" as const };
  }
  if (workspace === null) return { problem: "missing" as const };
  const file = NodePath.join(workspace, REPLY_STYLE_DIRECTORY, `${slug}.md`);
  return yield* fileSystem.readFileString(file).pipe(
    Effect.map(parseReplyStyleFile),
    Effect.catch((error) =>
      Effect.succeed({
        problem: error.reason._tag === "NotFound" ? ("missing" as const) : ("unreadable" as const),
      }),
    ),
  );
});

/**
 * The reply style for a selected slug. Leonidas when nothing is selected, and Leonidas plus a
 * notice when the preset file is missing, unreadable, empty, has bad frontmatter or is too long.
 */
export const loadReplyStyle = Effect.fn("loadReplyStyle")(function* (input: {
  readonly workspace: string | null;
  readonly slug: string | null | undefined;
}) {
  const leonidas: ResolvedReplyStyle = {
    slug: LEONIDAS.slug,
    name: LEONIDAS.name,
    body: LEONIDAS_REPLY_STYLE,
  };
  const slug = input.slug?.trim();
  if (!slug || slug === LEONIDAS_REPLY_STYLE_SLUG) return leonidas;
  if (slug === AUTOPILOT_REPLY_STYLE_SLUG) {
    return { slug, name: AUTOPILOT.name, body: AUTOPILOT_REPLY_STYLE } satisfies ResolvedReplyStyle;
  }
  const fileSystem = yield* FileSystem.FileSystem;
  const preset = yield* readPreset(fileSystem, input.workspace, slug);
  if ("problem" in preset) return { ...leonidas, notice: { slug, problem: preset.problem } };
  return { slug, name: preset.name, body: preset.body } satisfies ResolvedReplyStyle;
});

/** Leonidas, then Autopilot, then every `<slug>.md` in the workspace preset folder, broken files flagged. */
export const listReplyStyles = Effect.fn("listReplyStyles")(function* (workspace: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const names = yield* fileSystem
    .readDirectory(NodePath.join(workspace, REPLY_STYLE_DIRECTORY))
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const slugs = names
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .toSorted();
  const presets: ReplyStylePreset[] = [LEONIDAS, AUTOPILOT];
  for (const slug of slugs) {
    const preset = yield* readPreset(fileSystem, workspace, slug);
    presets.push(
      "problem" in preset
        ? { slug, name: slug, description: "", builtin: false, problem: preset.problem }
        : { slug, name: preset.name, description: preset.description, builtin: false },
    );
  }
  return presets;
});
