import { describe, expect, it } from "vite-plus/test";
import {
  classifyRelease,
  coAuthorNames,
  nextReleaseVersion,
  releaseMetaComment,
  releaseNotes,
} from "./leonidas-release.ts";

describe("Leonidas release policy", () => {
  it("publishes an illustrated article and keeps curated patch notes and metadata", () => {
    const post =
      "# A better way to catch up\n\nRead each update as a story.\n\n![Update history](https://example.com/history.webp)\n\n## History\nBrowse previous releases.";
    const notes = releaseNotes(
      [
        {
          subject: "feat: release articles",
          body: "Release-Note: Added illustrated release articles with clearly organized features and fixes.",
        },
      ],
      "0.43.0",
      true,
      "a".repeat(40),
      post,
    );
    expect(notes.startsWith(post)).toBe(true);
    expect(notes).toContain("## Patch notes\n\n### New\n- Added illustrated release articles");
    expect(notes.trimEnd().split("\n").at(-1)).toMatch(/^<!-- leonidas-release /);
    expect(notes).not.toContain("## If Windows shows a blue warning");
    expect(notes).not.toContain("The installer is not signed yet");
  });
  it("reserves 1.0.0 for an explicit public launch", () => {
    expect(nextReleaseVersion("0.1.2", "patch", true)).toBe("0.1.3");
    expect(nextReleaseVersion("0.1.2", "minor", true)).toBe("0.2.0");
    expect(nextReleaseVersion("0.1.2", "major", true)).toBe("0.2.0");
    expect(nextReleaseVersion("0.2.0", "launch", true)).toBe("1.0.0");
    expect(() => nextReleaseVersion("1.0.16", "patch", true)).toThrow();
  });
  it("selects the highest change category and handles breaking trailers", () => {
    expect(
      classifyRelease([
        { subject: "fix: counter", body: "" },
        { subject: "feat: history", body: "" },
      ]),
    ).toBe("minor");
    expect(classifyRelease([{ subject: "Build: Add history", body: "" }])).toBe("minor");
    expect(classifyRelease([{ subject: "fix!: format", body: "" }])).toBe("major");
    expect(classifyRelease([{ subject: "fix: format", body: "BREAKING CHANGE: new format" }])).toBe(
      "major",
    );
    expect(nextReleaseVersion("1.2.3", "major", false)).toBe("2.0.0");
    expect(() => nextReleaseVersion("1.2.3", "launch", false)).toThrow();
    expect(() => nextReleaseVersion("01.2.3", "patch", false)).toThrow();
  });
  it("uses curated release trailers and excludes raw commit subjects", () => {
    const notes = releaseNotes(
      [
        {
          subject: "feat: internal implementation",
          body: "Release-Note: Added a list of past updates\nRelease-Note: Added a live token counter",
        },
        { subject: "fix: missing counter", body: "" },
        { subject: "ci: cache Rust", body: "" },
        { subject: "docs: status", body: "" },
      ],
      "0.2.0",
      true,
      "a".repeat(40),
    );
    expect(notes).toContain(
      "# 0.2.0 · Development\n\n- Added a list of past updates\n- Added a live token counter\n",
    );
    expect(notes).not.toContain("## Details");
    expect(notes).not.toContain("Missing counter");
    expect(notes).not.toContain("internal implementation");
    expect(notes).not.toContain("cache Rust");
    expect(notes).not.toContain("status");
  });
  it("caps highlights at five and moves overflow and Release-Detail lines under Details", () => {
    const notes = releaseNotes(
      [
        {
          subject: "feat: a",
          body: Array.from({ length: 7 }, (_, i) => `Release-Note: Added thing ${i + 1}`).join(
            "\n",
          ),
        },
        {
          subject: "fix: b",
          body: "Release-Note: Added thing 1\nRelease-Detail: Takes effect after a restart",
        },
      ],
      "0.3.0",
      true,
    );
    const [highlights, details] = notes.split("\n## Details\n") as [string, string];
    expect(highlights.match(/^- /gm)).toHaveLength(5);
    expect(highlights).toContain("- Added thing 5\n");
    expect(details).toContain("- Added thing 6\n- Added thing 7\n- Takes effect after a restart\n");
    expect(details.match(/^- /gm)).toHaveLength(3);
  });
  it("keeps detail-only changes out of the highlights and does not repeat their subject", () => {
    const notes = releaseNotes(
      [
        {
          subject: "fix: internal cache implementation",
          body: "Release-Detail: Fixed missing totals after reopening a conversation.",
        },
      ],
      "0.3.1",
      true,
    );
    expect(notes).toContain("## Details\n- Fixed missing totals after reopening a conversation.");
    expect(notes).not.toContain("internal cache");
  });
  it("ends with a metadata comment of full sha, aliased authors and co-authors", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const notes = releaseNotes(
      [
        {
          subject: "feat: x",
          author: "ItzJsimp",
          body: "Release-Note: Added x\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>",
        },
        {
          subject: "fix: y",
          author: "Seth Moncada",
          body: "Co-authored-by: Pat Lee <pat@example.com>",
        },
        {
          subject: "fix: z",
          author: "ItzJsimp",
          body: "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>",
        },
        { subject: "fix: w", author: "Someone Else", body: "" },
      ],
      "0.3.0",
      true,
      sha,
    );
    const lines = notes.trimEnd().split("\n");
    expect(lines.at(-1)).toBe(
      `<!-- leonidas-release {"commit":"${sha}","authors":["Jake","Mob","Someone Else"],"coAuthors":["Claude","Pat Lee"],"authorCommits":{"Jake":2,"Mob":1,"Someone Else":1}} -->`,
    );
    expect(lines.at(-2)).toBe("");
  });
  it("keeps a safe fallback bullet and cannot be broken out of the comment by a name", () => {
    const quiet = releaseNotes(
      [{ subject: "ci: cache Rust", body: "", author: "A --> B" }],
      "0.3.1",
      true,
    );
    expect(quiet).toContain("\n- No patch notes were provided for this update.\n");
    const comment = quiet.trimEnd().split("\n").at(-1)!;
    expect(comment.indexOf("-->")).toBe(comment.length - 3);
    const json = JSON.parse(comment.slice("<!-- leonidas-release ".length, -4));
    expect(json.authors).toEqual(["A --> B"]);
  });
  it("parses commit trailers case-insensitively and emits an empty commit when unknown", () => {
    expect(
      coAuthorNames("co-authored-by: Pat <p@x.io>\nCo-Authored-By: Claude <a@anthropic.com>"),
    ).toEqual(["Pat", "Claude"]);
    expect(releaseMetaComment({ commit: "", authors: [], coAuthors: [] })).toBe(
      '<!-- leonidas-release {"commit":"","authors":[],"coAuthors":[]} -->',
    );
  });
});
