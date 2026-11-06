// @effect-diagnostics nodeBuiltinImport:off - Tests exercise the dependency-free release publisher.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { loadReleasePost } from "./release-post.ts";

const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => NodeFS.rmSync(root, { recursive: true, force: true })),
);

function fixture(post: string) {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "release-post-"));
  roots.push(root);
  NodeFS.mkdirSync(NodePath.join(root, "release-posts"));
  NodeFS.writeFileSync(NodePath.join(root, "release-posts/update.md"), post);
  NodeFS.writeFileSync(NodePath.join(root, "release-posts/board.webp"), "test image");
  return root;
}

describe("release post publishing", () => {
  it("pins screenshot URLs to the exact release commit without changing the article", () => {
    const root = fixture(
      "# Tasks that stay in sync\n\nFinish work with less cleanup.\n\n![Task board](board.webp)\n\n## Tasks\nYour task moves to review.",
    );
    const post = loadReleasePost(
      root,
      "release-posts/update.md",
      "ItzJsimp/leonidas-app",
      "a".repeat(40),
    );
    expect(post).toContain(
      `https://raw.githubusercontent.com/ItzJsimp/leonidas-app/${"a".repeat(40)}/release-posts/board.webp`,
    );
    expect(post).toContain("## Tasks\nYour task moves to review.");
  });
  it("rejects path escapes, missing images and inaccessible image descriptions", () => {
    const root = fixture("# Update\n\nIntroduction.\n\n![](board.webp)");
    expect(() =>
      loadReleasePost(root, "../secret.md", "ItzJsimp/leonidas-app", "a".repeat(40)),
    ).toThrow("inside release-posts");
    expect(() =>
      loadReleasePost(root, "release-posts/update.md", "ItzJsimp/leonidas-app", "a".repeat(40)),
    ).toThrow("alt text");
    NodeFS.writeFileSync(
      NodePath.join(root, "release-posts/update.md"),
      "# Update\n\nIntroduction.\n\n![Image](../../secret.png)",
    );
    expect(() =>
      loadReleasePost(root, "release-posts/update.md", "ItzJsimp/leonidas-app", "a".repeat(40)),
    ).toThrow("inside release-posts");
  });
});
