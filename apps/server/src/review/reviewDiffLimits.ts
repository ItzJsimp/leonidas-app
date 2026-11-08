import type { ReviewDiffPreviewResult } from "@t3tools/contracts";

export const MAX_DIFF_CHARS = 30_000;
export const MAX_FILE_CHARS = 20_000;

export const cut = (text: string, max: number) => ({
  text: text.slice(0, max),
  truncated: text.length > max,
});

/** The diff of each source, cut to `MAX_DIFF_CHARS` and flagged. An empty diff gives an empty `sources`. */
export const capPreview = (preview: ReviewDiffPreviewResult) => ({
  cwd: preview.cwd,
  sources: preview.sources.map((source) => {
    const diff = cut(source.diff, MAX_DIFF_CHARS);
    return {
      id: source.id,
      kind: source.kind,
      title: source.title,
      baseRef: source.baseRef,
      headRef: source.headRef,
      diff: diff.text,
      truncated: source.truncated || diff.truncated,
      files: source.files ?? [],
    };
  }),
});

/** A path inside the repository: no drive, no leading slash, no `..` step. */
export const isRepositoryPath = (path: string) =>
  path.length > 0 &&
  !/^([a-zA-Z]:|[\\/])/.test(path) &&
  !path.split(/[\\/]/).some((part) => part === ".." || part === "");
