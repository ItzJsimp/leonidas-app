import type { ApiKeyProvider } from "@t3tools/shared/apiKeyProviders";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import type { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

type EnvironmentId = NonNullable<ReturnType<typeof usePrimaryEnvironmentId>>;

/**
 * State and actions for one provider key. Settings and the first-run wizard both use it, so a key
 * saved in one place shows as saved in the other. The saved key never reaches the client: `saved`
 * only says whether one is set.
 */
export function useApiKeyField(environmentId: EnvironmentId, provider: ApiKeyProvider) {
  const saved = useEnvironmentSettings(environmentId, (s) => s[provider.settingKey]) !== "";
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: `save ${provider.label} key`,
  });
  const testKey = useAtomCommand(serverEnvironment.testApiKey, {
    label: `test ${provider.label} key`,
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async (value: string) => {
    setBusy(true);
    try {
      const result = await updateSettings({
        environmentId,
        input: { patch: { [provider.settingKey]: value } },
      });
      if (result._tag === "Success") {
        setDraft("");
        setTestResult(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async (): Promise<{ ok: boolean; message: string }> => {
    setBusy(true);
    setTestResult(null);
    try {
      const result = await testKey({
        environmentId,
        input: { providerId: provider.id, ...(draft.trim() ? { key: draft.trim() } : {}) },
      });
      const outcome =
        result._tag === "Success"
          ? result.value
          : { ok: false, message: "The test did not run. Try again." };
      setTestResult(outcome);
      return outcome;
    } finally {
      setBusy(false);
    }
  };

  return { saved, draft, setDraft, busy, testResult, save, test };
}
