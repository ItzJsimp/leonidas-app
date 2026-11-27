import type { CalendarGoogleCalendar } from "@t3tools/contracts";
import { CalendarPlusIcon, ExternalLinkIcon, LogInIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

import { Tip } from "../twoState/Tip";

import { CALENDAR_COLORS, CALENDAR_SETUP_DOC, LINK_GUIDES, type LinkGuide } from "./calendar.logic";
import { bumpCalendars, useAgendaEvents, useCalendarCommands } from "./useCalendar";
import { rovingGroup } from "~/lib/rovingGroup";

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

/** Connect a calendar where the user clicked: sign in with Google, or paste a private calendar link. */
export function ConnectCalendarDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect a calendar</DialogTitle>
          <DialogDescription>
            Your events show on Today and Up next. Leonidas only reads your calendar. It never
            changes it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {open ? <ConnectBody onDone={() => onOpenChange(false)} /> : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function ConnectBody({ onDone }: { readonly onDone: () => void }) {
  return (
    <>
      <GoogleSignIn onDone={onDone} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or paste a calendar link, which works with any app
        <span className="h-px flex-1 bg-border" />
      </div>
      <LinkForm onDone={onDone} />
    </>
  );
}

function GoogleSignIn({ onDone }: { readonly onDone: () => void }) {
  const commands = useCalendarCommands();
  const status = useAgendaEvents(1);
  const ready = status.data?.googleReady === true;
  const [phase, setPhase] = useState<"idle" | "waiting" | "saving">("idle");
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<readonly CalendarGoogleCalendar[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const signIn = async () => {
    if (!ready) {
      setHelp((value) => !value);
      return;
    }
    setPhase("waiting");
    setMessage(null);
    const result = await commands.connectGoogle();
    setPhase("idle");
    if (!result.ok) return setMessage(result.message);
    setCalendars(result.calendars);
    setPicked(new Set(result.calendars.slice(0, 1).map((c) => c.id)));
  };

  const saveClient = async () => {
    setMessage(null);
    const result = await commands.setClient({ clientId, clientSecret });
    setMessage(result.message);
    if (result.ok) {
      setHelp(false);
      bumpCalendars();
    }
  };

  const addPicked = async () => {
    setPhase("saving");
    const result = await commands.selectGoogle((calendars ?? []).filter((c) => picked.has(c.id)));
    setPhase("idle");
    if (!result.ok) return setMessage(result.message);
    bumpCalendars();
    toastManager.add({ type: "success", title: "Google Calendar connected" });
    onDone();
  };

  return (
    <section aria-label="Sign in with Google" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={signIn} disabled={phase !== "idle"} variant="outline">
          {phase === "waiting" ? <Spinner /> : <LogInIcon aria-hidden />}
          Sign in with Google
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {phase === "waiting"
            ? "Finish in the browser window that opened. Then come back here."
            : "Pick which of your Google calendars to show."}
        </p>
      </div>
      {help ? (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">Google sign-in needs a one-time setup</p>
          <p className="text-muted-foreground">
            You make a free Google client ID, then paste it here. It takes about five minutes. Or
            skip this and paste a calendar link below. That works right now.
          </p>
          <a
            href={CALENDAR_SETUP_DOC}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Open the setup steps <ExternalLinkIcon aria-hidden className="size-3.5" />
          </a>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={FIELD_LABEL}>Client ID</span>
              <Input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="123456-abc.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="space-y-1">
              <span className={FIELD_LABEL}>Client secret</span>
              <Input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <Button size="sm" onClick={saveClient} disabled={clientId.trim().length === 0}>
            Save client ID
          </Button>
        </div>
      ) : null}
      {calendars !== null ? (
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Your Google calendars
          </legend>
          {calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">This Google account has no calendars.</p>
          ) : (
            calendars.map((calendar) => (
              <label key={calendar.id} className="flex min-w-0 items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.has(calendar.id)}
                  onCheckedChange={(checked) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (checked) next.add(calendar.id);
                      else next.delete(calendar.id);
                      return next;
                    })
                  }
                />
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: calendar.color }}
                />
                <Tip text={calendar.name}>
                  <span className="min-w-0 truncate">{calendar.name}</span>
                </Tip>
              </label>
            ))
          )}
          <Button size="sm" onClick={addPicked} disabled={picked.size === 0 || phase !== "idle"}>
            {phase === "saving" ? <Spinner /> : null}
            Add {picked.size} {picked.size === 1 ? "calendar" : "calendars"}
          </Button>
        </fieldset>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function LinkForm({ onDone }: { readonly onDone: () => void }) {
  const commands = useCalendarCommands();
  const [guideId, setGuideId] = useState<LinkGuide["id"]>("google");
  const guide = LINK_GUIDES.find((g) => g.id === guideId) ?? LINK_GUIDES[0]!;
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CALENDAR_COLORS[0].value);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = async () => {
    setBusy("test");
    setResult(await commands.testLink(url));
    setBusy(null);
  };

  const save = async () => {
    setBusy("save");
    const saved = await commands.addLink({ url, name, color });
    setBusy(null);
    if (!saved.ok) return setResult(saved);
    bumpCalendars();
    toastManager.add({ type: "success", title: "Calendar connected", description: saved.message });
    onDone();
  };

  return (
    <section aria-label="Paste a calendar link" className="space-y-4">
      <div
        role="tablist"
        ref={rovingGroup}
        aria-label="Calendar app"
        className="flex flex-wrap gap-1.5"
      >
        {LINK_GUIDES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`calendar-guide-tab-${item.id}`}
            aria-selected={item.id === guideId}
            aria-controls="calendar-guide-panel"
            onClick={() => setGuideId(item.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring",
              item.id === guideId
                ? "border-foreground/30 bg-accent text-foreground"
                : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="calendar-guide-panel"
        aria-labelledby={`calendar-guide-tab-${guide.id}`}
        className="space-y-1.5"
      >
        <ol className="list-decimal space-y-1 ps-5 text-sm">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.note ? <p className="text-xs text-muted-foreground">{guide.note}</p> : null}
      </div>

      <label className="block space-y-1">
        <span className={FIELD_LABEL}>Calendar link</span>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setResult(null);
            }}
            placeholder="https:// or webcal://"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="calendar-link-result"
          />
          <Button
            variant="outline"
            onClick={test}
            disabled={url.trim().length === 0 || busy !== null}
          >
            {busy === "test" ? <Spinner /> : null}
            Test
          </Button>
        </div>
      </label>
      <p
        id="calendar-link-result"
        role="status"
        className={cn(
          "min-h-5 text-sm",
          result?.ok ? "text-success-foreground" : "text-destructive-foreground",
        )}
      >
        {result?.message ?? ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="space-y-1">
          <span className={FIELD_LABEL}>Name (optional)</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Work"
            autoComplete="off"
          />
        </label>
        <div role="radiogroup" ref={rovingGroup} aria-label="Color" className="space-y-1">
          <span className={FIELD_LABEL}>Color</span>
          <div className="flex h-8 items-center gap-1.5">
            {CALENDAR_COLORS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={item.value === color}
                aria-label={item.name}
                onClick={() => setColor(item.value)}
                className={cn(
                  "size-5 rounded-full border-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  item.value === color ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: item.value }}
              />
            ))}
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={url.trim().length === 0 || busy !== null}>
        {busy === "save" ? <Spinner /> : <CalendarPlusIcon aria-hidden />}
        Save calendar
      </Button>
    </section>
  );
}
