import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  TradingAccountView,
  TradingImportFile,
  TradingImportResult,
  TradingStateInput,
} from "@t3tools/contracts";
import { useId, useState, useSyncExternalStore } from "react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { useEnvironmentQuery } from "~/state/query";
import { tradingImport, tradingImportsQuery } from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";

import { accountLabel } from "./addMenu.logic";
import { importAccounts, importCheckText, importErrorText, importSummary } from "./journal.logic";

const fileKey = (file: TradingImportFile) => `${file.name}|${file.trades}`;

// shortcut: "Not now" lasts until the app restarts, save it in trading/settings.json if traders ask
const notNow = new Set<string>();
const notNowListeners = new Set<() => void>();
const subscribeNotNow = (listener: () => void) => {
  notNowListeners.add(listener);
  return () => void notNowListeners.delete(listener);
};
let notNowVersion = 0;
const hideForNow = (key: string) => {
  notNow.add(key);
  notNowVersion += 1;
  for (const listener of notNowListeners) listener();
};

export type ImportOutcome =
  | { readonly ok: true; readonly result: TradingImportResult }
  | { readonly ok: false; readonly message: string };

/** One new export: which account it goes to, then Import. The parent owns the server call. */
export function ImportPromptView({
  file,
  accounts,
  onImport,
  onNotNow,
}: {
  readonly file: TradingImportFile;
  readonly accounts: readonly TradingAccountView[];
  readonly onImport: (accountId: string) => Promise<ImportOutcome>;
  readonly onNotNow: () => void;
}) {
  const id = useId();
  const open = importAccounts(accounts);
  const [accountId, setAccountId] = useState<string | null>(
    open.length === 1 ? (open[0]?.id ?? null) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = Object.fromEntries(open.map((account) => [account.id, accountLabel(account)]));

  const submit = async () => {
    if (accountId === null || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await onImport(accountId);
    setBusy(false);
    if (!outcome.ok) setError(outcome.message);
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="min-w-0 flex-1 basis-56">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          New TopstepX export
        </h2>
        <p className="truncate text-xs text-muted-foreground">
          {importSummary(file)} · {file.name}
        </p>
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add an account, then import this file.</p>
      ) : (
        <>
          <Label className="flex min-w-0 basis-56 flex-col items-stretch" htmlFor={`${id}-account`}>
            Which account?
            <Select
              value={accountId}
              items={items}
              onValueChange={(value) => {
                if (typeof value === "string") setAccountId(value);
              }}
            >
              <SelectTrigger id={`${id}-account`} className="min-w-0">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectPopup>
                {open.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Label>
          <Button onClick={() => void submit()} disabled={accountId === null || busy}>
            {busy ? <Spinner size="sm" aria-hidden /> : null}
            Import
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={onNotNow}>
        Not now
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Shows the first TopstepX export in Downloads that this workspace has not imported. */
export function ImportPrompt({
  environmentId,
  scope,
  accounts,
}: {
  readonly environmentId: EnvironmentId;
  readonly scope: TradingStateInput;
  readonly accounts: readonly TradingAccountView[];
}) {
  const query = useEnvironmentQuery(tradingImportsQuery({ environmentId, input: scope }));
  const runImport = useAtomCommand(tradingImport, { reportFailure: false });
  useSyncExternalStore(subscribeNotNow, () => notNowVersion);
  const file = query.data?.files.find((item) => !notNow.has(fileKey(item)));
  if (!file) return null;

  const onImport = async (accountId: string): Promise<ImportOutcome> => {
    const result = await runImport({
      environmentId,
      input: { ...scope, file: file.name, accountId },
    });
    if (result._tag !== "Success") {
      const failure = squashAtomCommandFailure(result) as { readonly reason?: string } | undefined;
      return { ok: false, message: importErrorText(failure?.reason) };
    }
    const { added, check } = result.value;
    const description = importCheckText(check);
    toastManager.add({
      type: "success",
      title: added === 1 ? "Imported 1 trade" : `Imported ${added} trades`,
      ...(description ? { description } : {}),
    });
    return { ok: true, result: result.value };
  };

  return (
    <ImportPromptView
      key={fileKey(file)}
      file={file}
      accounts={accounts}
      onImport={onImport}
      onNotNow={() => hideForNow(fileKey(file))}
    />
  );
}
