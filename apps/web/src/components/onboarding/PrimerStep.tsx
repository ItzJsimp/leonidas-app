import * as Schema from "effect/Schema";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  PRIMER_CARDS,
  PRIMER_PRACTICE_MODELS,
  PRIMER_STORAGE_KEY,
} from "../../onboarding/primer.logic";
import { Button } from "../ui/button";

const StoredPrimer = Schema.NullOr(Schema.Literals(["done", "skipped"]));

/** Four short cards on models, effort and skills, with one practice model switch. */
export function PrimerStep({
  onBack,
  onContinue,
}: {
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) {
  const [, setResult] = useLocalStorage(PRIMER_STORAGE_KEY, null, StoredPrimer);
  const [index, setIndex] = useState(0);
  const card = PRIMER_CARDS[index]!;
  const last = index === PRIMER_CARDS.length - 1;
  // Siblings, not one wrapper: the wizard panel pins the last child (the buttons) to the bottom.
  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Basics {index + 1} of {PRIMER_CARDS.length}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{card.title}</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {card.body}
        </p>
      </div>
      {card.id === "switch" ? <PracticeModelMenu /> : null}
      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (index === 0 ? onBack() : setIndex(index - 1))}
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost-muted"
            onClick={() => {
              setResult("skipped");
              onContinue();
            }}
          >
            Skip basics
          </Button>
          <Button
            type="button"
            autoFocus
            onClick={() => {
              if (!last) return setIndex(index + 1);
              setResult("done");
              onContinue();
            }}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </>
  );
}

/** A copy of the real model menu, so the first switch happens with no risk. */
function PracticeModelMenu() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>(PRIMER_PRACTICE_MODELS[0]);
  const [switched, setSwitched] = useState(false);
  return (
    <div className="mt-5 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Try it now</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Click the menu and pick the other model. This is practice. Nothing changes.
      </p>
      <div className="relative mt-3 inline-block">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {model}
          <ChevronDownIcon className="size-3.5" />
        </Button>
        {open ? (
          <ul
            role="listbox"
            aria-label="Practice models"
            className="absolute z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md"
          >
            {PRIMER_PRACTICE_MODELS.map((name) => (
              <li key={name} role="option" aria-selected={name === model}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setOpen(false);
                    if (name !== model) setSwitched(true);
                    setModel(name);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {switched ? (
        <p className="mt-2 text-xs text-success-foreground" role="status">
          Good. You switched the model. In a chat it works the same way.
        </p>
      ) : null}
    </div>
  );
}
