import { useCallback } from "react";
import { ensureClientSettingsHydrated, persistClientSettingsUpdate } from "../hooks/useSettings";

export async function completeOnboarding(): Promise<void> {
  await ensureClientSettingsHydrated();
  const onboardingCompletedAt = new Date().toISOString();
  await persistClientSettingsUpdate((current) => ({ ...current, onboardingCompletedAt }));
}

/**
 * Marks first-run onboarding finished (or skipped) so FirstRunGate never
 * routes to the welcome wizard again. The gate itself lives in
 * `components/onboarding/FirstRunGate.tsx`.
 */
export function useCompleteOnboarding(): () => Promise<void> {
  return useCallback(async () => {
    await ensureClientSettingsHydrated();
    const onboardingCompletedAt = new Date().toISOString();
    await persistClientSettingsUpdate((current) => ({ ...current, onboardingCompletedAt }));
  }, []);
}
