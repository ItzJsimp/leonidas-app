import type { EnvironmentId, LayaSetupResult } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { ArrowRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { AIOS_FOLDER_STORAGE_KEY, DEFAULT_AIOS_FOLDER } from "../../onboarding/leonidasSetup.logic";
import { layaSetupQuery } from "../../state/laya";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

const POLL_MS = 1500;
const MODEL_SIZE = "about 560 MB";

/**
 * Explains Laya, asks first, then installs. "Not now" writes nothing and shows no error.
 * The server installs in the background; this step polls its status.
 */
export function LeonidasLayaStep({
  environmentId,
  onBack,
  onContinue,
}: {
  readonly environmentId: EnvironmentId | undefined;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) {
  const run = useAtomQueryRunner(layaSetupQuery, {
    reportFailure: false,
    reportDefect: false,
    refresh: true,
  });
  const [result, setResult] = useState<LayaSetupResult | null>(null);
  const [wantPackages, setWantPackages] = useState(false);
  const [started, setStarted] = useState(false);
  // Laya is advanced: new users see one line and Skip unless they open it.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [folder] = useLocalStorage(AIOS_FOLDER_STORAGE_KEY, DEFAULT_AIOS_FOLDER, Schema.String);
  const [wireMessage, setWireMessage] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const call = useCallback(
    async (
      action: "status" | "install" | "wire",
      installPackages: boolean,
      projectPath?: string,
    ) => {
      if (!environmentId) return null;
      try {
        const response = await run({
          environmentId,
          input: { action, installPackages, ...(projectPath ? { projectPath } : {}) },
        });
        return response._tag === "Success" ? response.value : null;
      } catch {
        return null;
      }
    },
    [environmentId, run],
  );

  // Learn what is already on this computer. Writes nothing.
  useEffect(() => {
    void call("status", false).then((value) => {
      if (alive.current && value) setResult(value);
    });
  }, [call]);

  const working = result?.status === "working";
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => {
      void call("status", false).then((value) => {
        if (alive.current && value) setResult(value);
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [working, call]);

  const start = async () => {
    setStarted(true);
    const value = await call("install", wantPackages);
    if (alive.current) {
      setResult(
        value ?? {
          status: "error",
          message: "Leonidas could not reach this computer. Try again.",
          missingPackages: [],
        },
      );
    }
  };

  const wire = async () => {
    const value = await call("wire", false, folder.trim());
    if (alive.current) setWireMessage(value?.message ?? "Leonidas could not reach this computer.");
  };

  const ready = result?.status === "ready";
  const needsPackages = result?.status === "needs-packages";

  if (!ready && !started && !showAdvanced) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Extra safety checks (advanced)
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          This is optional. Most people skip it. You can turn it on later in Settings.
        </p>
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost-muted" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowAdvanced(true)}>
              Show advanced option
            </Button>
            <Button autoFocus onClick={onContinue}>
              Skip
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {ready && !started ? "Laya safety checks are on" : "Turn on Laya safety checks"}
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        Laya is a small model that runs on your computer. It is free. It checks risky commands and
        web text before your AI acts, and it can save tokens. Nothing you type leaves your computer.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Turning it on downloads {MODEL_SIZE}. It needs Python 3.9 or newer. You can skip it now and
        turn it on later.
      </p>
      {needsPackages ? (
        <label className="mt-4 flex items-start gap-3">
          <Checkbox
            checked={wantPackages}
            onCheckedChange={(checked) => setWantPackages(checked === true)}
            disabled={working}
          />
          <span className="min-w-0 space-y-0.5">
            <span className="block text-xs">
              Install {result.missingPackages.join(", ")} with pip for your user
            </span>
            <span className="block text-xs text-muted-foreground">
              Leonidas asks first. It installs nothing without this tick.
            </span>
          </span>
        </label>
      ) : null}
      {started && result && result.message ? (
        <p
          className={
            result.status === "error" || result.status === "needs-python"
              ? "mt-4 text-xs text-destructive-foreground"
              : "mt-4 text-xs text-muted-foreground"
          }
          role="status"
        >
          {result.message}
        </p>
      ) : null}
      {ready && !started ? (
        <p className="mt-4 text-xs text-muted-foreground" role="status">
          {result.message}
        </p>
      ) : null}
      {ready ? (
        <div className="mt-4 space-y-1.5">
          <Button size="sm" variant="outline" onClick={() => void wire()}>
            Use Laya in my AIOS folder
          </Button>
          <p className="text-xs text-muted-foreground" role="status">
            {wireMessage ?? `Adds two small files to ${folder.trim()}. You can skip this.`}
          </p>
        </div>
      ) : null}
      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="ghost-muted" onClick={onBack} disabled={working}>
          Back
        </Button>
        <div className="flex gap-2">
          {ready ? null : (
            <Button variant="ghost" onClick={onContinue} disabled={working}>
              Not now
            </Button>
          )}
          {ready ? (
            <Button autoFocus onClick={onContinue}>
              Continue
              <ArrowRightIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              autoFocus
              onClick={() => void start()}
              disabled={working || !environmentId || (needsPackages && !wantPackages)}
            >
              {working ? "Installing…" : started ? "Try again" : "Turn on Laya"}
              <ArrowRightIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
