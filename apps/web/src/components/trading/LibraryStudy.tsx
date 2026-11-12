import type { TradingLibraryIndexResult } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { EmptyLine } from "./LibrarySections";
import { nextIndex, quizScore } from "./library.logic";

type Index = TradingLibraryIndexResult;

/** One card at a time. Flip shows the back. Next moves on and wraps at the end. */
export function FlashcardDeck({ cards }: { readonly cards: Index["cards"] }) {
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (cards.length === 0) {
    return (
      <EmptyLine>Flashcards show here. Add cards to your course pack to study them.</EmptyLine>
    );
  }
  const card = cards[position % cards.length];
  if (card === undefined) return null;
  return (
    <section aria-label="Flashcards" className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">
        Card {(position % cards.length) + 1} of {cards.length}
      </p>
      <div className="flex min-h-40 flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium" aria-live="polite">
          {flipped ? card.back : card.front}
        </p>
        {flipped && card.citation !== "" ? (
          <p className="text-xs text-muted-foreground">{card.citation}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" aria-pressed={flipped} onClick={() => setFlipped(!flipped)}>
          {flipped ? "Show the front" : "Flip"}
        </Button>
        <Button
          onClick={() => {
            setPosition(nextIndex(position % cards.length, cards.length));
            setFlipped(false);
          }}
        >
          Next card
        </Button>
      </div>
    </section>
  );
}

/** One question at a time. A pick locks the answer and shows why each option is right or wrong. */
export function QuizSection({ questions }: { readonly questions: Index["quiz"] }) {
  const [picked, setPicked] = useState<Readonly<Record<number, number>>>({});
  if (questions.length === 0) {
    return (
      <EmptyLine>Quiz questions show here. Add a quiz to your course pack to practise.</EmptyLine>
    );
  }
  const score = quizScore(questions, picked);
  return (
    <section aria-label="Quiz" className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground tabular-nums">
        Answered {score.answered} of {score.total}. Correct {score.correct}.
      </p>
      {questions.map((question, index) => {
        const choice = picked[index];
        return (
          <fieldset
            key={question.id}
            className="flex flex-col gap-2 rounded-xl border border-border p-4"
          >
            <legend className="px-1 text-sm font-medium">
              {index + 1}. {question.prompt}
            </legend>
            {question.options.map((option, optionIndex) => {
              const answered = choice !== undefined;
              const right = optionIndex === question.correct;
              return (
                <div key={`${question.id}:${option.text}`} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-pressed={choice === optionIndex}
                    disabled={answered}
                    onClick={() => setPicked({ ...picked, [index]: optionIndex })}
                    className={cn(
                      "rounded-md border border-input px-3 py-2 text-start text-sm disabled:cursor-default",
                      answered && right && "bg-success/10 font-medium",
                      answered && choice === optionIndex && !right && "border-destructive",
                    )}
                  >
                    {option.text}
                  </button>
                  {answered && choice === optionIndex ? (
                    <p className="text-xs text-muted-foreground">
                      {right ? "Right. " : "Not this one. "}
                      {option.why}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {choice === undefined ? null : (
              <p className="text-xs text-muted-foreground">
                Right answer: {question.options[question.correct]?.text}. Source: {question.source}
              </p>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
