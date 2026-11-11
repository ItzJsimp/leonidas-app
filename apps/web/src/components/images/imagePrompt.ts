export const IMAGE_KINDS = [
  {
    id: "icon",
    label: "App icon",
    rule: "Centered app icon, simple silhouette, no text.",
    models: ["qwen", "zimage"],
  },
  {
    id: "game",
    label: "Game screen",
    rule: "Wide game loading screen, detailed environment, clear focal point.",
    models: ["qwen", "hidream"],
  },
  {
    id: "logo",
    label: "Logo",
    rule: "Flat logo mark, clean silhouette, plain background.",
    models: [],
  },
  {
    id: "product",
    label: "Product photo",
    rule: "Studio product photo, soft window light, realistic materials.",
    models: ["zimage", "flux2klein"],
  },
  {
    id: "poster",
    label: "Poster",
    rule: "Poster composition, clear hierarchy, textured print finish.",
    models: ["hidream", "flux2klein"],
  },
  { id: "anything", label: "Anything", rule: "", models: ["flux2klein"] },
] as const;

/** Show the exact addition before generation and keep reuse from adding it twice. */
export function buildImagePrompt(prompt: string, rule: string, enabled: boolean): string {
  const text = prompt.trim();
  const addition = rule.trim();
  if (!text || !enabled || !addition || text.endsWith(addition)) return text;
  return `${text}\n\n${addition}`;
}
