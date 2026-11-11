import { useMemo, useState, type ComponentProps } from "react";
import { parseOutputDock, type DockSection, type DockStatus } from "@t3tools/shared/outputDock";
import { TabBadge, UnderlineTabs } from "../ui/underlineTabs";
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

const SUMMARY_FENCE = /^```leo:summary[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/m;

/**
 * The agent writes the summary in a `leo:summary` fence. Returns it apart from the rest of the
 * reply, or null summary when the reply has none (it then shows whole, without tabs).
 */
export function splitSummary(body: string): { summary: string | null; rest: string } {
  const match = SUMMARY_FENCE.exec(body);
  const summary = match?.[1]?.trim();
  if (!match || !summary) return { summary: null, rest: body };
  return {
    summary,
    rest: (body.slice(0, match.index) + body.slice(match.index + match[0].length)).trim(),
  };
}

/** Summary shows the agent's short version, Full answer shows the whole reply. */
function ReplyTabs({
  summary,
  body,
  renderMarkdown,
}: {
  summary: string;
  body: string;
  renderMarkdown: (text: string) => React.ReactNode;
}) {
  const [tab, setTab] = useState(0);
  const words = body.split(/\s+/).filter(Boolean).length;
  const [lead = "", ...more] = summary.split("\n");
  return (
    <div>
      <UnderlineTabs
        label="Reply"
        tabs={[
          { label: "Summary" },
          {
            label: "Full answer",
            badge: <TabBadge>{`${words.toLocaleString("en-US")} words`}</TabBadge>,
          },
        ]}
        selected={tab}
        onSelect={setTab}
        size="sm"
      >
        <div className="mt-2">
          {tab === 1 ? (
            renderMarkdown(body)
          ) : (
            <>
              <div className="font-medium">{renderMarkdown(lead)}</div>
              {more.some((line) => line.trim()) ? (
                <div className="text-muted-foreground">
                  {renderMarkdown(more.join("\n").trim())}
                </div>
              ) : null}
            </>
          )}
        </div>
      </UnderlineTabs>
    </div>
  );
}

/** Status pills above the reply. Tabs show only when the agent wrote a summary. */
export function ReplyBody({
  status,
  body,
  renderMarkdown,
}: {
  status?: DockStatus | undefined;
  body: string;
  renderMarkdown: (text: string) => React.ReactNode;
}) {
  const { summary, rest } = splitSummary(body);
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
      {summary ? (
        <ReplyTabs summary={summary} body={rest} renderMarkdown={renderMarkdown} />
      ) : rest.trim() ? (
        renderMarkdown(rest)
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
  if (!dock) {
    // A reply with no Dock can still carry a summary, and the raw fence must not show.
    const { summary } = props.isStreaming ? { summary: null } : splitSummary(props.text);
    return summary ? (
      <ReplyBody
        body={props.text}
        renderMarkdown={(text) => <ChatMarkdown {...props} text={text} />}
      />
    ) : (
      <ChatMarkdown {...props} />
    );
  }
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
