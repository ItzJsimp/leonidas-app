import { lineObstacles, placeLabels } from "../../lib/benchmarkChartLabels";
import {
  EFFORT_SHORT,
  creatorColor,
  formatMetricValue,
  paretoFront,
  pointsFor,
  valueAt,
  type EffortMode,
  type EffortPoint,
  type WindowMetric,
  type WindowModel,
  type WindowSource,
} from "../../lib/benchmarkWindow";

const W = 720;
const H = 400;
const ML = 44;
const MR = 16;
const MT = 14;
const MB = 44;

interface Dot {
  readonly model: WindowModel;
  readonly point: EffortPoint;
  readonly vx: number;
  readonly vy: number;
  readonly x: number;
  readonly y: number;
}

/** 1, 2 and 5 at each power of ten between the bounds. */
function logTicks(low: number, high: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(Math.log10(low)); 10 ** k <= high; k++) {
    for (const f of [1, 2, 5]) {
      const v = f * 10 ** k;
      if (v >= low && v <= high) out.push(v);
    }
  }
  return out;
}

const halo = {
  paintOrder: "stroke",
  stroke: "var(--color-popover)",
  strokeWidth: 3,
  strokeLinejoin: "round",
} as const;

/**
 * Score against cost, price or speed, one dot per model, coloured by maker. The green quadrant is the
 * cheap and strong corner, and the dotted Pareto line joins the models nothing beats on both. Names sit
 * away from the dots on thin lines so they never overlap. The Table view holds the same numbers for
 * keyboard and screen reader use.
 */
export function BenchmarksChart(props: {
  source: WindowSource;
  models: ReadonlyArray<WindowModel>;
  mode: EffortMode;
  score: WindowMetric;
  compare: WindowMetric;
  runnable: (model: WindowModel) => boolean;
  selected: WindowModel | null;
  selectedEffort: string;
  onSelect: (key: string, effort: string) => void;
}) {
  const { score, compare, mode, selected } = props;
  const log = compare.format !== "tps";

  const measured = props.models.flatMap((model) => {
    const points =
      mode === "all" || model.key === selected?.key
        ? model.points
        : pointsFor(model, mode, score.key);
    return points.flatMap((point) => {
      const vx = valueAt(point, compare.key);
      const vy = valueAt(point, score.key);
      return vx === undefined || vy === undefined ? [] : [{ model, point, vx, vy }];
    });
  });
  if (measured.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        No model has both {score.label} and {compare.label} in this source.
      </p>
    );
  }

  const xs = measured.map((d) => d.vx);
  const ys = measured.map((d) => d.vy);
  const lowX = Math.min(...xs);
  const highX = Math.max(...xs);
  const x0 = log ? lowX / 1.4 : Math.floor((lowX - 12) / 20) * 20;
  const x1 = log ? highX * 1.6 : Math.ceil((highX + 12) / 20) * 20;
  const y0 =
    props.source === "artificialAnalysis" ? 0 : Math.floor((Math.min(...ys) - 4) / 10) * 10;
  const y1 = Math.ceil((Math.max(...ys) + 2) / 10) * 10;
  const X = (v: number) =>
    ML +
    (log ? (Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0)) : (v - x0) / (x1 - x0)) *
      (W - ML - MR);
  const Y = (v: number) => MT + (1 - (v - y0) / (y1 - y0)) * (H - MT - MB);
  const dots: Dot[] = measured.map((d) => ({ ...d, x: X(d.vx), y: Y(d.vy) }));

  const xLabel = (v: number) =>
    compare.format === "tps" ? String(v) : v < 1 ? `$${v.toFixed(2)}` : `$${v}`;
  const xTicks = log
    ? logTicks(x0, x1)
    : Array.from({ length: Math.floor((x1 - x0) / 20) + 1 }, (_, i) => x0 + i * 20);
  const yTicks = Array.from({ length: Math.round((y1 - y0) / 10) + 1 }, (_, i) => y0 + i * 10);

  const front = paretoFront(dots, compare.higherIsBetter);
  const frontXY = front.map((d): [number, number] => [d.x, d.y]);
  const selectedDots = dots
    .filter((d) => d.model.key === selected?.key)
    .toSorted((a, b) => a.x - b.x);
  const selectedXY = selectedDots.map((d): [number, number] => [d.x, d.y]);

  const tagBoxes = selectedDots.map((d) => [d.x - 16, d.y - 24, d.x + 16, d.y - 9] as const);
  const top = new Map<string, Dot>();
  for (const dot of dots) {
    const best = top.get(dot.model.key);
    if (!best || dot.vy > best.vy) top.set(dot.model.key, dot);
  }
  const names = placeLabels(
    [...top.values()]
      .toSorted(
        (a, b) =>
          Number(b.model.key === selected?.key) - Number(a.model.key === selected?.key) ||
          Number(props.runnable(b.model)) - Number(props.runnable(a.model)) ||
          b.vy - a.vy,
      )
      .map((d) => ({ id: d.model.key, text: d.model.name, x: d.x, y: d.y })),
    { left: ML, top: MT, right: W - MR, bottom: H - MB },
    {
      boxes: tagBoxes,
      obstacles: [
        ...dots.map((d): [number, number] => [d.x, d.y]),
        ...lineObstacles(frontXY),
        ...lineObstacles(selectedXY),
      ],
    },
  );

  const qx = ML + (W - ML - MR) / 2;
  const qy = MT + (H - MT - MB) / 2;
  const modelOf = new Map(props.models.map((m) => [m.key, m]));

  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {compare.higherIsBetter ? null : (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-chart-good bg-chart-good/25" />
            Most attractive quadrant
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dotted border-foreground/70" />
          Pareto line
        </li>
        {(
          [
            ["Anthropic", "var(--color-chart-anthropic)"],
            ["OpenAI", "var(--color-chart-openai)"],
            ["Google", "var(--color-chart-google)"],
          ] as const
        ).map(([name, color]) => (
          <li key={name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color }} />
            {name}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground ring-2 ring-foreground/80" />
          You can run it
        </li>
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`${score.label} against ${compare.label}. The Table view lists the same numbers.`}
        className="h-auto w-full text-muted-foreground"
      >
        {compare.higherIsBetter ? null : (
          <>
            <rect
              x={ML}
              y={MT}
              width={qx - ML}
              height={qy - MT}
              style={{ fill: "var(--color-chart-good)", opacity: 0.24 }}
            />
            <rect
              x={qx}
              y={qy}
              width={W - MR - qx}
              height={H - MB - qy}
              style={{ fill: "var(--color-muted-foreground)", opacity: 0.1 }}
            />
          </>
        )}
        <g stroke="var(--color-border)" fill="none">
          <line x1={ML} x2={ML} y1={MT} y2={H - MB} />
          <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} />
          {yTicks.map((v) => (
            <line key={`y${v}`} x1={ML - 4} x2={ML} y1={Y(v)} y2={Y(v)} />
          ))}
          {xTicks.map((v) => (
            <line key={`x${v}`} x1={X(v)} x2={X(v)} y1={H - MB} y2={H - MB + 4} />
          ))}
        </g>
        <g fill="currentColor" fontSize={11}>
          {yTicks.map((v) => (
            <text key={`yt${v}`} x={ML - 8} y={Y(v) + 3.5} textAnchor="end">
              {v}
            </text>
          ))}
          {xTicks.map((v) => (
            <text key={`xt${v}`} x={X(v)} y={H - MB + 17} textAnchor="middle">
              {xLabel(v)}
            </text>
          ))}
          <text x={ML + (W - ML - MR) / 2} y={H - 8} textAnchor="middle" fontSize={12}>
            {compare.label}
            {log ? " (log scale)" : ""}
          </text>
          <text
            transform={`translate(14 ${MT + (H - MT - MB) / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={12}
          >
            {score.label}
          </text>
        </g>
        <polyline
          points={frontXY.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="var(--color-foreground)"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeDasharray="1.5 4"
          strokeLinecap="round"
        />
        {selectedXY.length > 1 ? (
          <polyline
            points={selectedXY.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="var(--color-state)"
            strokeWidth={2}
          />
        ) : null}
        {names.map((label) =>
          label.leader ? (
            <line
              key={`l${label.id}`}
              x1={label.leader.x1}
              y1={label.leader.y1}
              x2={label.leader.x2}
              y2={label.leader.y2}
              stroke="var(--color-muted-foreground)"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          ) : null,
        )}
        {dots.map((dot) => {
          const isSelectedModel = dot.model.key === selected?.key;
          const current = isSelectedModel && dot.point.effort === props.selectedEffort;
          const isTop = top.get(dot.model.key) === dot;
          const label = `${dot.model.name}, ${EFFORT_SHORT[dot.point.effort] ?? dot.point.effort}: ${formatMetricValue(score, dot.vy)} ${score.label}, ${formatMetricValue(compare, dot.vx)} ${compare.label}`;
          return (
            <g
              key={dot.point.entry.sourceModelKey}
              role="button"
              tabIndex={0}
              aria-label={label}
              className="cursor-pointer outline-none focus-visible:[&>circle:last-child]:stroke-ring"
              onClick={() => props.onSelect(dot.model.key, dot.point.effort)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onSelect(dot.model.key, dot.point.effort);
                }
              }}
            >
              <title>{label}</title>
              <circle cx={dot.x} cy={dot.y} r={10} fill="transparent" />
              <circle
                cx={dot.x}
                cy={dot.y}
                r={current ? 6.5 : isSelectedModel ? 5 : isTop ? 4.5 : 3.2}
                fill={creatorColor(dot.model.creator)}
                stroke={props.runnable(dot.model) ? "var(--color-foreground)" : "none"}
                strokeWidth={2}
              />
            </g>
          );
        })}
        {selectedDots.map((dot) => (
          <text
            key={`t${dot.point.effort}`}
            x={dot.x}
            y={dot.y - 11}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={500}
            style={{ ...halo, fill: "var(--color-state-text)" }}
          >
            {EFFORT_SHORT[dot.point.effort] ?? dot.point.effort}
          </text>
        ))}
        {names.map((label) => {
          const model = modelOf.get(label.id);
          const isSelected = label.id === selected?.key;
          const runnable = model ? props.runnable(model) : false;
          return (
            <text
              key={`n${label.id}`}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              fontSize={11}
              fontWeight={isSelected ? 600 : 400}
              aria-hidden="true"
              style={{
                ...halo,
                fill: isSelected
                  ? "var(--color-state-text)"
                  : runnable
                    ? "var(--color-foreground)"
                    : "var(--color-muted-foreground)",
              }}
            >
              {label.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
