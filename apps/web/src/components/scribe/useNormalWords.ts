import * as Schema from "effect/Schema";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import wordsUrl from "./normal-words/common-words.txt.gz?url";
import namesUrl from "./normal-words/first-names.txt.gz?url";
import { decodeFrontCoded, type NormalWordLists } from "./normalWords.logic";

/** Reads one packed list. A server may already unpack a .gz file, so only unpack bytes that start with the gzip mark. */
async function readList(url: string): Promise<ReadonlySet<string>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const stream = new Blob([bytes]).stream();
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return decodeFrontCoded(
    await new Response(
      gzipped ? stream.pipeThrough(new DecompressionStream("gzip")) : stream,
    ).text(),
  );
}

let loading: Promise<NormalWordLists> | null = null;

/** One download for the whole app session: the lists are read when the Dictionary first needs them. */
function loadNormalWords(): Promise<NormalWordLists> {
  const request = (loading ??= Promise.all([readList(wordsUrl), readList(namesUrl)]).then(
    ([words, names]) => ({ words, names }),
  ));
  request.catch(() => {
    if (loading === request) loading = null; // Try again the next time the Dictionary opens.
  });
  return request;
}

/** The word lists, or null while they load. If they fail to load the Dictionary works without flags. */
export function useNormalWordLists(): NormalWordLists | null {
  const [lists, setLists] = useState<NormalWordLists | null>(null);
  useEffect(() => {
    let active = true;
    loadNormalWords().then(
      (loaded) => {
        if (active) setLists(loaded);
      },
      (error: unknown) => console.warn("[scribe] Could not load the normal word lists.", error),
    );
    return () => {
      active = false;
    };
  }, []);
  return lists;
}

const FINE_STORAGE_KEY = "leonidas-code:scribe-fine-fixes:v1";
const NO_KEYS: readonly string[] = [];
const FINE_SCHEMA = Schema.Array(Schema.String);

/** Flagged word fixes the person marked as fine, saved on this computer. Keys come from `fineKey`. */
export function useFineMarks() {
  const [stored, setStored] = useLocalStorage(FINE_STORAGE_KEY, NO_KEYS, FINE_SCHEMA);
  const fine = useMemo(() => new Set(stored), [stored]);
  const mark = useCallback(
    (keys: readonly string[], on: boolean) =>
      setStored((previous) =>
        on ? [...new Set([...previous, ...keys])] : previous.filter((key) => !keys.includes(key)),
      ),
    [setStored],
  );
  const clear = useCallback(() => setStored(NO_KEYS), [setStored]);
  return { fine, mark, clear };
}
