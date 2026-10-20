import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef, useState } from "react";

import { buildThreadRouteParams } from "../../threadRoutes";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  buildAiosFoldersCommand,
  describeAiosFolder,
  joinAiosFolder,
  splitAiosFolder,
  type AiosFolderNotice,
} from "../../onboarding/aiosFolders.logic";
import { OWN_YOUR_BRAIN_LINE } from "../../onboarding/ownYourBrain";
import { useFolderInspection } from "../../onboarding/useFolderInspection";
import { useOnboardingChat } from "../../onboarding/useOnboardingChat";
import {
  AIOS_FOLDER_STORAGE_KEY,
  AIOS_PRESET,
  buildAiosSetupPrompt,
  DEFAULT_AIOS_FOLDER,
  LEONIDAS_GOALS_STORAGE_KEY,
  LeonidasGoalsSchema,
  normalizeGoalIds,
} from "../../onboarding/leonidasSetup.logic";
import { Button } from "../ui/button";
import { AiosInterviewForm } from "./AiosInterviewForm";
import { FolderCheckNotice } from "./FolderCheckNotice";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { ScrollArea } from "../ui/scroll-area";
import { PIN_TIP } from "./pinTip";

type AiosMode = "interview" | "prompt" | "run";

export function LeonidasAiosStep({
  environmentId,
  onBack,
  onContinue,
  onLeave,
}: {
  readonly environmentId: EnvironmentId | undefined;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  /** Called before the setup chat opens, so the wizard can finish first. */
  readonly onLeave?: () => void | Promise<unknown>;
}) {
  const [chosenMode, setMode] = useState<AiosMode | null>(null);
  const navigate = useNavigate();
  const { canOperate, ensureFolderProject, startChat } = useOnboardingChat(environmentId);
  // The typed interview needs no AI account, so it leads. The AI chat stays one click away.
  const mode = chosenMode ?? "interview";
  const [storedFolder, setStoredFolder] = useLocalStorage(
    AIOS_FOLDER_STORAGE_KEY,
    DEFAULT_AIOS_FOLDER,
    Schema.String,
  );
  // Two inputs, one stored path: the other onboarding steps read the joined folder.
  const [parts, setParts] = useState(() => splitAiosFolder(storedFolder || DEFAULT_AIOS_FOLDER));
  const folder = joinAiosFolder(parts.location, parts.name);
  const updateParts = (next: { location: string; name: string }) => {
    setParts(next);
    setFolderNotice(null);
    const joined = joinAiosFolder(next.location, next.name);
    if (joined !== null) setStoredFolder(joined);
  };
  const [editFolder, setEditFolder] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [stored] = useLocalStorage(LEONIDAS_GOALS_STORAGE_KEY, [], LeonidasGoalsSchema);
  const prompt = buildAiosSetupPrompt(normalizeGoalIds(stored));
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  // Its own copy state, so copying the command does not mark the prompt as copied.
  const noChat = useCopyToClipboard();
  const folderCommand = buildAiosFoldersCommand(folder ?? DEFAULT_AIOS_FOLDER);

  const inspectFolder = useFolderInspection(environmentId);
  const [folderNotice, setFolderNotice] = useState<AiosFolderNotice | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const checkThenStart = async () => {
    if (!environmentId || folder === null) return;
    setStarting(true);
    setStartError(null);
    const inspection = await inspectFolder(
      folder,
      AIOS_PRESET.filter((entry) => !entry.path.endsWith("/")).map((entry) => entry.path),
    );
    const notice = describeAiosFolder(inspection);
    if (notice !== null) {
      setFolderNotice(notice);
      setStarting(false);
      return;
    }
    await startSetupChat();
  };

  const startSetupChat = async () => {
    if (!environmentId || folder === null) return;
    setFolderNotice(null);
    setStarting(true);
    setStartError(null);
    const project = await ensureFolderProject(folder);
    if (!project.ok) {
      setStartError(project.message);
      setStarting(false);
      return;
    }
    const chat = await startChat({
      projectId: project.projectId,
      title: "Set up my AI memory",
      prompt: buildAiosSetupPrompt(normalizeGoalIds(stored), { inCurrentFolder: true }),
    });
    if (!chat.ok) {
      setStartError(chat.message);
      setStarting(false);
      return;
    }
    await onLeave?.();
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, chat.threadId)),
    });
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Give your AI a memory
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        This step is optional. Your AI starts every chat knowing who you are and what you work on.
        It reads a few plain text files first (an “AIOS”). Leonidas can build them with you.
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{OWN_YOUR_BRAIN_LINE}</p>
      <ScrollArea scrollFade className="mt-5 h-auto max-h-[min(32rem,55dvh)]">
        <div className="space-y-4 pr-3">
          <ul className="space-y-1.5">
            {AIOS_PRESET.map((entry) => (
              <li key={entry.path} className="flex items-baseline gap-3">
                <span className="w-24 shrink-0 font-mono text-xs">{entry.path}</span>
                <span className="text-xs text-muted-foreground">{entry.purpose}</span>
              </li>
            ))}
          </ul>
          {mode === "prompt" ? (
            <div className="space-y-2">
              <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {prompt}
              </pre>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Paste this message into the AI you already use.
                </p>
                <Button
                  size="compact"
                  variant="outline"
                  onClick={() => copyToClipboard(prompt, undefined)}
                >
                  {isCopied ? <CheckIcon /> : <CopyIcon />}
                  {isCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
          {mode === "run" || mode === "interview" ? (
            <div className="space-y-2">
              {editFolder ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">Folder location</span>
                    <Input
                      value={parts.location}
                      onChange={(event) => updateParts({ ...parts, location: event.target.value })}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">Folder name</span>
                    <Input
                      ref={folderInputRef}
                      value={parts.name}
                      onChange={(event) => updateParts({ ...parts, name: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {folder === null
                  ? "Enter a folder location and a folder name."
                  : `Your AI memory goes in ${folder}. ~ means your user folder.`}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setEditFolder((open) => !open)}
                >
                  {editFolder ? "Done" : "Change"}
                </button>
              </p>
              {mode === "interview" ? (
                <AiosInterviewForm
                  environmentId={environmentId}
                  folder={folder}
                  onDone={onContinue}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    disabled={!canOperate || starting || folder === null}
                    onClick={() => void checkThenStart()}
                  >
                    {starting ? <Spinner /> : null}
                    Start the setup chat
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {canOperate
                      ? "Your AI builds the folder with you."
                      : "Add an AI account first, then come back."}
                  </p>
                </div>
              )}
              {folderNotice ? (
                <FolderCheckNotice
                  tone={folderNotice.tone}
                  lines={folderNotice.lines}
                  confirmLabel={folderNotice.tone === "info" ? "Continue" : undefined}
                  cancelLabel={folderNotice.tone === "info" ? "Pick another folder" : undefined}
                  onConfirm={() => void startSetupChat()}
                  onCancel={() => {
                    setEditFolder(true);
                    setFolderNotice(null);
                    folderInputRef.current?.focus();
                  }}
                />
              ) : null}
              {startError ? (
                <p className="text-xs text-destructive-foreground">{startError}</p>
              ) : null}
            </div>
          ) : null}
          {mode !== "interview" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Do you not want a chat? Paste this into PowerShell to create the same folders.
              </p>
              <div className="flex items-start justify-between gap-3">
                <pre className="min-w-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {folderCommand}
                </pre>
                <Button
                  size="compact"
                  variant="outline"
                  onClick={() => noChat.copyToClipboard(folderCommand, undefined)}
                >
                  {noChat.isCopied ? <CheckIcon /> : <CopyIcon />}
                  {noChat.isCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3">
            {mode === "interview" ? (
              <Button
                size="xs"
                variant="ghost-muted"
                onClick={() => setMode(canOperate ? "run" : "prompt")}
              >
                Build it with AI instead
              </Button>
            ) : (
              <>
                <Button size="xs" variant="ghost-muted" onClick={() => setMode("interview")}>
                  Answer the questions myself
                </Button>
                <Button
                  size="xs"
                  variant="ghost-muted"
                  onClick={() => setMode(mode === "run" ? "prompt" : "run")}
                >
                  {mode === "run" ? "Copy the setup message for another AI" : "Use the setup chat"}
                </Button>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
      <p className="mt-4 text-xs text-muted-foreground">{PIN_TIP}</p>
      <div className="mt-2 flex items-center justify-between">
        <Button variant="ghost-muted" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" onClick={onContinue}>
          Skip for now
        </Button>
      </div>
    </>
  );
}
