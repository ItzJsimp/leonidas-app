import { API_KEY_PROVIDERS, type ApiKeyProvider } from "@t3tools/shared/apiKeyProviders";
import { ExternalLinkIcon } from "lucide-react";

import { useBenchmarkUi } from "../../benchmarkUiStore";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { Button, InlineButton } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsRow } from "./settingsLayout";
import { useApiKeyField } from "./useApiKeyField";

type EnvironmentId = NonNullable<ReturnType<typeof usePrimaryEnvironmentId>>;

/**
 * One guided card per free key. Write-only: a saved key is never shown, only whether one is set.
 * Add a service by adding one entry to the provider list.
 */
export function ApiKeysSettings() {
  const environmentId = usePrimaryEnvironmentId();
  if (!environmentId) return null;
  return (
    <>
      {API_KEY_PROVIDERS.map((provider) => (
        <ApiKeyRow key={provider.id} environmentId={environmentId} provider={provider} />
      ))}
    </>
  );
}

function ApiKeyRow({
  environmentId,
  provider,
}: {
  readonly environmentId: EnvironmentId;
  readonly provider: ApiKeyProvider;
}) {
  const { saved, draft, setDraft, busy, testResult, save, test } = useApiKeyField(
    environmentId,
    provider,
  );
  const openKeyDialog = useBenchmarkUi((state) => state.openKeyDialog);

  return (
    <SettingsRow
      title={`${provider.label} key`}
      description={
        <>
          {provider.purpose} {provider.freeTierNote}
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            {provider.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <InlineButton
              render={<a href={provider.keyUrl} target="_blank" rel="noreferrer noopener" />}
            >
              Open page
              <ExternalLinkIcon aria-hidden className="size-3" />
            </InlineButton>
            <span className="text-muted-foreground">{provider.keyUrl}</span>
            {provider.id === "artificialAnalysis" ? (
              <InlineButton onClick={openKeyDialog}>Set up with a guide</InlineButton>
            ) : null}
          </span>
          <span className="mt-1 block" role="status">
            {testResult ? testResult.message : saved ? "A key is saved." : "No key saved."}
          </span>
        </>
      }
      control={
        <form
          className="flex w-full flex-wrap gap-2 sm:w-80"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) void save(draft.trim());
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            size="sm"
            aria-label={`${provider.label} key`}
            placeholder={saved ? "Saved. Type a new key to replace it." : "Paste your key"}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            size="xs"
            variant="outline"
            disabled={busy || (!saved && !draft.trim())}
            onClick={() => void test()}
          >
            Test key
          </Button>
          {saved && !draft ? (
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void save("")}>
              Remove
            </Button>
          ) : (
            <Button type="submit" size="xs" disabled={!draft.trim() || busy}>
              Save
            </Button>
          )}
        </form>
      }
    />
  );
}
