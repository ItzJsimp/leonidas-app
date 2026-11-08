import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeDictionary, ScribeSuggestionList } from "@t3tools/contracts";
import { CheckIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import {
  scribeDictionaryQuery,
  scribePutDictionary,
  scribeRejectSuggestion,
  scribeSuggestionsQuery,
} from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import {
  HINT_CHARS,
  acceptSuggestion,
  addReplacement,
  addVocabulary,
  dictionaryErrorMessage,
  filterVocabulary,
  groupFixes,
  hintUsage,
  removeSpellings,
  removeWords,
  restoreSpellings,
  restoreWords,
  suggestionWhy,
  type DictionaryEdit,
} from "./dictionary.logic";
import { commandErrorReason } from "./home.logic";
import { IconButton } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import { Meter } from "./StatsParts";
import { formatCount, percentOf } from "./stats.logic";
import { WordSyncRow } from "./WordSyncRow";
import { EmptyLine, FixesPane, SelectionBar, plural, toggled } from "./DictionaryList";
import { SuggestionExample } from "./SuggestionExample";

type Pane = "fixes" | "words" | "suggestions";
type Replacement = ScribeDictionary["replacements"][number];

export function ScribeDictionaryTab({ environmentId, live }: ScribeTabProps) {
  const dictionaryQuery = useEnvironmentQuery(scribeDictionaryQuery({ environmentId, input: {} }));
  const suggestionsQuery = useEnvironmentQuery(
    scribeSuggestionsQuery({ environmentId, input: {} }),
  );
  const runPut = useAtomCommand(scribePutDictionary, { reportFailure: false });
  const runReject = useAtomCommand(scribeRejectSuggestion, { reportFailure: false });
  const [pane, setPane] = useState<Pane>("fixes");
  const [saved, setSaved] = useState<ScribeDictionary | null>(null);
  const [busy, setBusy] = useState(false);
  const dictionary = saved ?? dictionaryQuery.data;
  const suggestions = suggestionsQuery.data?.items ?? [];

  // A failed read tries again once when the engine comes back.
  const previousConnected = useRef(live.connected);
  const { refresh: refreshDictionary, error: dictionaryError } = dictionaryQuery;
  const { refresh: refreshSuggestions } = suggestionsQuery;
  useEffect(() => {
    if (dictionaryError !== null && live.connected === true && previousConnected.current !== true) {
      refreshDictionary();
      refreshSuggestions();
    }
    previousConnected.current = live.connected;
  }, [live.connected, dictionaryError, refreshDictionary, refreshSuggestions]);

  /** Saves the whole list. Returns true when the engine accepted it. */
  const save = async (next: ScribeDictionary): Promise<boolean> => {
    setBusy(true);
    const result = await runPut({ environmentId, input: next });
    setBusy(false);
    if (result._tag === "Success") {
      setSaved(result.value);
      refreshSuggestions();
      return true;
    }
    if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: dictionaryErrorMessage(commandErrorReason(squashAtomCommandFailure(result))),
      });
    }
    return false;
  };

  /** Applies an edit the logic validated, then saves it. Returns true when saved. */
  const apply = async (edit: DictionaryEdit): Promise<boolean> => {
    if (!edit.ok) {
      toastManager.add({ type: "warning", title: edit.message });
      return false;
    }
    return save(edit.dictionary);
  };

  // Undo re-adds to the list as it is now, so edits made after the removal are kept.
  const latest = useRef<ScribeDictionary | null>(null);
  useEffect(() => {
    latest.current = dictionary;
  });
  const undoable = async (
    next: ScribeDictionary,
    title: string,
    back: (current: ScribeDictionary) => ScribeDictionary,
  ) => {
    if (!(await save(next))) return false;
    toastManager.add({
      type: "info",
      title,
      timeout: 6000,
      actionProps: {
        children: "Undo",
        onClick: () => {
          if (latest.current !== null) void save(back(latest.current));
        },
      },
    });
    return true;
  };

  const rejectSuggestion = async (wrong: string) => {
    setBusy(true);
    const result = await runReject({ environmentId, input: { wrong } });
    setBusy(false);
    if (result._tag === "Success") {
      refreshSuggestions();
    } else if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: dictionaryErrorMessage(commandErrorReason(squashAtomCommandFailure(result))),
      });
    }
  };

  if (dictionary === null) {
    if (dictionaryQuery.error !== null) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm" role="alert">
          <p>
            {live.connected === false
              ? "Scribe engine is not running. Start it from the tray, or install it."
              : "Could not load your word list."}
          </p>
          <Button size="sm" variant="outline" onClick={dictionaryQuery.refresh}>
            Try again
          </Button>
        </div>
      );
    }
    return <DictionarySkeleton />;
  }

  const removeRules = (rules: readonly Replacement[]) =>
    undoable(
      removeSpellings(
        dictionary,
        rules.map((rule) => rule.wrong),
      ),
      rules.length === 1
        ? `Word fix removed: “${rules[0]!.wrong}” to “${rules[0]!.correct}”`
        : `Removed ${plural(rules.length, "spelling", "spellings")}`,
      (current) => restoreSpellings(current, rules),
    );

  return (
    <div className="flex flex-col gap-5">
      <SectionTiles
        pane={pane}
        onPane={setPane}
        dictionary={dictionary}
        suggestions={suggestionsQuery.data === null ? null : suggestions.length}
      />
      {pane === "fixes" ? (
        <FixesPane
          dictionary={dictionary}
          busy={busy}
          onAdd={(wrong, correct) => apply(addReplacement(dictionary, wrong, correct))}
          onRemove={removeRules}
        />
      ) : null}
      {pane === "words" ? (
        <WordsPane
          dictionary={dictionary}
          busy={busy}
          onAdd={(word) => apply(addVocabulary(dictionary, word))}
          onRemove={(words) =>
            undoable(
              removeWords(dictionary, words),
              words.length === 1
                ? `Removed “${words[0]}”`
                : `Removed ${plural(words.length, "word", "words")}`,
              (current) => restoreWords(current, words),
            )
          }
        />
      ) : null}
      {pane === "suggestions" ? (
        <SuggestionsPane
          items={suggestions}
          loading={suggestionsQuery.data === null && suggestionsQuery.error === null}
          failed={suggestionsQuery.error !== null && suggestionsQuery.data === null}
          busy={busy}
          onRefresh={suggestionsQuery.refresh}
          onAccept={async (item) => {
            if (await apply(acceptSuggestion(dictionary, item))) {
              toastManager.add({
                type: "success",
                title: `Word fix added: “${item.wrong}” to “${item.correct}”`,
              });
            }
          }}
          onReject={(item) => void rejectSuggestion(item.wrong)}
        />
      ) : null}
      <WordSyncRow environmentId={environmentId} />
    </div>
  );
}

/** Three cards that switch the section and say what each count means. */
function SectionTiles(props: {
  readonly pane: Pane;
  readonly onPane: (pane: Pane) => void;
  readonly dictionary: ScribeDictionary;
  readonly suggestions: number | null;
}) {
  const words = groupFixes(props.dictionary.replacements).length;
  const spellings = props.dictionary.replacements.length;
  const vocabulary = props.dictionary.vocabulary.length;
  const hint = hintUsage(props.dictionary.vocabulary);
  return (
    <div role="group" aria-label="Word list sections" className="grid gap-3 sm:grid-cols-3">
      <Tile
        pressed={props.pane === "fixes"}
        onPress={() => props.onPane("fixes")}
        label="Word fixes"
        value={plural(words, "word", "words")}
      >
        {words === 0
          ? "Add a word Scribe gets wrong. Scribe then fixes it every time, after it hears you."
          : `Scribe fixes ${plural(spellings, "misheard spelling", "misheard spellings")} of ${words === 1 ? "it" : "them"}, after it hears you.`}
      </Tile>
      <Tile
        pressed={props.pane === "words"}
        onPress={() => props.onPane("words")}
        label="Words to know"
        value={plural(vocabulary, "word", "words")}
        meter={percentOf(hint.used, HINT_CHARS)}
      >
        {hint.skipped > 0
          ? `The hint is full: Scribe skips your last ${plural(hint.skipped, "word", "words")}.`
          : `Hints the speech model reads first: ${formatCount(hint.used)} of ${formatCount(HINT_CHARS)} characters.`}
      </Tile>
      <Tile
        pressed={props.pane === "suggestions"}
        onPress={() => props.onPane("suggestions")}
        label="Suggestions"
        value={
          props.suggestions === null
            ? "Checking"
            : props.suggestions === 0
              ? "None"
              : `${formatCount(props.suggestions)} to review`
        }
      >
        Spellings the clean up changed the same way 2 or more times.
      </Tile>
    </div>
  );
}

function Tile(props: {
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly label: string;
  readonly value: string;
  readonly meter?: number;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onPress}
      className={cn(
        "flex flex-col items-start rounded-lg border bg-card px-4 py-3 text-left outline-none transition-[background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.pressed
          ? "border-state bg-state/8 ring-1 ring-state"
          : "border-border hover:bg-accent/40",
      )}
    >
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
        {props.value}
      </span>
      {props.meter === undefined ? null : (
        <span className="mt-2 mb-1 w-full">
          <Meter percent={props.meter} />
        </span>
      )}
      <span className="mt-1 text-xs text-pretty text-muted-foreground">{props.children}</span>
    </button>
  );
}

function WordsPane(props: {
  readonly dictionary: ScribeDictionary;
  readonly busy: boolean;
  readonly onAdd: (word: string) => Promise<boolean>;
  readonly onRemove: (words: readonly string[]) => Promise<boolean>;
}) {
  const [word, setWord] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () => filterVocabulary(props.dictionary.vocabulary, query),
    [props.dictionary.vocabulary, query],
  );
  const picked = props.dictionary.vocabulary.filter((item) => selected.has(item));
  const submit = async () => {
    if (props.busy) return;
    if (await props.onAdd(word)) setWord("");
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="min-w-48 flex-1">
          <Input
            aria-label="New word"
            placeholder="A name or special word that Scribe often gets wrong"
            value={word}
            onChange={(event) => setWord(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={props.busy}>
          <PlusIcon aria-hidden />
          Add word
        </Button>
      </form>
      <p className="text-xs text-pretty text-muted-foreground">
        Scribe sends these words to the speech model as a hint, so it hears them right. Names and
        rare terms help most. Common words such as “prompt” only use up space.
      </p>
      {props.dictionary.vocabulary.length === 0 ? (
        <EmptyLine
          title="No words yet"
          body="Add names and special terms so Scribe hears them right."
        />
      ) : (
        <>
          <Input
            type="search"
            aria-label="Search words"
            placeholder="Search words"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <SelectionBar
              total={rows.length}
              selected={picked.length}
              what={picked.length === 1 ? "1 word" : `${formatCount(picked.length)} words`}
              deleteLabel={`Delete ${plural(picked.length, "word", "words")}`}
              busy={props.busy}
              onAll={(on) => setSelected(on ? new Set(rows) : new Set())}
              onDelete={async () => {
                if (await props.onRemove(picked)) setSelected(new Set());
              }}
              onClear={() => setSelected(new Set())}
            >
              <span className="text-xs text-muted-foreground">
                {plural(props.dictionary.vocabulary.length, "word", "words")}, in the order Scribe
                reads them
              </span>
            </SelectionBar>
            {rows.length === 0 ? (
              <p className="border-t border-border px-3.5 py-3 text-sm text-muted-foreground">
                No word matches “{query.trim()}”.
              </p>
            ) : (
              <ul className="grid border-t border-border sm:grid-cols-2">
                {rows.map((item) => (
                  <li
                    key={item}
                    className={cn(
                      "flex items-center gap-3 border-b border-border px-3.5 py-1.5",
                      selected.has(item) && "bg-state/8",
                    )}
                  >
                    <Checkbox
                      aria-label={`Select ${item}`}
                      checked={selected.has(item)}
                      onCheckedChange={() => setSelected((current) => toggled(current, item))}
                    />
                    <span className="min-w-0 flex-1 text-sm wrap-anywhere">{item}</span>
                    <IconButton
                      label={`Delete ${item}`}
                      disabled={props.busy}
                      onClick={() => void props.onRemove([item])}
                    >
                      <Trash2Icon aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SuggestionsPane(props: {
  readonly items: ScribeSuggestionList["items"];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onAccept: (item: ScribeSuggestionList["items"][number]) => Promise<void>;
  readonly onReject: (item: { wrong: string }) => void;
}) {
  if (props.loading) return <DictionarySkeleton />;
  if (props.failed) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm" role="alert">
        <p>Could not load suggestions.</p>
        <Button size="sm" variant="outline" onClick={props.onRefresh}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-48 flex-1 text-sm text-pretty text-muted-foreground">
          After Scribe writes your words, its clean up sometimes changes the same spelling the same
          way. Accept one to make it a word fix. Reject it to never see it again.
        </p>
        <Button variant="outline" size="sm" onClick={props.onRefresh}>
          Check again
        </Button>
      </div>
      {props.items.length === 0 ? (
        <EmptyLine
          title="No suggestions yet"
          body="Scribe adds a suggestion here when its clean up fixes the same words in 2 or more dictations."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {props.items.map((item) => (
            <li key={item.wrong} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">“{item.wrong}”</span>
                  <span aria-hidden> → </span>
                  <span className="sr-only"> becomes </span>
                  <span className="font-medium">“{item.correct}”</span>
                </p>
                {item.example ? <SuggestionExample example={item.example} /> : null}
                <p
                  className={cn(
                    "text-xs text-muted-foreground",
                    item.example ? "mt-1.5" : "mt-0.5",
                  )}
                >
                  {suggestionWhy(item.count)}
                </p>
              </div>
              <IconButton
                label={`Accept: always change “${item.wrong}” to “${item.correct}”`}
                disabled={props.busy}
                onClick={() => void props.onAccept(item)}
              >
                <CheckIcon aria-hidden />
              </IconButton>
              <IconButton
                label={`Reject “${item.wrong}”`}
                disabled={props.busy}
                onClick={() => props.onReject(item)}
              >
                <XIcon aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DictionarySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading word list">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9 w-full" />
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
