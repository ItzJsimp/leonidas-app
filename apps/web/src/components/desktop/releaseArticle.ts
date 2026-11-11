const MAX_ARTICLE_LENGTH = 60_000;

/** Release images and links use public HTTPS URLs, never local app or file URLs. */
export function releaseArticleUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

/** Keep the publisher's article intact, while hiding build metadata, old tour markers, and interim installer signing notices. */
export function parseReleaseArticle(body: string, version: string) {
  const markdown = body
    .slice(0, MAX_ARTICLE_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s*\{tour:[^}]+\}/g, "")
    .replace(/\n*## If Windows shows a blue warning[\s\S]*?(?=\n## |$)/g, "")
    .trim();
  const heading = /^#\s+(.+)$/m.exec(markdown);
  const title =
    heading && !/^v?\d+\.\d+\.\d+(?:\s|$)/.test(heading[1]!)
      ? heading[1]!.trim()
      : `Update ${version}`;
  const content = markdown.replace(/^#\s+.+\r?\n?/m, "").trim();
  const intro = content
    .split(/\n\s*\n/)
    .find((paragraph) => paragraph && !/^(?:#|[-*]\s|!\[|<)/.test(paragraph));
  const firstNote = /^\s*[-*]\s+(.+)$/m.exec(content)?.[1];
  const image = /!\[([^\]]*)\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/.exec(content);
  return {
    title,
    hasIntroduction: intro !== undefined,
    summary:
      (intro ?? firstNote)?.replace(/\s+/g, " ").slice(0, 240) ??
      "No notes were published for this update.",
    image: image ? { src: releaseArticleUrl(image[2]!), alt: image[1]! } : null,
    markdown: content,
  };
}
