import {
  parseAnswerBlock,
  type AnswerBlock,
  type AnswerBlockType,
  type Cell,
} from "@t3tools/shared/answerBlocks";
import { memo, useMemo, useState, type ReactNode } from "react";

import { useAnswerBlockActions } from "./AnswerBlockActions";
import { ChartBlock } from "./ChartBlock";
import { LessonBlock } from "./LessonBlock";

interface AnswerBlockViewProps {
  type: AnswerBlockType;
  code: string;
  /** False while the fence still streams. */
  closed: boolean;
  /** Shown when the block JSON is bad: the plain code fence. */
  fallback: ReactNode;
}

export const AnswerBlockView = memo(function AnswerBlockView({
  type,
  code,
  closed,
  fallback,
}: AnswerBlockViewProps) {
  const result = useMemo(() => parseAnswerBlock(type, code, closed), [type, code, closed]);
  if (result.status === "pending") {
    return (
      <div
        className="my-2 h-16 animate-pulse rounded-lg border border-border/60 bg-muted/30"
        aria-label="Loading block"
      />
    );
  }
  if (result.status === "fallback") return <>{fallback}</>;
  return <BlockBody block={result.block} />;
});

function BlockBody({ block }: { block: AnswerBlock }) {
  switch (block.type) {
    case "table":
      return <TableBlock block={block} />;
    case "choices":
      return <ChoicesBlock block={block} />;
    case "checklist":
      return <ChecklistBlock block={block} />;
    case "chart":
      return <ChartBlock block={block} />;
    case "lesson":
      return <LessonBlock block={block} />;
  }
}

function compareCells(a: Cell | undefined, b: Cell | undefined): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
}

function TableBlock({ block }: { block: Extract<AnswerBlock, { type: "table" }> }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return block.rows;
    return block.rows.toSorted((a, b) => compareCells(a[sort.col], b[sort.col]) * sort.dir);
  }, [block.rows, sort]);

  return (
    <div className="my-2 flex flex-col gap-2" data-answer-block="table">
      {block.kpis && block.kpis.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
          {block.kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {block.cols.map((col, index) => {
                const active = sort?.col === index;
                return (
                  <th
                    key={col}
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                    className="border-b border-border/60 p-0 text-left font-medium"
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() =>
                        setSort(
                          active && sort.dir === 1
                            ? { col: index, dir: -1 }
                            : { col: index, dir: 1 },
                        )
                      }
                    >
                      {col}
                      {active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              // Rows carry no id; the index is stable for one render of a sorted copy.
              // oxlint-disable-next-line react/no-array-index-key
              <tr key={rowIndex} className="border-b border-border/40 last:border-b-0">
                {block.cols.map((col, colIndex) => (
                  <td key={col} className="px-3 py-2">
                    {row[colIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChoicesBlock({ block }: { block: Extract<AnswerBlock, { type: "choices" }> }) {
  const actions = useAnswerBlockActions();
  const [picked, setPicked] = useState<string | null>(null);

  // A pick only fills the composer. The user can edit the text and must send it by hand.
  const choose = (label: string) => {
    if (!actions) return;
    setPicked(label);
    actions.fillComposer(label);
  };

  return (
    <div className="my-2 flex flex-col gap-2" data-answer-block="choices">
      {block.q ? <div className="text-sm font-medium">{block.q}</div> : null}
      <div className="text-xs text-muted-foreground">Pick one to add it to your message.</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.options.map((option) => {
          const isPicked = picked === option.label;
          return (
            <button
              key={option.label}
              type="button"
              disabled={!actions}
              aria-pressed={isPicked}
              onClick={() => choose(option.label)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted/40 disabled:cursor-default ${
                isPicked ? "border-primary bg-primary/10" : "border-border/60"
              }`}
            >
              <div className="font-medium">{option.label}</div>
              {option.note ? (
                <div className="mt-0.5 text-xs text-muted-foreground">{option.note}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistBlock({ block }: { block: Extract<AnswerBlock, { type: "checklist" }> }) {
  // v1 keeps ticks local to this view (spec decision A); they do not write task cards.
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = (index: number) =>
    setDone((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <div
      className="my-2 rounded-lg border border-border/60 px-3 py-2"
      data-answer-block="checklist"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{block.title ?? "Checklist"}</span>
        <span className="text-xs text-muted-foreground">
          {done.size}/{block.items.length}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {block.items.map((item, index) => (
          // Items carry no id and never reorder, so the index is a stable key.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={done.has(index)}
                onChange={() => toggle(index)}
              />
              <span className={done.has(index) ? "text-muted-foreground line-through" : ""}>
                {item}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
