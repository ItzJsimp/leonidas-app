import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeDictionary } from "@t3tools/contracts";
import { CheckIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import {
  scribeDictionaryQuery,
  scribePutDictionary,
  scribeRejectSuggestion,
  scribeSuggestionsQuery,
} from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { toastManager } from "../ui/toast";
import {
  acceptSuggestion,
  addReplacement,
  addVocabulary,
  dictionaryErrorMessage,
  filterReplacements,
  filterVocabulary,
  removeReplacement,
  removeVocabulary,
  suggestionWhy,
  type DictionaryEdit,
} from "./dictionary.logic";
import { commandErrorReason } from "./home.logic";
import type { ScribeTabProps } from "./ScribePage";

type Pane = "fixes" | "words" | "suggestions";

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
  const undo = (edit: (current: ScribeDictionary) => DictionaryEdit) => {
    if (latest.current !== null) void apply(edit(latest.current));
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
              ? "Scribe engine is not running."
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Word fixes replace a word Scribe gets wrong. Words to know help Scribe hear names and
        special terms.
      </p>
      <ToggleGroup
        aria-label="Word list sections"
        className="w-full *:flex-1 *:pointer-coarse:min-h-11 sm:w-auto sm:*:min-w-32"
        value={[pane]}
        onValueChange={(next) => {
          const value = next[0];
          if (value === "fixes" || value === "words" || value === "suggestions") setPane(value);
        }}
      >
        <Toggle value="fixes">{`Word fixes ${dictionary.replacements.length}`}</Toggle>
        <Toggle value="words">{`Words to know ${dictionary.vocabulary.length}`}</Toggle>
        <Toggle value="suggestions">
          {suggestions.length > 0 ? `Suggestions ${suggestions.length}` : "Suggestions"}
        </Toggle>
      </ToggleGroup>

      {pane === "fixes" ? (
        <FixesPane
          dictionary={dictionary}
          busy={busy}
          onAdd={(wrong, correct) => apply(addReplacement(dictionary, wrong, correct))}
          onRemove={async (rule) => {
            if (!(await save(removeReplacement(dictionary, rule.wrong)))) return;
            toastManager.add({
              type: "info",
              title: `Word fix removed: “${rule.wrong}” → “${rule.correct}”`,
              timeout: 6000,
              actionProps: {
                children: "Undo",
                onClick: () => undo((current) => addReplacement(current, rule.wrong, rule.correct)),
              },
            });
          }}
        />
      ) : null}
      {pane === "words" ? (
        <WordsPane
          dictionary={dictionary}
          busy={busy}
          onAdd={(word) => apply(addVocabulary(dictionary, word))}
          onRemove={async (word) => {
            if (!(await save(removeVocabulary(dictionary, word)))) return;
            toastManager.add({
              type: "info",
              title: `Removed “${word}”`,
              timeout: 6000,
              actionProps: {
                children: "Undo",
                onClick: () => undo((current) => addVocabulary(current, word)),
              },
            });
          }}
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
                title: `Word fix added: “${item.wrong}” → “${item.correct}”`,
              });
            }
          }}
          onReject={(item) => void rejectSuggestion(item.wrong)}
        />
      ) : null}
    </div>
  );
}

function FixesPane(props: {
  readonly dictionary: ScribeDictionary;
  readonly busy: boolean;
  readonly onAdd: (wrong: string, correct: string) => Promise<boolean>;
  readonly onRemove: (rule: ScribeDictionary["replacements"][number]) => Promise<void>;
}) {
  const [wrong, setWrong] = useState("");
  const [correct, setCorrect] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => filterReplacements(props.dictionary.replacements, query),
    [props.dictionary.replacements, query],
  );
  const submit = async () => {
    if (props.busy) return;
    if (await props.onAdd(wrong, correct)) {
      setWrong("");
      setCorrect("");
    }
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
            aria-label="Wrong word"
            placeholder="Wrong word (for example cooper netties)"
            value={wrong}
            onChange={(event) => setWrong(event.target.value)}
          />
        </div>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Right spelling"
            placeholder="Right spelling (for example Kubernetes)"
            value={correct}
            onChange={(event) => setCorrect(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={props.busy}>
          Add word fix
        </Button>
      </form>
      {props.dictionary.replacements.length === 0 ? (
        <EmptyLine
          title="No word fixes yet"
          body="Add a wrong word and its right spelling above."
        />
      ) : (
        <>
          <Input
            type="search"
            aria-label="Search word fixes"
            placeholder="Search word fixes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No word fix matches “{query.trim()}”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((rule) => (
                <li
                  key={rule.wrong}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="text-muted-foreground">{rule.wrong}</span>
                    <span aria-hidden> → </span>
                    <span className="sr-only"> becomes </span>
                    <span className="font-medium">{rule.correct}</span>
                  </p>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove word fix ${rule.wrong}`}
                    disabled={props.busy}
                    onClick={() => void props.onRemove(rule)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function WordsPane(props: {
  readonly dictionary: ScribeDictionary;
  readonly busy: boolean;
  readonly onAdd: (word: string) => Promise<boolean>;
  readonly onRemove: (word: string) => Promise<void>;
}) {
  const [word, setWord] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => filterVocabulary(props.dictionary.vocabulary, query),
    [props.dictionary.vocabulary, query],
  );
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
          Add word
        </Button>
      </form>
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
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No word matches “{query.trim()}”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <p className="min-w-0 flex-1 text-sm">{item}</p>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${item}`}
                    disabled={props.busy}
                    onClick={() => void props.onRemove(item)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionsPane(props: {
  readonly items: readonly { wrong: string; correct: string; count: number }[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onAccept: (item: { wrong: string; correct: string; count: number }) => Promise<void>;
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
        <p className="min-w-48 flex-1 text-sm text-muted-foreground">
          Scribe noticed these fixes and can learn them. Accept to add a word fix. Reject to never
          see it again.
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
        <ul className="flex flex-col gap-2">
          {props.items.map((item) => (
            <li
              key={item.wrong}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">“{item.wrong}”</span>
                  <span aria-hidden> → </span>
                  <span className="sr-only"> becomes </span>
                  <span className="font-medium">“{item.correct}”</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{suggestionWhy(item.count)}</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Accept ${item.wrong}`}
                disabled={props.busy}
                onClick={() => void props.onAccept(item)}
              >
                <CheckIcon aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Reject ${item.wrong}`}
                disabled={props.busy}
                onClick={() => props.onReject(item)}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyLine(props: { readonly title: string; readonly body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="font-medium">{props.title}</p>
      <p className="text-muted-foreground">{props.body}</p>
    </div>
  );
}

function DictionarySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading word list">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-9 w-full" />
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
