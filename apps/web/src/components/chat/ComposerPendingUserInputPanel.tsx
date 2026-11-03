import { type RuntimeRequestId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveUserQuestionPresentation } from "@t3tools/client-runtime/state/user-question-presentation";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { cn } from "~/lib/utils";
import { ComposerBanner } from "./ComposerBanner";

interface PendingUserInputPanelProps {
  cacheNote?: string | null;
  pendingUserInputs: PendingUserInput[];
  disabled?: boolean;
  respondingRequestIds: RuntimeRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: RuntimeRequestId) => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  cacheNote = null,
  pendingUserInputs,
  disabled = false,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      cacheNote={cacheNote}
      disabled={disabled}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
      onDismiss={onDismiss}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  cacheNote,
  disabled,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: {
  prompt: PendingUserInput;
  cacheNote: string | null;
  disabled: boolean;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: RuntimeRequestId) => void;
}) {
  // Message-mode requests remain answerable after their provider turn ends.
  const canRespond = prompt.responseCapability !== "not_resumable";
  const responseDisabled = disabled || isResponding || !canRespond;
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const presentation = useMemo(
    () => (activeQuestion ? deriveUserQuestionPresentation(activeQuestion) : null),
    [activeQuestion],
  );
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionValue: string;
  } | null>(null);
  // Collapsing hides everything but the header so a tall prompt stops covering
  // the thread the user is trying to read. Scoped to a single question: the card
  // is keyed by request id so the next prompt starts expanded, and storing the
  // collapsed question's id (rather than a bare flag) reopens the card when the
  // prompt advances to its next question, which can happen without a click —
  // sending from the composer advances the active question.
  const [collapsedQuestionId, setCollapsedQuestionId] = useState<string | null>(null);
  const isCollapsed = collapsedQuestionId !== null && collapsedQuestionId === activeQuestion?.id;

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (!activeQuestion || activeQuestion.multiSelect || !optimisticSingleSelect) {
      return;
    }
    if (optimisticSingleSelect.questionId !== activeQuestion.id) {
      setOptimisticSingleSelect(null);
      return;
    }
    if (progress.selectedOptionValues.includes(optimisticSingleSelect.optionValue)) {
      setOptimisticSingleSelect(null);
    }
  }, [activeQuestion, optimisticSingleSelect, progress.selectedOptionValues]);

  // A delayed answer only advances its own question, while permission remains granted.
  useEffect(() => {
    const clearAutoAdvance = () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
    if (disabled || activeQuestion?.id === undefined) clearAutoAdvance();
    return clearAutoAdvance;
  }, [activeQuestion?.id, disabled]);

  const handleOptionSelection = useCallback(
    (questionId: string, optionValue: string) => {
      if (disabled || isResponding) return;
      if (activeQuestion?.multiSelect) {
        onToggleOption(questionId, optionValue);
        return;
      }
      // A second click on the chosen option clears it.
      if (progress.selectedOptionValues.includes(optionValue)) {
        setOptimisticSingleSelect(null);
        onToggleOption(questionId, optionValue);
        return;
      }
      setOptimisticSingleSelect({ questionId, optionValue });
      onToggleOption(questionId, optionValue);
      // The user may still type a note to send with the option, so only
      // choice-only questions submit on click. Others submit from the composer.
      if (activeQuestion?.allowCustomAnswer !== false) return;
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        onAdvanceRef.current();
      }, 200);
    },
    [activeQuestion, disabled, isResponding, onToggleOption, progress.selectedOptionValues],
  );

  // Keyboard shortcut: number keys 1-9 select corresponding options when focus is
  // outside editable fields. Multi-select prompts toggle options in place; single-
  // select prompts keep the existing auto-advance behavior. Collapsed prompts opt
  // out, since the numbers they refer to are not on screen.
  useEffect(() => {
    if (!activeQuestion || responseDisabled || isCollapsed) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.value ?? option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, handleOptionSelection, isCollapsed, responseDisabled]);

  if (!activeQuestion || !presentation) {
    return null;
  }

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={(open) => {
        setCollapsedQuestionId(open ? null : activeQuestion.id);
      }}
    >
      <ComposerBanner.Row>
        <ComposerBanner.Icon />
        <ComposerBanner.Content>
          {/* Only the title is the disclosure, so Skip can be a real button beside it. */}
          <CollapsibleTrigger
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            title={
              isCollapsed
                ? "Show the question and its options"
                : "Hide the question and its options"
            }
            data-pending-user-input-toggle={isCollapsed ? "collapsed" : "expanded"}
          >
            <span className="shrink-0 font-medium text-muted-foreground">
              {activeQuestion.header}
            </span>
            {isCollapsed ? (
              <span className="min-w-0 flex-1 truncate text-secondary-label">
                {presentation.question}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                Waiting on your answer
              </span>
            )}
            <ComposerBanner.ToggleIcon expanded={!isCollapsed} />
          </CollapsibleTrigger>
          {cacheNote ? (
            <span className="min-w-0 truncate text-3xs text-warning" title={cacheNote}>
              {cacheNote}
            </span>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions>
          {prompt.questions.length > 1 ? (
            <span className="text-3xs font-medium text-muted-foreground tabular-nums">
              {questionIndex + 1}/{prompt.questions.length}
            </span>
          ) : null}
          {prompt.dismissible || canRespond ? (
            // Skip releases the agent without choosing an option.
            <ComposerBanner.Dismiss
              aria-label="Skip this question and let the agent decide"
              title="Skip this question and let the agent decide"
              className="w-auto px-1.5 text-xs"
              disabled={isResponding}
              data-pending-user-input-skip
              onClick={() => onDismiss(prompt.requestId)}
            >
              Skip
            </ComposerBanner.Dismiss>
          ) : null}
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
      <CollapsiblePanel>
        <ComposerBanner.Scroll>
          <ComposerBanner.Body className="pe-1 pb-1 wrap-anywhere">
            <p className="text-sm text-foreground/85">{presentation.question}</p>
            {/* Above the options: the body scrolls on phones, so a line below them goes unseen.
                With a note allowed, a click only marks the option, so Send is still needed. */}
            {activeQuestion.allowCustomAnswer !== false ? (
              <p className="mt-1 text-secondary-label text-sm">
                {activeQuestion.multiSelect ? "Pick your options" : "Pick an option"}, then press
                Submit. You can type a note to go with it.
              </p>
            ) : activeQuestion.multiSelect ? (
              <p className="mt-1 text-secondary-label text-sm">Select one or more options.</p>
            ) : null}
            <div className="mt-2 space-y-1">
              {presentation.options.map((option, index) => {
                const optionValue = option.value;
                const isOptimisticallySelected =
                  optimisticSingleSelect?.questionId === activeQuestion.id &&
                  optimisticSingleSelect.optionValue === optionValue;
                const isSelected =
                  isOptimisticallySelected || progress.selectedOptionValues.includes(optionValue);
                const shortcutKey = index < 9 ? index + 1 : null;
                const { label: optionLabel, recommended } = option;
                const className = cn(
                  "group flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                  isSelected
                    ? "border-foreground/30 bg-muted/55 text-foreground"
                    : "border-border bg-transparent text-foreground/85 hover:bg-muted/30",
                  (disabled || isResponding) && "opacity-50 cursor-not-allowed",
                  !disabled && !isResponding && "cursor-pointer",
                );
                const content = (
                  <>
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        <span className="shrink-0 text-muted-foreground">{option.letter}</span>
                        <span>{optionLabel}</span>
                        {recommended ? (
                          <span
                            data-recommended-option
                            className="rounded-full bg-primary/10 px-1.5 py-px text-3xs font-medium text-primary"
                          >
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      {option.description && option.description !== option.label ? (
                        <span className="text-secondary-label text-sm">{option.description}</span>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0 text-foreground" />
                    ) : shortcutKey !== null ? (
                      // Number keys pick an option; phones have none, so the hint hides there.
                      <kbd className="flex size-5 shrink-0 items-center justify-center rounded border border-border text-3xs font-medium text-muted-foreground tabular-nums max-sm:hidden">
                        {shortcutKey}
                      </kbd>
                    ) : null}
                  </>
                );
                return (
                  <button
                    key={`${activeQuestion.id}:${optionValue}`}
                    type="button"
                    disabled={disabled || isResponding}
                    onClick={() => {
                      handleOptionSelection(activeQuestion.id, optionValue);
                    }}
                    className={className}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </ComposerBanner.Body>
        </ComposerBanner.Scroll>
      </CollapsiblePanel>
    </Collapsible>
  );
});
