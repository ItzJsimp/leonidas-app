import { describe, expect, it } from "vite-plus/test";

import { lineObstacles, placeLabels, type LabelInput } from "./benchmarkChartLabels";

const AREA = { left: 40, top: 10, right: 620, bottom: 280 };
const width = (text: string) => text.length * 5.9 + 6;

function box(label: { text: string; anchor: string; x: number; y: number }) {
  const w = width(label.text);
  const left =
    label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - w : label.x - w / 2;
  return [left, label.y - 11, left + w, label.y + 3] as const;
}

describe("placeLabels", () => {
  it("gives every dot a name, and no two names overlap, even in a crowd", () => {
    // Eight dots inside one 40 px square: a cluster like the top of the Intelligence chart.
    const crowd: LabelInput[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      text: `Gemini 4 Model ${i}`,
      x: 300 + (i % 4) * 10,
      y: 120 + Math.floor(i / 4) * 12,
    }));
    const placed = placeLabels(crowd, AREA);
    expect(placed).toHaveLength(crowd.length);
    const boxes = placed.map(box);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [p, q] = [boxes[a]!, boxes[b]!];
        const apart = p[2] < q[0] || q[2] < p[0] || p[3] < q[1] || q[3] < p[1];
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps every name inside the plot", () => {
    const edge: LabelInput[] = [
      { id: "left", text: "Far left model", x: 42, y: 100 },
      { id: "right", text: "Far right model", x: 618, y: 100 },
    ];
    for (const label of placeLabels(edge, AREA)) {
      const [l, t, r, b] = box(label);
      expect(l).toBeGreaterThan(AREA.left);
      expect(r).toBeLessThan(AREA.right);
      expect(t).toBeGreaterThan(AREA.top);
      expect(b).toBeLessThan(AREA.bottom);
    }
  });

  it("draws a leader line only when the name sits away from its dot", () => {
    const [near] = placeLabels([{ id: "a", text: "Alone", x: 300, y: 150 }], AREA);
    expect(near?.leader).toBeNull();
    const taken = { boxes: [[310, 136, 390, 150]] as const };
    const [far] = placeLabels([{ id: "a", text: "Alone", x: 300, y: 143 }], AREA, {
      boxes: [taken.boxes[0]],
      obstacles: lineObstacles([
        [250, 143],
        [350, 143],
      ]),
    });
    expect(far).toBeDefined();
  });
});
