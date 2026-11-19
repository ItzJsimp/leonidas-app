import { REASONING_EFFORT_OPTION_IDS } from "@t3tools/client-runtime/state/thread-execution";
import { memo, useState } from "react";

import { cheapModelsFor, suggestDownshift } from "../../lib/downshift";
import { useThreadShell } from "../../state/entities";
import { Button } from "../ui/button";
import {
  getDescriptorStringValue,
  useTraitsSelection,
  type TraitsMenuContentProps,
  type TraitsPersistence,
} from "./TraitsPicker";

export interface DownshiftExtras {
  /** Scopes the dismissal and the switch-back to one chat. */
  readonly chatKey: string;
  readonly attachmentCount: number;
  /** Tokens already in the chat. Null when unknown. */
  readonly contextTokens: number | null;
  /** Switches the composer to another model of the same account. */
  readonly onSwitchModel: (slug: string) => void;
}

type Applied = {
  readonly chatKey: string;
  readonly at: number;
  readonly from:
    | { readonly kind: "effort"; readonly id: string; readonly label: string }
    | { readonly kind: "model"; readonly slug: string; readonly name: string };
  readonly toLabel: string;
};

/**
 * One line above the composer. For a small task on a costly setting it offers a cheaper one:
 * a lower effort first, then a cheaper model. After you take it, a failed reply offers the
 * way back with one click. It never changes a setting on its own.
 */
export const DownshiftNotice = memo(function DownshiftNotice(
  props: TraitsMenuContentProps & TraitsPersistence & DownshiftExtras,
) {
  const { chatKey, attachmentCount, contextTokens, onSwitchModel, models, model, prompt } = props;
  const {
    modelSelection,
    selectDescriptors,
    ultrathinkPromptControlled,
    modelIsUnavailable,
    handleSelectChange,
  } = useTraitsSelection(props);
  const [dismissedChat, setDismissedChat] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const latestRun = useThreadShell(props.threadRef ?? null)?.latestRun;

  const effort = selectDescriptors.find((descriptor) =>
    REASONING_EFFORT_OPTION_IDS.includes(descriptor.id),
  );
  const effortOptions = (effort?.options ?? []).filter(
    (option) => !effort?.promptInjectedValues?.includes(option.id),
  );
  const currentEffortId = effort
    ? getDescriptorStringValue(effort, modelSelection, props.reportedModelSelection)
    : null;
  const labelOf = (id: string | null) => effortOptions.find((option) => option.id === id)?.label;

  const mine = applied?.chatKey === chatKey ? applied : null;
  const failedAfterSwitch =
    mine !== null &&
    latestRun?.status === "failed" &&
    Date.parse(latestRun.completedAt ?? latestRun.requestedAt ?? "") >= mine.at;

  const suggestion =
    dismissedChat === chatKey || modelIsUnavailable || ultrathinkPromptControlled
      ? null
      : suggestDownshift({
          prompt,
          attachmentCount,
          contextTokens,
          currentEffortId,
          effortOptions,
          cheapModels: cheapModelsFor(models, model ?? ""),
        });

  if (mine && failedAfterSwitch) {
    return (
      <Notice
        text={`That reply failed on ${mine.toLabel}.`}
        action={`Switch back to ${mine.from.kind === "effort" ? `${mine.from.label} effort` : mine.from.name}`}
        onAction={() => {
          if (mine.from.kind === "effort" && effort) handleSelectChange(effort, mine.from.id);
          if (mine.from.kind === "model") onSwitchModel(mine.from.slug);
          setApplied(null);
        }}
        onDismiss={() => setApplied(null)}
      />
    );
  }
  if (!suggestion) return null;

  if (suggestion.kind === "effort" && effort && currentEffortId !== null) {
    return (
      <Notice
        text={`Small task? ${suggestion.label} effort costs less and may be enough.`}
        action={`Use ${suggestion.label}`}
        onAction={() => {
          setApplied({
            chatKey,
            at: Date.now(),
            from: {
              kind: "effort",
              id: currentEffortId,
              label: labelOf(currentEffortId) ?? currentEffortId,
            },
            toLabel: `${suggestion.label} effort`,
          });
          setDismissedChat(chatKey);
          handleSelectChange(effort, suggestion.optionId);
        }}
        onDismiss={() => setDismissedChat(chatKey)}
      />
    );
  }
  if (suggestion.kind === "model") {
    const currentName = models.find((entry) => entry.slug === model)?.name ?? model ?? "";
    return (
      <Notice
        text={`Small task? ${suggestion.name} costs less and may be enough.`}
        action={`Switch to ${suggestion.name}`}
        onAction={() => {
          setApplied({
            chatKey,
            at: Date.now(),
            from: { kind: "model", slug: model ?? "", name: currentName },
            toLabel: suggestion.name,
          });
          setDismissedChat(chatKey);
          onSwitchModel(suggestion.slug);
        }}
        onDismiss={() => setDismissedChat(chatKey)}
      />
    );
  }
  return null;
});

function Notice(props: {
  readonly text: string;
  readonly action: string;
  readonly onAction: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground"
      role="status"
      data-downshift-notice="true"
    >
      <span>{props.text}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Button size="xs" variant="ghost" onClick={props.onAction}>
          {props.action}
        </Button>
        <Button size="xs" variant="ghost" onClick={props.onDismiss}>
          Dismiss
        </Button>
      </span>
    </div>
  );
}
