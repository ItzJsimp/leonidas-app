export interface LabelInput {
  readonly id: string;
  readonly text: string;
  /** The dot, in chart coordinates. */
  readonly x: number;
  readonly y: number;
}

export interface PlacedLabel {
  readonly id: string;
  readonly text: string;
  readonly anchor: "start" | "middle" | "end";
  /** Text anchor point; `y` is the baseline. */
  readonly x: number;
  readonly y: number;
  /** A thin line from the dot to the name, only when the name sits away from the dot. */
  readonly leader: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  } | null;
}

export interface LabelArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const CHAR_WIDTH = 5.9;
const HEIGHT = 14;
/** Directions to try, nearest to the dot first, in degrees. */
const ANGLES = [
  0, -28, 28, 180, 152, -152, -55, 55, -90, 90, -125, 125, -15, 15, 165, -165, -40, 40, -70, 70,
  -105, 105, -140, 140, -20, 20,
];
const DISTANCES = [12, 28, 48, 70, 96, 124, 152];

type Box = readonly [number, number, number, number];
type Pt = readonly [number, number];

const segmentPoints = (x0: number, y0: number, x1: number, y1: number, step: number): Pt[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
  return Array.from({ length: n + 1 }, (_, j): Pt => [
    x0 + ((x1 - x0) * j) / n,
    y0 + ((y1 - y0) * j) / n,
  ]);
};

/** Points along a line the names must stay clear of, such as the Pareto line. */
export const lineObstacles = (points: ReadonlyArray<Pt>): Pt[] =>
  points.slice(1).flatMap((point, i) => {
    const from = points[i]!;
    return segmentPoints(from[0], from[1], point[0], point[1], 6);
  });

/**
 * Puts one name next to each dot. A name moves away from its dot, in steps, until it clears every other
 * name, dot and line, and a thin line joins the two. Labels come out in the order given, so the caller
 * sorts the most important first. Three passes: strict, then ignoring dots and lines, then only the
 * plot edge. A name is never dropped while the plot has room.
 *
 * `boxes` and `obstacles` hold what is already drawn (effort tags, dots, the Pareto line).
 */
export function placeLabels(
  labels: ReadonlyArray<LabelInput>,
  area: LabelArea,
  taken: { readonly boxes?: ReadonlyArray<Box>; readonly obstacles?: ReadonlyArray<Pt> } = {},
): ReadonlyArray<PlacedLabel> {
  const boxes: Box[] = [...(taken.boxes ?? [])];
  const obstacles: Pt[] = [...(taken.obstacles ?? [])];
  const placed: PlacedLabel[] = [];
  for (const label of labels) {
    const width = label.text.length * CHAR_WIDTH + 6;
    const result = place(label, width, area, boxes, obstacles);
    if (!result) continue;
    boxes.push(result.box);
    obstacles.push(...result.segment);
    placed.push(result.label);
  }
  return placed;
}

function place(
  label: LabelInput,
  width: number,
  area: LabelArea,
  boxes: ReadonlyArray<Box>,
  obstacles: ReadonlyArray<Pt>,
): { label: PlacedLabel; box: Box; segment: Pt[] } | null {
  for (let pass = 0; pass < 3; pass++) {
    for (const distance of DISTANCES) {
      for (const degrees of ANGLES) {
        const theta = (degrees * Math.PI) / 180;
        const cx = Math.cos(theta);
        const sn = Math.sin(theta);
        const ax = label.x + cx * distance;
        const ay = label.y + sn * distance;
        const anchor = cx > 0.3 ? "start" : cx < -0.3 ? "end" : "middle";
        const bx = anchor === "start" ? ax + 2 : anchor === "end" ? ax - width - 2 : ax - width / 2;
        const by = Math.abs(cx) <= 0.3 ? (sn < 0 ? ay - HEIGHT : ay) : ay - 7;
        const box: Box = [bx, by, bx + width, by + HEIGHT];
        const lx = anchor === "start" ? bx - 1 : anchor === "end" ? bx + width + 1 : ax;
        const ly = anchor === "middle" ? (sn < 0 ? by + HEIGHT : by) : by + 7;
        const sx = label.x + cx * 7;
        const sy = label.y + sn * 7;
        const segment = distance >= 28 ? segmentPoints(sx, sy, lx, ly, 4) : [];
        const inside =
          bx > area.left + 2 &&
          bx + width < area.right - 4 &&
          by > area.top &&
          by + HEIGHT < area.bottom;
        if (!inside) continue;
        if (
          pass < 2 &&
          !boxes.every(
            (q) => box[2] < q[0] - 2 || box[0] > q[2] + 2 || box[3] < q[1] - 1 || box[1] > q[3] + 1,
          )
        ) {
          continue;
        }
        if (
          pass === 0 &&
          !(
            obstacles.every(
              (c) =>
                !(c[0] > box[0] - 6 && c[0] < box[2] + 6 && c[1] > box[1] - 6 && c[1] < box[3] + 6),
            ) &&
            segment.every((c) =>
              boxes.every(
                (q) => !(c[0] > q[0] - 2 && c[0] < q[2] + 2 && c[1] > q[1] - 1 && c[1] < q[3] + 1),
              ),
            )
          )
        ) {
          continue;
        }
        return {
          box,
          segment,
          label: {
            id: label.id,
            text: label.text,
            anchor,
            x: anchor === "start" ? bx : anchor === "end" ? bx + width : ax,
            y: by + 11,
            leader: distance >= 28 ? { x1: sx, y1: sy, x2: lx, y2: ly } : null,
          },
        };
      }
    }
  }
  return null;
}
