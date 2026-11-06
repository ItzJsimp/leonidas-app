import type { ContentHistoryResult, ContentStage, ContentVideo } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import { formatDue, stageLabel } from "./content.logic";
import type { ContentAction, LoadHistoryFn } from "./ContentView";

function Tip(props: { readonly label: string; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** One script line split into its kind and its words. Other lines stay as they are. */
function lineParts(line: string): { readonly kind: string | null; readonly text: string } {
  const match = /^\s*(?:[-*]\s*)?(VISUAL|SPOKEN|SFX):\s*(.*)$/i.exec(line);
  return match ? { kind: match[1]!.toUpperCase(), text: match[2]! } : { kind: null, text: line };
}

/** The script as rows. In reader mode only the spoken words show, in big text for the tripod. */
function ScriptLines(props: { readonly script: string; readonly reader: boolean }) {
  const lines = props.script
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, n) => ({ id: `line-${n}`, ...lineParts(line) }));
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No script yet. An agent drafts it in Scripting.
      </p>
    );
  }
  if (props.reader) {
    return (
      <div data-reader="true" className="flex flex-col gap-5 text-2xl leading-relaxed">
        {lines
          .filter((part) => part.kind === "SPOKEN" || part.kind === null)
          .map((part) => (
            <p key={part.id} className="text-pretty">
              {part.text}
            </p>
          ))}
      </div>
    );
  }
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {lines.map((part) => (
        <div key={part.id} className="grid grid-cols-[4.5rem_1fr] gap-2">
          <dt className="text-muted-foreground text-xs leading-5">{part.kind ?? ""}</dt>
          <dd className={cn("wrap-anywhere", part.kind === "SPOKEN" && "font-medium")}>
            {part.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Scorecard({ video }: { readonly video: ContentVideo }) {
  const card = video.scorecard;
  const facts = [
    card.hookScore === undefined ? null : `Hook score ${card.hookScore}/10`,
    `Spoken ${card.spokenSeconds} s${card.targetSeconds ? ` of ${card.targetSeconds} s` : ""}`,
    card.writerModel ? `Writer ${card.writerModel}` : null,
    card.criticModel ? `Critic ${card.criticModel}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="text-muted-foreground">{facts.join(" · ")}</p>
      {[...card.blocks, ...card.warnings].map((line) => (
        <Badge
          key={line}
          variant={card.blocks.includes(line) ? "error" : "warning"}
          className="w-fit whitespace-normal"
        >
          {line}
        </Badge>
      ))}
    </div>
  );
}

const TABS = ["Script", "Footage", "Notes"] as const;
type Tab = (typeof TABS)[number];

/**
 * One video: script, footage and notes, with the stage actions a person may take. Below 1100 px
 * it is a bottom sheet; above, a panel on the right. It does not block the board.
 */
export function VideoPanel(props: {
  readonly video: ContentVideo;
  readonly brand: string;
  readonly canAct: boolean;
  readonly busy: boolean;
  readonly onMove: (to: ContentStage, note?: string) => void;
  readonly onSave: (action: Extract<ContentAction, { kind: "script" }>) => void;
  readonly loadHistory: LoadHistoryFn;
  readonly onClose: () => void;
}) {
  const { video } = props;
  const [tab, setTab] = useState<Tab>("Script");
  const [reader, setReader] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [history, setHistory] = useState<ContentHistoryResult | null | "loading">(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The board keys this panel by video, so each video opens with fresh state.
  useEffect(() => heading.current?.focus(), []);

  const locked = !props.canAct || props.busy;
  const lockedTip = "Only a signed-in person can do this";
  const due = formatDue(video.due);

  const actions =
    video.stage === "script_review" ? (
      <>
        <Tip label={props.canAct ? "Approve this exact script. You can undo it." : lockedTip}>
          <Button size="sm" disabled={locked} onClick={() => props.onMove("ready_to_film")}>
            Approve script
          </Button>
        </Tip>
        <Tip label={props.canAct ? "Send it back to Scripting with a note" : lockedTip}>
          <Button size="sm" variant="outline" disabled={locked} onClick={() => setNote("")}>
            Request changes
          </Button>
        </Tip>
      </>
    ) : video.stage === "ready_to_film" ? (
      <Tip label={props.canAct ? "Move this video to Filmed. You can undo it." : lockedTip}>
        <Button size="sm" disabled={locked} onClick={() => props.onMove("filmed")}>
          Mark filmed
        </Button>
      </Tip>
    ) : null;

  return (
    <aside
      aria-label="Video"
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
      }}
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-2xl bg-popover text-popover-foreground shadow-xl min-[1100px]:inset-y-0 min-[1100px]:left-auto min-[1100px]:max-h-none min-[1100px]:w-[30rem] min-[1100px]:rounded-none"
    >
      <header className="flex items-start gap-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-balance font-semibold text-lg leading-snug outline-none"
          >
            {video.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge size="sm" variant={video.stage === "ready_to_film" ? "default" : "secondary"}>
              {stageLabel(video.stage)}
            </Badge>
            <span>
              {[props.brand, due ? `due ${due}` : null, video.pen ? `pen: ${video.pen}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        </div>
        <Tip label="Close the video and go back to the board">
          {/* From 1100 px the app's own controls sit over the panel's top right corner. */}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close"
            className="min-[1100px]:mr-24"
            onClick={props.onClose}
          >
            <XIcon />
          </Button>
        </Tip>
      </header>

      <div
        role="tablist"
        aria-label="Video sections"
        className="flex gap-1 border-b px-4 pt-3 sm:px-5"
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              "-mb-px border-b-2 px-2 pb-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              tab === name
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={tab}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5"
      >
        {tab === "Script" ? (
          <>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            {note !== null ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  aria-label="What to change"
                  placeholder="What should the next draft change?"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={locked || note.trim() === ""}
                    onClick={() => props.onMove("scripting", note.trim())}
                  >
                    Send back
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNote(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            <Scorecard video={video} />
            <div className="flex flex-wrap gap-2">
              <Tip
                label={reader ? "Back to the full script" : "Only the spoken words, in big text"}
              >
                <Button
                  size="sm"
                  variant="outline"
                  aria-pressed={reader}
                  onClick={() => setReader(!reader)}
                >
                  {reader ? "Normal text" : "Reader mode"}
                </Button>
              </Tip>
              {draft === null ? (
                <Tip
                  label={
                    props.canAct
                      ? "Change the words. The edit is saved in the history under your name."
                      : lockedTip
                  }
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked}
                    onClick={() => setDraft(video.script)}
                  >
                    Edit script
                  </Button>
                </Tip>
              ) : null}
              <Tip label="The latest agent draft beside the script as it is now">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setHistory("loading");
                    void props.loadHistory({ deal: video.deal, file: video.file }).then(setHistory);
                  }}
                >
                  Show edits
                </Button>
              </Tip>
            </div>
            {draft !== null ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  aria-label="Script"
                  className="min-h-48"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={locked || draft.trim() === ""}
                    onClick={() =>
                      props.onSave({
                        kind: "script",
                        deal: video.deal,
                        file: video.file,
                        script: draft,
                      })
                    }
                  >
                    Save script
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ScriptLines script={video.script} reader={reader} />
            )}
            {history === "loading" ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading the history...
              </p>
            ) : history ? (
              history.baseline === null ? (
                <p className="text-sm text-muted-foreground">
                  No agent draft is in the history yet.
                </p>
              ) : (
                <section aria-label="Edits" className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1 font-medium">Agent draft</h3>
                    <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                      {history.baseline}
                    </pre>
                  </div>
                  <div>
                    <h3 className="mb-1 font-medium">Now</h3>
                    <pre className="whitespace-pre-wrap font-sans">{video.script}</pre>
                  </div>
                </section>
              )
            ) : null}
          </>
        ) : tab === "Footage" ? (
          <p className="text-sm text-muted-foreground">
            {video.footage.length > 0
              ? `${video.footage.length} Google Drive ${video.footage.length === 1 ? "file is" : "files are"} linked. Thumbnails and playback come after Drive access is set up.`
              : "No footage yet. Footage from Google Drive shows here after Drive access is set up."}
          </p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            {[
              ["Idea", video.idea],
              ["Shot list", video.shotList],
              ["Notes", video.notes],
            ].map(([label, text]) => (
              <section key={label}>
                <h3 className="mb-1 font-medium">{label}</h3>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {text || "Nothing yet."}
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
