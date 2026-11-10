import type { AnswerBlock, LessonCard } from "@t3tools/shared/answerBlocks";
import { CheckIcon, GraduationCapIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { useAnswerBlockActions } from "./AnswerBlockActions";

type LessonBlockData = Extract<AnswerBlock, { type: "lesson" }>;

const KIND_LABEL = { key: "Key idea", example: "Example", warn: "Watch out" } as const;

const CARD_KIND_CLASS = {
  key: "border-l-2 border-l-state",
  example: "",
  warn: "border-transparent border-l-2 border-l-warning bg-warning-surface",
} as const;

const CHIP_CLASS =
  "rounded-full border border-input px-2.5 py-0.5 text-xs font-medium transition-colors enabled:hover:bg-muted/40 disabled:cursor-default";

/** A lesson the user can read in the chat: tabs of cards, callouts, progress and ask buttons. */
export function LessonBlock({ block }: { block: LessonBlockData }) {
  const actions = useAnswerBlockActions();
  const [tabIndex, setTabIndex] = useState(0);
  // Ticks stay local to this view, like the checklist block.
  const [doneOverride, setDoneOverride] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const tab = block.tabs[tabIndex] ?? block.tabs[0]!;
  const keyOf = (card: LessonCard) => `${tab.label}\u0000${card.title}`;
  const isDone = (card: LessonCard) => doneOverride.get(keyOf(card)) ?? card.done;
  const tracked = tab.cards.filter((card) => card.done !== undefined);
  const doneCount = tracked.filter(isDone).length;
  const fill = (text: string) => actions?.fillComposer(text);

  return (
    <div
      className="my-2 overflow-hidden rounded-xl border border-border bg-card"
      data-answer-block="lesson"
    >
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-raised">
          <GraduationCapIcon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold leading-tight">{block.title}</div>
          {block.meta ? (
            <div className="truncate text-xs text-muted-foreground">{block.meta}</div>
          ) : null}
        </div>
      </div>
      {block.tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label={block.title}
          className="mt-3 flex gap-5 overflow-x-auto border-b border-border px-4"
        >
          {block.tabs.map((item, index) => {
            const selected = index === tabIndex;
            return (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTabIndex(index)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="rounded-full bg-surface-raised px-1.5 text-2xs text-muted-foreground tabular-nums">
                  {item.cards.length}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 border-b border-border" />
      )}
      {tracked.length > 0 ? (
        <div className="flex items-center gap-2.5 px-4 pt-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{`${doneCount} of ${tracked.length} done`}</span>
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-input">
            <span
              className="block h-full bg-state"
              style={{ width: `${(doneCount / tracked.length) * 100}%` }}
            />
          </span>
        </div>
      ) : null}
      <div role="tabpanel" className="grid gap-2.5 p-4 sm:grid-cols-2">
        {tab.cards.map((card) => {
          const done = isDone(card);
          return (
            <section
              key={card.title}
              data-kind={card.kind}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5",
                card.kind ? CARD_KIND_CLASS[card.kind] : "",
              )}
            >
              {card.kind ? (
                <div
                  className={cn(
                    "text-2xs font-semibold tracking-wide uppercase",
                    card.kind === "warn" ? "text-warning-foreground" : "text-muted-foreground",
                  )}
                >
                  {KIND_LABEL[card.kind]}
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-sm font-medium">
                {done ? (
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-state text-state-foreground">
                    <CheckIcon aria-hidden className="size-2.5" strokeWidth={3} />
                  </span>
                ) : null}
                <span className="min-w-0">{card.title}</span>
              </div>
              {card.body ? <p className="m-0 text-sm text-muted-foreground">{card.body}</p> : null}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {card.meta ? (
                  <span className="mr-auto text-xs text-muted-foreground">{card.meta}</span>
                ) : null}
                {card.actions?.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={!actions}
                    className={CHIP_CLASS}
                    onClick={() => fill(`${action}: "${card.title}"`)}
                  >
                    {action}
                  </button>
                ))}
                {card.done === undefined ? null : (
                  <button
                    type="button"
                    aria-pressed={done}
                    className={cn(CHIP_CLASS, "flex items-center gap-1")}
                    onClick={() =>
                      setDoneOverride((current) => new Map(current).set(keyOf(card), !done))
                    }
                  >
                    <CheckIcon aria-hidden className="size-3" />
                    {done ? "Done" : "Mark done"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!actions}
                  aria-label={`Ask about ${card.title}`}
                  className={CHIP_CLASS}
                  onClick={() => fill(`Tell me more about "${card.title}".`)}
                >
                  Ask
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
