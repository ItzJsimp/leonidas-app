import type { TradingCrewResult, TradingShareSettings } from "@t3tools/contracts";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { Card } from "./DashboardView";
import { SHARE_GROUPS, cardRows, sortCards, statusLine, validName } from "./crew.logic";
import { useTradingCrewActions } from "./useTradingCrew";

/** Which groups to share, with what each one holds. Money groups say they hold dollars. */
function ShareFields({
  share,
  onChange,
}: {
  readonly share: TradingShareSettings;
  readonly onChange: (next: TradingShareSettings) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">What you share</legend>
      {SHARE_GROUPS.map((group) => (
        <div key={group.key} className="flex items-start gap-2">
          <Checkbox
            id={`crew-share-${group.key}`}
            checked={share[group.key]}
            onCheckedChange={(checked) => onChange({ ...share, [group.key]: checked === true })}
            className="mt-0.5"
          />
          <div className="flex flex-col">
            <Label htmlFor={`crew-share-${group.key}`}>{group.label}</Label>
            <span className="text-xs text-muted-foreground">{group.note}</span>
          </div>
        </div>
      ))}
    </fieldset>
  );
}

/** Turn on Crew sync: the trader names themselves and picks the groups first. Nothing leaves before that. */
export function CrewSetup({
  result,
  initialName,
  initialShare,
  onSaved,
}: {
  readonly result: Pick<TradingCrewResult, "setup">;
  readonly initialName: string | null;
  readonly initialShare: TradingShareSettings;
  readonly onSaved?: () => void;
}) {
  const actions = useTradingCrewActions();
  const [name, setName] = useState(initialName ?? "");
  const [share, setShare] = useState(initialShare);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (result.setup === "no_pack") {
    return (
      <p className="text-sm text-muted-foreground">
        A Crew lives in your pack's repo. Link your pack in Setup, then come back to join the Crew.
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validName(name)) {
      setError("Enter a name from 1 to 40 characters.");
      return;
    }
    setBusy(true);
    setError(await actions.saveSettings({ traderName: name.trim(), share, crewSync: true }));
    setBusy(false);
    onSaved?.();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="crew-name">Your name on the Crew board</Label>
        <Input
          id="crew-name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          aria-invalid={error !== null}
          aria-describedby="crew-name-error"
          autoComplete="off"
        />
      </div>
      <ShareFields share={share} onChange={setShare} />
      <p className="text-xs text-muted-foreground">
        Your card is saved to the Crew branch of your pack's repo. Everyone with access to that repo
        can read it. Payouts and Money stay off until you turn them on.
      </p>
      {error ? (
        <p id="crew-name-error" role="alert" className="text-xs text-error-foreground">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="self-start">
        Start sharing with the Crew
      </Button>
    </form>
  );
}

function CrewCardView({
  card,
  self,
}: {
  readonly card: TradingCrewResult["cards"][number];
  readonly self: boolean;
}) {
  const rows = cardRows(card);
  return (
    <Card title={card.name} aside={self ? "You" : undefined}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Shares nothing yet.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-end tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-2xs text-muted-foreground">
        Updated {new Date(card.updatedAt).toLocaleString()}
      </p>
    </Card>
  );
}

/** The Crew tab: the last sync time, Retry, the board, and what you share. */
export function CrewBoard({
  result,
  share,
  nowMs,
}: {
  readonly result: TradingCrewResult;
  readonly share: TradingShareSettings;
  readonly nowMs: number;
}) {
  const actions = useTradingCrewActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(share);
  const line = statusLine(result, nowMs);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setError(await task());
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          role={line.problem ? "alert" : "status"}
          className={
            line.problem ? "text-sm text-warning-foreground" : "text-sm text-muted-foreground"
          }
        >
          {line.text}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(actions.syncNow)}>
          {line.problem ? "Retry" : "Sync now"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-error-foreground">
          {error}
        </p>
      ) : null}
      {result.cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cards yet. Yours shows after the first sync, and the others show as they sync.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sortCards(result.cards, result.self).map((card) => (
            <CrewCardView key={card.trader} card={card} self={card.trader === result.self} />
          ))}
        </div>
      )}
      {result.skippedCards > 0 ? (
        <p className="text-xs text-muted-foreground">
          {result.skippedCards} card {result.skippedCards === 1 ? "file was" : "files were"} not
          valid and {result.skippedCards === 1 ? "is" : "are"} hidden.
        </p>
      ) : null}
      <Card title="What you share">
        <ShareFields share={sharing} onChange={setSharing} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => actions.saveSettings({ share: sharing }))}
          >
            Save sharing
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => actions.saveSettings({ crewSync: false }))}
          >
            Stop sharing
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Stop sharing ends new syncs. Your old card stays in the repo until you delete it there.
        </p>
      </Card>
    </div>
  );
}
