import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useState } from "react";

import { useLocalStorage } from "../../../hooks/useLocalStorage";
import { quickAnswerCount } from "../../../onboarding/aiosInterview.logic";
import {
  AIOS_FOLDER_STORAGE_KEY,
  DEFAULT_AIOS_FOLDER,
} from "../../../onboarding/leonidasSetup.logic";
import {
  FIRST_CHAT_PROMPT,
  SETUP_COPY,
  buildImportedMemoryFile,
  buildQuickAnswersFile,
  fileStamp,
  tourExtras,
  tourStops,
  voiceFor,
} from "../../../onboarding/setupCopy";
import {
  EMPTY_SETUP_STATE,
  QUESTION_POINTS,
  QUICK_QUESTION_COUNT,
  SETUP_STATE_STORAGE_KEY,
  SetupStateSchema,
  brainScore,
  markDone,
  openSetupItems,
  type SetupItem,
  type SetupItemId,
} from "../../../onboarding/setupState.logic";
import { useAiosFileWriter } from "../../../onboarding/useAiosFileWriter";
import { isSetupPreview } from "../../../onboarding/setupPreview";
import { useOnboardingChat } from "../../../onboarding/useOnboardingChat";
import { usePrimaryEnvironment } from "../../../state/environments";
import { Button } from "../../ui/button";
import { Dialog, DialogPanel, DialogPopup, DialogTitle } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { AgentsStep } from "../AgentsStep";
import { AiLevelStep } from "../AiLevelStep";
import { LeonidasLayaStep } from "../LeonidasLayaStep";
import { LeonidasSkillsStep } from "../LeonidasSkillsStep";
import { VoiceStep } from "../VoiceStep";
import { MemoryImportPanel } from "./MemoryImportPanel";
import { SetupPreviewBar } from "./SetupPreviewBar";
import { SetupQuestionsScreen } from "./SetupQuestionsScreen";
import { SetupTour } from "./SetupTour";

function pointsLeft(item: SetupItem, questionsAnswered: number): number {
  if (item.id !== "questions") return item.points;
  return (
    (QUICK_QUESTION_COUNT - Math.min(questionsAnswered, QUICK_QUESTION_COUNT)) * QUESTION_POINTS
  );
}

/**
 * The Finish-setup checklist and brain-strength meter on the Command tab. Every skipped setup step
 * shows here until it is done. It also runs the guided tour once, right after setup.
 */
export function FinishSetupCard() {
  const [state, setState] = useLocalStorage(
    SETUP_STATE_STORAGE_KEY,
    EMPTY_SETUP_STATE,
    SetupStateSchema,
  );
  const environmentId = usePrimaryEnvironment()?.environmentId;
  const [openItem, setOpenItem] = useState<SetupItemId | null>(null);
  const [touring, setTouring] = useState(false);
  // Only users who ran the new setup see this card. Old-wizard users get no surprise tour.
  if (state.startedAt === null) return null;

  const voice = voiceFor(state.coder);
  const copy = SETUP_COPY[voice];
  const score = brainScore(state);
  const items = openSetupItems(state);
  const done = (id: SetupItemId) => {
    setState((current) => markDone(current, id));
    setOpenItem(null);
  };
  const item = items.find((entry) => entry.id === openItem) ?? null;

  return (
    <section aria-labelledby="finish-setup-title" className="space-y-4 rounded-xl border p-4">
      {touring || !state.tourSeen ? (
        <SetupTour
          stops={tourStops(voice)}
          intro={copy.tourIntro}
          extra={tourExtras(state.memoryPreview, state.firstTask)}
          onClose={() => {
            setTouring(false);
            setState((current) => ({ ...current, tourSeen: true }));
          }}
        />
      ) : null}
      <SetupPreviewBar />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="finish-setup-title" className="text-base font-semibold">
            {copy.checklistTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.checklistLead}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setTouring(true)}>
          Take the tour again
        </Button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span id="brain-strength-label" className="font-medium">
            {copy.meterLabel}
          </span>
          <span className="tabular-nums text-muted-foreground">{score} / 100</span>
        </div>
        <div
          role="meter"
          aria-labelledby="brain-strength-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <p role="status" className="text-sm">
          Setup is complete. Your AI has everything it needs to start.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((entry) => {
            const points = pointsLeft(entry, state.questionsAnswered);
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{entry.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.ability}
                    {points > 0 ? (
                      <span className="ml-1.5 font-medium text-foreground tabular-nums">
                        +{points}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Start: ${entry.label}`}
                  onClick={() => setOpenItem(entry.id)}
                >
                  Start
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={item !== null} onOpenChange={(open) => (open ? null : setOpenItem(null))}>
        <DialogPopup className="max-w-xl">
          <DialogPanel>
            <DialogTitle className="sr-only">{item?.label ?? copy.checklistTitle}</DialogTitle>
            {item && environmentId ? (
              <ItemPanel
                item={item.id}
                environmentId={environmentId}
                voice={voice}
                onDone={(answered) => {
                  if (answered !== undefined) {
                    setState((current) => ({
                      ...current,
                      questionsAnswered: Math.max(current.questionsAnswered, answered),
                    }));
                    setOpenItem(null);
                  } else done(item.id);
                }}
                onClose={() => setOpenItem(null)}
              />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </section>
  );
}

/** Opens the existing setup part for one checklist item. */
function ItemPanel({
  item,
  environmentId,
  voice,
  onDone,
  onClose,
}: {
  readonly item: SetupItemId;
  readonly environmentId: EnvironmentId;
  readonly voice: "everyday" | "builder";
  /** `answered` is set only for the quick questions. */
  readonly onDone: (answered?: number) => void;
  readonly onClose: () => void;
}) {
  const [folder] = useLocalStorage(AIOS_FOLDER_STORAGE_KEY, DEFAULT_AIOS_FOLDER, Schema.String);
  const { write } = useAiosFileWriter(environmentId);
  const writeOne = async (file: Parameters<typeof write>[1][number]) => {
    // Setup already made this folder, so adding files next to others is expected here.
    const result = await write(folder, [file], { allowExisting: true });
    if (!result.ok) return result.message;
    return result.created.length > 0 ? null : "That file was already saved. Try again.";
  };
  const step = { environmentId, onBack: onClose, onContinue: () => onDone() };

  switch (item) {
    case "basics":
      return <p className="text-sm">Your AI already has a name. Change it in its identity file.</p>;
    case "account":
      return (
        <AgentsStep
          environmentIds={[environmentId]}
          onBack={onClose}
          onContinue={(ready) => (ready ? onDone() : onClose())}
        />
      );
    case "questions":
      return (
        <SetupQuestionsScreen
          voice={voice}
          onBack={onClose}
          onSkip={onClose}
          onImport={(pasted) => writeOne(buildImportedMemoryFile(pasted, fileStamp(new Date())))}
          onSave={async (answers) => {
            const error = await writeOne(buildQuickAnswersFile(answers, fileStamp(new Date())));
            if (error === null) {
              onDone(quickAnswerCount(answers));
            }
            return error;
          }}
        />
      );
    case "interview":
      return (
        <FirstChatPanel environmentId={environmentId} folder={folder} onStarted={() => onDone()} />
      );
    case "import":
      return (
        <MemoryImportPanel
          lead={SETUP_COPY[voice].importLead}
          onSave={async (pasted) => {
            const error = await writeOne(buildImportedMemoryFile(pasted, fileStamp(new Date())));
            if (error === null) onDone();
            return error;
          }}
        />
      );
    case "voice":
      return <VoiceStep {...step} />;
    case "level":
      return <AiLevelStep {...step} />;
    case "skills":
      return <LeonidasSkillsStep {...step} />;
    case "laya":
      return <LeonidasLayaStep {...step} />;
  }
}

function FirstChatPanel({
  environmentId,
  folder,
  onStarted,
}: {
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  readonly onStarted: () => void;
}) {
  const navigate = useNavigate();
  const { ensureFolderProject, startChat } = useOnboardingChat(environmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Have your first chat</h2>
      <p className="text-sm text-muted-foreground">
        Your AI asks about 8 short questions and saves what it learns. It takes about 5 minutes.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      ) : null}
      <Button
        disabled={busy}
        onClick={async () => {
          // A preview never makes a real chat or project.
          if (isSetupPreview()) return onStarted();
          setBusy(true);
          const project = await ensureFolderProject(folder);
          const chat = project.ok
            ? await startChat({
                projectId: project.projectId,
                title: "First chat",
                prompt: FIRST_CHAT_PROMPT,
              })
            : project;
          setBusy(false);
          if (!chat.ok) return setError(chat.message);
          onStarted();
          await navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: chat.threadId },
          });
        }}
      >
        {busy ? <Spinner /> : null}
        Start my first chat
      </Button>
    </div>
  );
}
