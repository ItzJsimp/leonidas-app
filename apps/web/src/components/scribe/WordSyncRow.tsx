import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import { ensureLocalApi } from "~/localApi";
import { useEnvironmentQuery } from "~/state/query";
import { scribePatchSettings, scribeSettingsQuery } from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import type { ScribeTabProps } from "./ScribePage";
import { wordSyncDirError, wordSyncDirOf } from "./wordSync.logic";

/** Sets the AIOS folder the engine syncs words through. Blank turns word sync off. */
export function WordSyncRow({ environmentId }: Pick<ScribeTabProps, "environmentId">) {
  const settingsQuery = useEnvironmentQuery(scribeSettingsQuery({ environmentId, input: {} }));
  const runPatch = useAtomCommand(scribePatchSettings, { reportFailure: false });
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const settings = settingsQuery.data;
  // The tab above already shows a load failure, so this row stays out of the way until it loads.
  if (settings === null) return null;

  const current = saved ?? wordSyncDirOf(settings.sections.features);
  const value = draft ?? current;
  const error = wordSyncDirError(value);
  const canSave = !busy && error === null && value.trim() !== current;

  const save = async (dir: string) => {
    setBusy(true);
    const result = await runPatch({
      environmentId,
      input: { section: "features", values: { wordSyncDir: dir } },
    });
    setBusy(false);
    if (result._tag === "Success") {
      setSaved(dir);
      setDraft(null);
      toastManager.add({
        type: "success",
        title: dir === "" ? "Word sync turned off" : "Word sync folder saved",
      });
    } else if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not save the folder",
        description: "Check that Scribe is running. Then try again.",
      });
    }
  };

  // Only the desktop app can open the system folder dialog; the browser keeps the typed path.
  const choose = async () => {
    const picked = await ensureLocalApi()
      .dialogs.pickFolder({ initialPath: current || null })
      .catch(() => null);
    if (picked) void save(picked);
  };

  return (
    <form
      className="flex flex-col gap-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void save(value.trim());
      }}
    >
      <h3 className="text-sm font-medium">Use the same words on every computer</h3>
      <p className="text-sm text-muted-foreground">
        Scribe saves your words in a folder inside your AIOS, and your AIOS sync carries them to
        your other computers. Set the folder on each computer. Your words never go to a cloud
        service.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Word sync folder"
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : "word-sync-error"}
          placeholder="D:\Leonidas AIOS\scribe\words"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
        />
        {window.desktopBridge ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void choose()}>
            Choose folder
          </Button>
        ) : null}
        <Button type="submit" disabled={!canSave}>
          Save folder
        </Button>
        {current !== "" ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save("")}>
            Turn off
          </Button>
        ) : null}
      </div>
      {error !== null ? (
        <p id="word-sync-error" role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
      {current !== "" && error === null ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Syncing through this folder. A new word reaches your other computers after your AIOS
          syncs.
        </p>
      ) : null}
    </form>
  );
}
