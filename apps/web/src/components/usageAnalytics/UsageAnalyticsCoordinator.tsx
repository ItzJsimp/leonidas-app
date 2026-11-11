import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useClientSettings, useClientSettingsHydrationStatus } from "../../hooks/useSettings";
import { sendUsageEvent } from "../../lib/usageAnalytics/sendUsageEvent";
import { useUsageAnalyticsStore } from "../../lib/usageAnalytics/usageAnalyticsStore";
import { daysSince, featureIdFromPathname } from "../../lib/usageAnalytics/usageEvents";
import { APP_VERSION } from "../../branding";
import { useEnvironmentProviders, usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { aiosUsageShapeQuery } from "../../state/taskBoard";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { UsageAnalyticsConsentDialog } from "./UsageAnalyticsConsentDialog";
import { shouldAskUsageConsent } from "./usageConsentGate";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  EMPTY_SETUP_STATE,
  SETUP_STATE_STORAGE_KEY,
  SetupStateSchema,
} from "../../onboarding/setupState.logic";

/** Sends the five core usage events once the user has said Yes. */
export function UsageAnalyticsCoordinator() {
  const consent = useUsageAnalyticsStore((state) => state.consent);
  const pathname = useLocation({ select: (location) => location.pathname });
  const hydrated = useClientSettingsHydrationStatus() === "ready";
  const onboardingCompletedAt = useClientSettings((settings) => settings.onboardingCompletedAt);
  const [setup] = useLocalStorage(SETUP_STATE_STORAGE_KEY, EMPTY_SETUP_STATE, SetupStateSchema);
  const lastFeature = useRef<string | null>(null);
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const aiosShape = useEnvironmentQuery(
    consent === "granted" && environmentId && scopeReady
      ? aiosUsageShapeQuery({ environmentId, input: scope })
      : null,
  ).data;
  const aiosShapeSent = useRef(false);
  const providersSent = useRef(false);
  const providersByEnvironment = useEnvironmentProviders();
  const connectedDrivers = (environmentId ? providersByEnvironment.get(environmentId) : undefined)
    ?.filter((provider) => provider.enabled && provider.installed)
    .map((provider) => String(provider.driver));

  // providers_connected: driver kinds from a fixed list, once per launch.
  useEffect(() => {
    if (consent !== "granted" || providersSent.current || !connectedDrivers?.length) return;
    providersSent.current = true;
    sendUsageEvent("providers_connected", { providers: connectedDrivers });
  }, [consent, connectedDrivers]);

  // ui_element_clicked: only elements tagged data-usage-id and listed in the allowlist.
  useEffect(() => {
    if (consent !== "granted") return;
    const onClick = (event: MouseEvent) => {
      const tagged = (event.target as Element | null)?.closest?.("[data-usage-id]");
      const element = tagged?.getAttribute("data-usage-id");
      if (element) sendUsageEvent("ui_element_clicked", { element });
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [consent]);

  // aios_shape: counts only, once per launch.
  useEffect(() => {
    if (consent !== "granted" || aiosShape === null || aiosShapeSent.current) return;
    aiosShapeSent.current = true;
    sendUsageEvent("aios_shape", {
      aios_detected: aiosShape.aiosDetected ? 1 : 0,
      skills_count: aiosShape.skillsCount,
      task_cards_count: aiosShape.taskCardsCount,
      memory_files_present: aiosShape.memoryFilesPresent ? 1 : 0,
    });
  }, [consent, aiosShape]);

  // install_first_run and app_opened: once per consented launch.
  useEffect(() => {
    if (consent !== "granted") return;
    const state = useUsageAnalyticsStore.getState();
    if (!state.firstRunSent) {
      sendUsageEvent("install_first_run");
      state.markFirstRunSent();
    }
    // A session that never closed, or a new version, tells us about crashes and updates.
    if (state.sessionOpen) sendUsageEvent("crash");
    if (state.lastAppVersion !== "" && state.lastAppVersion !== APP_VERSION) {
      sendUsageEvent("update_installed");
    }
    state.setLastAppVersion(APP_VERSION);
    state.setSessionOpen(true);
    const closeSession = () => useUsageAnalyticsStore.getState().setSessionOpen(false);
    window.addEventListener("pagehide", closeSession);
    sendUsageEvent("app_opened", {
      days_since_install: daysSince(state.installedAt, Date.now()),
      launch_count: state.countLaunch(),
    });
    return () => window.removeEventListener("pagehide", closeSession);
  }, [consent]);

  // session_duration: visible seconds, sent each time the window is hidden or closed.
  useEffect(() => {
    if (consent !== "granted") return;
    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    const flush = () => {
      if (visibleSince === null) return;
      sendUsageEvent("session_duration", { seconds: (Date.now() - visibleSince) / 1000 });
      visibleSince = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visibleSince ??= Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [consent]);

  // setup_completed: time from first launch to the end of the welcome wizard.
  useEffect(() => {
    if (consent !== "granted" || !hydrated || onboardingCompletedAt === null) return;
    const state = useUsageAnalyticsStore.getState();
    if (state.setupSent) return;
    const finishedAt = Date.parse(String(onboardingCompletedAt));
    if (Number.isFinite(finishedAt)) {
      state.markSetupSent(finishedAt);
      sendUsageEvent("setup_completed", {
        seconds_to_setup: (finishedAt - state.installedAt) / 1000,
      });
    } else state.markSetupSent(Date.now());
  }, [consent, hydrated, onboardingCompletedAt]);

  // feature_used: one event when the user moves to a different area of the app.
  useEffect(() => {
    if (consent !== "granted") return;
    const feature = featureIdFromPathname(pathname);
    if (feature === null || feature === lastFeature.current) return;
    lastFeature.current = feature;
    sendUsageEvent("feature_used", { feature });
  }, [consent, pathname]);

  const ask = shouldAskUsageConsent({
    consent,
    hydrated,
    onboardingCompletedAt: onboardingCompletedAt === null ? null : String(onboardingCompletedAt),
    setupStarted: setup.startedAt !== null,
    tourSeen: setup.tourSeen,
  });
  return ask ? <UsageAnalyticsConsentDialog /> : null;
}
