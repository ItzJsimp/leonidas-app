import { useMemo, useState, type ComponentProps } from "react";
import { parseOutputDock, type DockSection, type DockStatus } from "@t3tools/shared/outputDock";
import { underlineTabClass } from "../ui/underlineTab";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/** Actions prepare a draft; the composer remains the only place that sends it. */
/** Fixed reply for the "Explain simpler" button. */
export const EXPLAIN_SIMPLER_REPLY =
  "Explain your last answer again in simpler words. Define each technical term.";

export function OutputDock({
  sections,
  onReply,
  simple = false,
  renderMarkdown,
}: {
  sections: DockSection[];
  onReply?: ((text: string) => void) | undefined;
  /** Below the builder level: hide Next Actions and show the Explain simpler button. */
  simple?: boolean | undefined;
  renderMarkdown: (text: string) => React.ReactNode;
}) {
  const shown = simple ? sections.filter((section) => section.kind !== "actions") : sections;
  return (
    <div data-output-dock className="mt-4 space-y-4 rounded-xl border border-border bg-card/50 p-4">
      {shown.map((section) => (
        <section key={section.kind} aria-label={section.heading}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{section.heading}</h3>
          <div className="space-y-2">
            {section.items.map((item, index) => {
              const key = `${item.kind}:${index}:${item.kind === "replies" ? item.replies.join("|") : item.text}`;
              if (item.kind === "markdown") return <div key={key}>{renderMarkdown(item.text)}</div>;
              if (item.kind === "replies")
                return (
                  <div key={key} className="flex flex-wrap gap-2">
                    {item.replies.map((reply, i) => (
                      <Button
                        key={`${reply}:${i}`}
                        type="button"
                        variant="outline"
                        disabled={!onReply}
                        onClick={() => onReply?.(reply)}
                      >
                        {reply}
                      </Button>
                    ))}
                  </div>
                );
              if (item.kind === "option")
                return (
                  <div key={key} className="rounded-lg border border-border p-3">
                    {renderMarkdown(item.text)}
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!onReply}
                        onClick={() => onReply?.(item.reply)}
                      >
                        Choose {item.letter}
                      </Button>
                    </div>
                  </div>
                );
              return (
                <div key={key} className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">{renderMarkdown(item.text)}</div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!onReply}
                    onClick={() => onReply?.(item.reply)}
                  >
                    Start
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {simple && onReply ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onReply(EXPLAIN_SIMPLER_REPLY)}
        >
          Explain simpler
        </Button>
      ) : null}
      {onReply ? (
        <p className="text-xs text-muted-foreground">
          Buttons fill your message box. Check it, then send.
        </p>
      ) : null}
    </div>
  );
}

const STATUS = {
  done: { label: "Done", variant: "success" },
  "need-you": { label: "Need you", variant: "warning" },
  blocked: { label: "Blocked", variant: "error" },
} as const;
const ATTENTION = { none: "No thought needed", glance: "Quick look", think: "Needs thought" };

const PREVIEW_LINES = 3;

/** The first lines of the body with text, plus any blank lines between them. */
function previewOf(body: string): string {
  const kept: string[] = [];
  let count = 0;
  for (const line of body.split("\n")) {
    if (line.trim()) count += 1;
    if (count > PREVIEW_LINES) break;
    kept.push(line);
  }
  return kept.join("\n");
}

/** A long body: Summary shows its first lines, Full answer shows all of it. */
function ReplyTabs({
  body,
  renderMarkdown,
}: {
  body: string;
  renderMarkdown: (text: string) => React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const words = body.split(/\s+/).filter(Boolean).length;
  const tab = (selected: boolean) => underlineTabClass(selected, "min-h-8 px-0.5 py-0");
  return (
    <div>
      <div role="tablist" aria-label="Reply" className="mb-2 flex gap-4 border-b border-border">
        <button
          type="button"
          role="tab"
          aria-selected={!full}
          className={tab(!full)}
          onClick={() => setFull(false)}
        >
          Summary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={full}
          className={tab(full)}
          onClick={() => setFull(true)}
        >
          Full answer
          <span className="rounded-full bg-surface-raised px-1.5 text-2xs text-muted-foreground tabular-nums">
            {words.toLocaleString("en-US")} words
          </span>
        </button>
      </div>
      <div role="tabpanel">{renderMarkdown(full ? body : previewOf(body))}</div>
    </div>
  );
}

/** Status pills above the reply; a body past 3 lines gets Summary and Full answer tabs. */
export function ReplyBody({
  status,
  body,
  renderMarkdown,
}: {
  status?: DockStatus | undefined;
  body: string;
  renderMarkdown: (text: string) => React.ReactNode;
}) {
  const lines = body.split("\n").filter((line) => line.trim()).length;
  return (
    <>
      {status ? (
        <div data-status-bar className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={STATUS[status.state].variant}>{STATUS[status.state].label}</Badge>
          <Badge variant="outline">{ATTENTION[status.attention]}</Badge>
          {status.place ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{status.place}</span>
          ) : null}
        </div>
      ) : null}
      {lines > PREVIEW_LINES ? (
        <ReplyTabs body={body} renderMarkdown={renderMarkdown} />
      ) : lines > 0 ? (
        renderMarkdown(body)
      ) : null}
    </>
  );
}

export function AssistantOutput({
  onReply,
  simple,
  ...props
}: ComponentProps<typeof ChatMarkdown> & {
  onReply?: ((text: string) => void) | undefined;
  simple?: boolean | undefined;
}) {
  const dock = useMemo(
    () => (props.isStreaming ? null : parseOutputDock(props.text)),
    [props.text, props.isStreaming],
  );
  if (!dock) return <ChatMarkdown {...props} />;
  return (
    <>
      <ReplyBody
        status={dock.status}
        body={dock.body}
        renderMarkdown={(text) => <ChatMarkdown {...props} text={text} />}
      />
      <OutputDock
        sections={dock.sections}
        onReply={onReply}
        simple={simple}
        renderMarkdown={(text) => <ChatMarkdown {...props} text={text} />}
      />
    </>
  );
}
