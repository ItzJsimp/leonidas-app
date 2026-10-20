import { useEffect, useRef, useState } from "react";

import { OPEN_GUIDE_EVENT } from "./guideEvents";
import { useAiLevelServerSync } from "../../onboarding/aiLevelSync";
import { EnvironmentId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useGuidanceProfile } from "../../onboarding/useGuidanceProfile";
import { useOnboardingChat } from "../../onboarding/useOnboardingChat";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { AIOS_FOLDER_STORAGE_KEY, DEFAULT_AIOS_FOLDER } from "../../onboarding/leonidasSetup.logic";
import {
  AI_LEVELS,
  decodeAiLevel,
  availableTips,
  dailyChallenge,
  dueWeeklyCheck,
  completeWeeklyCheck,
  guidanceDay,
  recordGuidanceAction,
  resetGuidance,
  WEEKLY_QUESTIONS,
} from "../../onboarding/guidance.logic";
import { subscribeGuidanceActions } from "../../onboarding/guidanceActions";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../ui/dialog";
import { PRIMER_CARDS } from "../../onboarding/primer.logic";
import { Radio, RadioGroup } from "../ui/radio-group";

function useGuidanceClock(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(new Date());
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(update, Math.max(1, nextMidnight.getTime() - Date.now()));
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
    };
  }, [active, now]);
  return now;
}

export function GuidanceCoach() {
  const params = useParams({ strict: false });
  const primary = usePrimaryEnvironmentId();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [folder] = useLocalStorage(AIOS_FOLDER_STORAGE_KEY, DEFAULT_AIOS_FOLDER, Schema.String);
  const environmentId = params.environmentId ? EnvironmentId.make(params.environmentId) : primary;
  if (!environmentId || pathname === "/welcome") return null;
  return (
    <ConnectedGuidanceCoach
      key={`${environmentId}:${folder}`}
      environmentId={environmentId}
      pathname={pathname}
      folder={folder}
    />
  );
}

function ConnectedGuidanceCoach({
  environmentId,
  pathname,
  folder,
}: {
  environmentId: EnvironmentId;
  pathname: string;
  folder: string;
}) {
  const [profile, setProfile] = useGuidanceProfile(environmentId);
  useAiLevelServerSync(environmentId, profile, setProfile);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_GUIDE_EVENT, show);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, show);
  }, []);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmExplain, setConfirmExplain] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [dismissedDay, setDismissedDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const navigate = useNavigate();
  const chat = useOnboardingChat(environmentId);
  const now = useGuidanceClock(profile?.active === true && !profile.paused);
  useEffect(() => {
    if (!profile?.active || profile.paused) return;
    return subscribeGuidanceActions(({ environmentId: target, action }) => {
      if (target === environmentId)
        setProfile((current) =>
          current ? recordGuidanceAction(current, action, new Date()) : null,
        );
    });
  }, [environmentId, profile?.active, profile?.paused, setProfile]);
  if (!profile) return null;
  const day = guidanceDay(profile, now);
  const screen = pathname.startsWith("/settings")
    ? "settings"
    : pathname.startsWith("/tasks")
      ? "tasks"
      : "chat";
  const tip = availableTips(profile, screen, now)[0];
  const challenge = dailyChallenge(profile, now);
  const week = dueWeeklyCheck(profile, now);
  const explain = async () => {
    if (!tip || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const project = await chat.ensureFolderProject(folder);
      if (!active.current) return;
      if (!project.ok) {
        setError(project.message);
        return;
      }
      const result = await chat.startChat({
        projectId: project.projectId,
        title: `Explain: ${tip.title}`,
        runtimeMode: "approval-required",
        interactionMode: "plan",
        prompt: [
          `Explain this Leonidas feature for an AI user at the ${profile.level} level.`,
          `Feature: ${tip.title}. ${tip.text}`,
          "Give one short example and one action to try. Use fewer than 150 words.",
          "This is an explanation only. Do not change files or run commands.",
        ].join("\n\n"),
      });
      if (!active.current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setConfirmExplain(false);
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, result.threadId)),
      });
    } catch {
      if (active.current)
        setError("The explanation could not start. Reconnect your AI and try again.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <>
      {/* Only the daily tip shows here. A standing Guide button left an empty strip under the list. */}
      {tip && dismissedDay !== day && !open ? (
        <aside aria-label="Learning guide" className="shrink-0 border-t p-2">
          <div className="space-y-2 p-2 text-sm">
            <p className="font-medium">{tip.title}</p>
            <p className="text-muted-foreground">{tip.text}</p>
            <div className="flex justify-between gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setDismissedDay(day)}>
                Dismiss tip
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                Open guide
              </Button>
            </div>
          </div>
        </aside>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Your guide</DialogTitle>
            <DialogDescription>
              Written tips use no AI credits. Your progress stays in this browser profile for this
              computer and AIOS folder.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-5">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">AI experience</legend>
                <RadioGroup
                  value={profile.level}
                  onValueChange={(value) =>
                    setProfile({
                      ...profile,
                      level: decodeAiLevel(value),
                    })
                  }
                >
                  {AI_LEVELS.map((level) => (
                    <label key={level.id} className="flex min-h-8 items-start gap-3 text-sm">
                      <Radio value={level.id} />
                      <span>
                        <span className="block font-medium">{level.label}</span>
                        <span className="text-muted-foreground">{level.description}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Basics: models, effort, skills
                </summary>
                <div className="mt-2 space-y-3">
                  {PRIMER_CARDS.map((card) => (
                    <section key={card.id}>
                      <h3 className="font-medium">{card.title}</h3>
                      <p className="text-muted-foreground">{card.body}</p>
                    </section>
                  ))}
                </div>
              </details>
              {!profile.active && (
                <p className="text-sm">
                  Your guide starts after the file tour and your first useful result.
                </p>
              )}
              {profile.active && (
                <p role="status" className="text-sm">
                  {profile.paused
                    ? "Guidance is paused."
                    : day >= 30
                      ? "Your first thirty days are complete. Only new-feature tips will appear."
                      : `Day ${day + 1} of 30. Tips retire after three successful uses.`}
                </p>
              )}
              {challenge && (
                <section className="space-y-2 text-sm">
                  <h2 className="font-medium">Today's practice</h2>
                  <p>{challenge.title}. Complete the action in the app.</p>
                  <p role="status">
                    {profile.completedDays.includes(day)
                      ? "Today's practice is complete."
                      : "Leonidas marks this complete when the action succeeds."}
                  </p>
                </section>
              )}
              {tip && (
                <section className="space-y-2 text-sm">
                  <h2 className="font-medium">{tip.title}</h2>
                  <p>{tip.text}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!chat.canOperate}
                    onClick={() => setConfirmExplain(true)}
                  >
                    Explain with AI
                  </Button>
                </section>
              )}
              {confirmExplain && (
                <section className="space-y-2 text-sm">
                  <p>
                    Use {chat.providerName ?? "your connected AI"} with{" "}
                    {chat.modelName ?? "its default model"} for one short reply? This uses your
                    plan. API charges depend on your account.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy} onClick={() => void explain()}>
                      {busy ? "Starting explanation..." : "Start AI explanation"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmExplain(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </section>
              )}
              {week !== null && (
                <section className="space-y-4">
                  <h2 className="text-sm font-medium">Week {week}: five questions</h2>
                  {WEEKLY_QUESTIONS.map((question, index) => (
                    <fieldset key={question.question} className="space-y-2 text-sm">
                      <legend>{question.question}</legend>
                      <RadioGroup
                        value={answers[index] === undefined ? "" : String(answers[index])}
                        onValueChange={(value) =>
                          setAnswers((current) => {
                            const next = [...current];
                            next[index] = Number(value);
                            return next;
                          })
                        }
                      >
                        {question.options.map((option, choice) => (
                          <label key={option} className="flex min-h-8 items-start gap-2 py-1">
                            <Radio value={String(choice)} />
                            <span>{option}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    </fieldset>
                  ))}
                  <Button
                    type="button"
                    disabled={WEEKLY_QUESTIONS.some((_, index) => answers[index] === undefined)}
                    onClick={() => {
                      setProfile(completeWeeklyCheck(profile, answers, now));
                      setAnswers([]);
                    }}
                  >
                    Save weekly check
                  </Button>
                </section>
              )}
              {profile.weeklyResults.length > 0 && (
                <p className="text-sm">
                  Last weekly check: {profile.weeklyResults.at(-1)?.score} of 5 correct.
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProfile({ ...profile, paused: !profile.paused })}
                >
                  {profile.paused ? "Resume guidance" : "Pause guidance"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmReset(true)}>
                  Reset progress
                </Button>
              </div>
              {confirmReset && (
                <section className="space-y-2 text-sm">
                  <p>
                    Reset practice, tips, and weekly checks for this AIOS? Your selected level and
                    AIOS files stay the same.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        setProfile({
                          ...resetGuidance(profile, new Date()),
                          active: profile.active,
                        });
                        setAnswers([]);
                        setDismissedDay(null);
                        setConfirmReset(false);
                      }}
                    >
                      Reset this guide
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>
                      Keep progress
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
