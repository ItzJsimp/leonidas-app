import { useEnvironmentProviders } from "../../state/environments";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { DraftInput } from "../ui/draft-input";
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldDecrement,
  NumberFieldIncrement,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import {
  SettingsRow,
  SettingResetButton,
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useScopedSettingsWriteAllowed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";

export function PromptPredictionSettings() {
  const settings = useScopedSettings();
  const update = useUpdateScopedSettings();
  const writable = useScopedSettingsWriteAllowed();
  const { environment } = useSettingsScope();
  const providersByEnvironment = useEnvironmentProviders();
  const providers = (
    (environment ? providersByEnvironment.get(environment.environmentId) : undefined) ??
    EMPTY_SERVER_PROVIDERS
  ).filter((provider) => provider.supportsTextGeneration !== false && provider.driver !== "muse");
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings, null),
  );
  const selection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection:
        settings.promptPredictionModelSelection ?? settings.textGenerationModelSelection,
    },
    providers,
  );
  const options = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection.instanceId,
    selection.model,
  );
  const disabledReason = useScopedModelDisabledReason(settings, entries);
  const mixedMode = useScopedSettingsMixed(["promptPredictionMode"]);
  const mixedLocalModel = useScopedSettingsMixed(["promptPredictionLocalModel"]);
  const mixedCloudModel = useScopedSettingsMixed(["promptPredictionModelSelection"]);
  const labels = {
    local: "History only",
    "local-model": "Local model (Ollama)",
    cloud: "Online model",
  };

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["promptPredictionMode"]}
        {...searchableSetting("prompt-prediction-source")}
        description="History only does not call a model. Local model runs on this computer. Online model uses the usage limit or the API bill of the chosen AI account."
        resetAction={
          settings.promptPredictionMode !== "local" ? (
            <SettingResetButton
              label="prediction source"
              onClick={() => update({ promptPredictionMode: "local" })}
            />
          ) : null
        }
        control={
          <Select
            value={settings.promptPredictionMode}
            disabled={!writable}
            onValueChange={(mode) => {
              if (mode === "local" || mode === "local-model" || mode === "cloud")
                update({ promptPredictionMode: mode });
            }}
          >
            <SelectTrigger size="sm" aria-label="Prediction source">
              <SelectValue>
                {mixedMode ? "Mixed" : labels[settings.promptPredictionMode]}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="local">History only</SelectItem>
              <SelectItem value="local-model">Local model (Ollama)</SelectItem>
              <SelectItem value="cloud">Cloud model</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      {settings.promptPredictionMode === "local-model" ? (
        <SettingsRow
          serverScoped
          settingKeys={["promptPredictionLocalModel"]}
          {...searchableSetting("prompt-prediction-local-model")}
          description="Enter the name of a model that is installed in Ollama on this computer. If the model is not available, Leonidas uses history only."
          resetAction={
            settings.promptPredictionLocalModel ? (
              <SettingResetButton
                label="local prediction model"
                onClick={() => update({ promptPredictionLocalModel: "" })}
              />
            ) : null
          }
          control={
            <DraftInput
              disabled={!writable}
              value={mixedLocalModel ? "" : settings.promptPredictionLocalModel}
              onCommit={(model) => update({ promptPredictionLocalModel: model })}
              placeholder={mixedLocalModel ? "Mixed" : "Installed model name"}
              spellCheck={false}
              aria-label="Local prediction model"
              maxLength={200}
            />
          }
        />
      ) : null}
      {settings.promptPredictionMode === "cloud" ? (
        <>
          <SettingsRow
            serverScoped
            settingKeys={["promptPredictionModelSelection"]}
            {...searchableSetting("prompt-prediction-cloud-model")}
            description={
              settings.promptPredictionModelSelection
                ? "A model only for message suggestions. Its AI account pays for each suggestion, also the ones you do not use."
                : "Now uses the model for writing text. Choose a smaller model to use less."
            }
            resetAction={
              settings.promptPredictionModelSelection ? (
                <SettingResetButton
                  label="prediction model"
                  onClick={() => update({ promptPredictionModelSelection: null })}
                />
              ) : null
            }
            control={
              <ProviderModelPicker
                environmentId={environment?.environmentId ?? null}
                activeInstanceId={selection.instanceId}
                model={selection.model}
                lockedProvider={null}
                instanceEntries={entries}
                modelOptionsByInstance={options}
                disabled={!writable || !entries.some((entry) => entry.enabled && entry.isAvailable)}
                triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                triggerAriaLabel="Online prediction model"
                {...(mixedCloudModel ? { triggerLabel: "Mixed" } : {})}
                getModelDisabledReason={disabledReason}
                onInstanceModelChange={(instanceId, model) => {
                  const reason = disabledReason(instanceId, model);
                  if (reason) {
                    toastManager.add({
                      type: "error",
                      title: "Prediction model not saved",
                      description: reason,
                    });
                    return;
                  }
                  update({
                    promptPredictionModelSelection: createModelSelection(instanceId, model),
                  });
                }}
              />
            }
          />
          <SettingsRow
            serverScoped
            settingKeys={["promptPredictionCloudRequestLimit"]}
            {...searchableSetting("prompt-prediction-cloud-limit")}
            description="Most online predictions per hour for all connected devices. Zero turns online predictions off. The count starts again when Leonidas restarts."
            resetAction={
              settings.promptPredictionCloudRequestLimit !==
              DEFAULT_UNIFIED_SETTINGS.promptPredictionCloudRequestLimit ? (
                <SettingResetButton
                  label="online prediction limit"
                  onClick={() =>
                    update({
                      promptPredictionCloudRequestLimit:
                        DEFAULT_UNIFIED_SETTINGS.promptPredictionCloudRequestLimit,
                    })
                  }
                />
              ) : null
            }
            control={
              <NumberField
                value={settings.promptPredictionCloudRequestLimit}
                min={0}
                max={120}
                step={1}
                size="sm"
                disabled={!writable}
                onValueChange={(value) => {
                  if (value !== null)
                    update({ promptPredictionCloudRequestLimit: Math.round(value) });
                }}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement aria-label="Decrease online prediction limit" />
                  <NumberFieldInput aria-label="Online predictions per hour" />
                  <NumberFieldIncrement aria-label="Increase online prediction limit" />
                </NumberFieldGroup>
              </NumberField>
            }
          />
        </>
      ) : null}
    </>
  );
}
