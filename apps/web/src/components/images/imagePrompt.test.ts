import { expect, it } from "vite-plus/test";
import { buildImagePrompt } from "./imagePrompt";

it("adds only the enabled prompt rule and does not duplicate a reused rule", () => {
  expect(buildImagePrompt("  a bottle ", "soft light", false)).toBe("a bottle");
  expect(buildImagePrompt("  a bottle ", "soft light", true)).toBe("a bottle\n\nsoft light");
  expect(buildImagePrompt("a bottle\n\nsoft light", "soft light", true)).toBe(
    "a bottle\n\nsoft light",
  );
  expect(buildImagePrompt(" ", "soft light", true)).toBe("");
});
