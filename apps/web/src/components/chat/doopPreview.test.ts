import { describe, expect, it } from "vite-plus/test";
import { readDoopPreview } from "./doopPreview";

const frame = {
  id: "frame-1",
  name: "Meetings",
  width: 390,
  height: 844,
  image_url: "https://doop.design/i/frame-1.png?scale=1&v=123",
  empty: false,
};
const data = (frames = [frame]) => ({ canvas: { id: "canvas-1", name: "Leonidas app" }, frames });

describe("readDoopPreview", () => {
  it("keeps portrait metadata and links each preview to its canvas", () => {
    const preview = readDoopPreview(data());
    expect(preview?.frames[0]).toMatchObject({ width: 390, height: 844 });
    expect(preview?.frames[0]?.url).toBe("https://doop.design/c/canvas-1?frame=frame-1");
  });
  it("limits image requests to three and keeps the total frame count", () => {
    const preview = readDoopPreview(data(Array.from({ length: 50 }, () => frame)));
    expect(preview?.frames).toHaveLength(3);
    expect(preview?.frameCount).toBe(50);
  });
  it.each([
    "https://attacker.test/i/frame-1.png",
    "https://doop.design.attacker.test/i/frame-1.png",
    "javascript:alert(1)",
    "https://doop.design/i/other.png",
  ])("rejects unsafe images: %s", (image_url) => {
    expect(readDoopPreview(data([{ ...frame, image_url }]))?.frames[0]?.imageUrl).toBeNull();
  });
  it("rejects malformed canvas data and permits an empty canvas", () => {
    expect(readDoopPreview({ canvas: { id: "../auth" }, frames: [] })).toBeNull();
    expect(readDoopPreview(null)).toBeNull();
    expect(readDoopPreview(data([]))?.frames).toEqual([]);
  });
});
