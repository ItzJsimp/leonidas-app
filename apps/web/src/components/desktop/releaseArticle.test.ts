import { describe, expect, it } from "vite-plus/test";
import { parseReleaseArticle, releaseArticleUrl } from "./releaseArticle";

describe("release articles", () => {
  it("retains feature sections and captions, but hides internal release metadata", () => {
    const article = parseReleaseArticle(
      '# Tasks that stay in sync\n\nA simpler way to finish your work.\n\n![Task board](https://example.com/tasks.webp)\n\n## Improvements\n- Fixed task labels. {tour:tasks}\n\n<!-- leonidas-release {"commit":"abc"} -->',
      "0.42.0",
    );
    expect(article.title).toBe("Tasks that stay in sync");
    expect(article.summary).toBe("A simpler way to finish your work.");
    expect(article.hasIntroduction).toBe(true);
    expect(article.image).toEqual({ src: "https://example.com/tasks.webp", alt: "Task board" });
    expect(article.markdown).toContain("## Improvements");
    expect(article.markdown).not.toMatch(/leonidas-release|tour:/);
  });
  it("strips the interim Windows blue warning and signing notice from release history", () => {
    const article = parseReleaseArticle(
      "# 0.124.35 · Development\n\n- Fixed the model picker.\n\n## If Windows shows a blue warning\nClick **More info**, then click **Run anyway**. The installer is not signed yet.\n\n## Details\n- Extra detail item.",
      "0.124.35",
    );
    expect(article.markdown).toContain("- Fixed the model picker.");
    expect(article.markdown).toContain("## Details\n- Extra detail item.");
    expect(article.markdown).not.toContain("blue warning");
    expect(article.markdown).not.toContain("The installer is not signed yet");
  });
  it("keeps old bullet-only releases readable without inventing a feature title", () => {
    const article = parseReleaseArticle("# 0.42.0 · Development\n\n- Fixed task labels.", "0.42.0");
    expect(article.title).toBe("Update 0.42.0");
    expect(article.image).toBeNull();
    expect(article.hasIntroduction).toBe(false);
    expect(article.markdown).toBe("- Fixed task labels.");
  });
  it("rejects unsafe resource URLs and bounds long release bodies", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///private.png",
      "http://localhost/a",
      "/api/private",
      "https://user:pass@example.com/a",
    ]) {
      expect(releaseArticleUrl(url)).toBe("");
    }
    expect(parseReleaseArticle("a".repeat(100_000), "0.42.0").markdown.length).toBe(60_000);
  });
});
