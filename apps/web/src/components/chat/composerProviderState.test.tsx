import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftId } from "../../composerDraftStore";
import {
  ProviderDriverKind,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { getProviderOptionDescriptors } from "@t3tools/shared/model";
import { getProviderModelCapabilities } from "../../providerModels";
import {
  getComposerPromptInjectionState,
  getComposerProviderState,
  withImplicitFastModeDefault,
} from "../../composerProviderState";
import { ProviderDownshiftNotice, renderProviderReasoningColumn } from "./composerProviderState";

// Everything in composerProviderState is now data-driven by the model's
// optionDescriptors, so these tests use a single synthetic provider/model and
// vary only the descriptor shape per scenario.

const PROVIDER: ProviderDriverKind = ProviderDriverKind.make("codex");
const MODEL = "test-model";

function selectDescriptor(
  id: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
  promptInjectedValues?: ReadonlyArray<string>,
): Extract<ProviderOptionDescriptor, { type: "select" }> {
  const defaultId = options.find((option) => option.isDefault)?.id;
  return {
    id,
    label: id,
    type: "select",
    options: [...options],
    ...(defaultId ? { currentValue: defaultId } : {}),
    ...(promptInjectedValues && promptInjectedValues.length > 0
      ? { promptInjectedValues: [...promptInjectedValues] }
      : {}),
  };
}

function booleanDescriptor(
  id: string,
  currentValue?: boolean,
): Extract<ProviderOptionDescriptor, { type: "boolean" }> {
  return {
    id,
    label: id,
    type: "boolean",
    ...(typeof currentValue === "boolean" ? { currentValue } : {}),
  };
}

function modelWith(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
): ReadonlyArray<ServerProviderModel> {
  return [
    { slug: MODEL, name: MODEL, isCustom: false, capabilities: { optionDescriptors: descriptors } },
  ];
}

function selections(
  ...entries: Array<[string, string | boolean]>
): ReadonlyArray<ProviderOptionSelection> {
  return entries.map(([id, value]) => ({ id, value }));
}

const ULTRATHINK_FRAME_CLASSES = {
  composerFrameClassName: "ultrathink-frame",
  composerSurfaceClassName: "shadow-[0_0_0_1px_rgba(255,255,255,0.07)_inset]",
  modelPickerIconClassName: "ultrathink-chroma",
} as const;

describe("getComposerProviderState", () => {
  it("derives a stable prompt injection state for ordinary prompt edits", () => {
    expect(getComposerPromptInjectionState("Investigate this failure")).toBe("none");
    expect(getComposerPromptInjectionState("Ultrathink:\nInvestigate this failure")).toBe(
      "ultrathink",
    );
  });

  it("uses descriptor defaults for display without dispatching them as overrides", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [
          { id: "low", label: "Low" },
          { id: "high", label: "High", isDefault: true },
        ]),
      ]),
      modelOptions: undefined,
      planModeEnabled: true,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: "high",
      modelOptionsForDispatch: undefined,
      effortLabel: "High",
    });
  });

  it("lets selections override defaults and propagates them through dispatch", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [
          { id: "low", label: "Low" },
          { id: "high", label: "High", isDefault: true },
        ]),
        booleanDescriptor("fastMode"),
      ]),
      modelOptions: selections(["effort", "low"], ["fastMode", true]),
      planModeEnabled: true,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: "low",
      modelOptionsForDispatch: selections(["effort", "low"], ["fastMode", true]),
      speedIcon: "fast",
      effortLabel: "Low",
    });
  });

  it("preserves selections that match defaults so deepMerge can overwrite prior state", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [{ id: "high", label: "High", isDefault: true }]),
        booleanDescriptor("fastMode"),
      ]),
      modelOptions: selections(["effort", "high"], ["fastMode", false]),
      planModeEnabled: true,
    });

    expect(state.modelOptionsForDispatch).toEqual(
      selections(["effort", "high"], ["fastMode", false]),
    );
  });

  it("drops selections for descriptors the model does not declare", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([booleanDescriptor("thinking")]),
      modelOptions: selections(["effort", "max"], ["thinking", false]),
      planModeEnabled: true,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: null,
      modelOptionsForDispatch: selections(["thinking", false]),
    });
  });

  it("derives promptEffort from the first select descriptor and preserves all others for dispatch", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [{ id: "high", label: "High", isDefault: true }]),
        selectDescriptor("contextWindow", [
          { id: "200k", label: "200k", isDefault: true },
          { id: "1m", label: "1M" },
        ]),
        selectDescriptor("agent", [
          { id: "build", label: "Build", isDefault: true },
          { id: "plan", label: "Plan" },
        ]),
      ]),
      modelOptions: selections(["agent", "plan"]),
      planModeEnabled: true,
    });

    expect(state.promptEffort).toBe("high");
    expect(state.modelOptionsForDispatch).toEqual(selections(["agent", "plan"]));
  });

  it("drops the plan agent from dispatch when legacy plan mode is disabled", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("agent", [
          { id: "build", label: "Build", isDefault: true },
          { id: "plan", label: "Plan" },
        ]),
      ]),
      modelOptions: selections(["agent", "plan"]),
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["agent", "build"]));
  });

  it("drops the agent descriptor entirely when plan is the only option and plan mode is disabled", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("agent", [{ id: "plan", label: "Plan", isDefault: true }]),
      ]),
      modelOptions: selections(["agent", "plan"]),
      planModeEnabled: false,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: null,
      modelOptionsForDispatch: undefined,
    });
  });

  it("falls back to a surviving agent when plan was the descriptor default and plan mode is disabled", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("agent", [
          { id: "plan", label: "Plan", isDefault: true },
          { id: "research", label: "Research" },
        ]),
      ]),
      modelOptions: undefined,
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toBeUndefined();
  });

  it("returns undefined dispatch options when the model declares no descriptors", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([]),
      modelOptions: selections(["anything", "value"]),
      planModeEnabled: true,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: null,
      modelOptionsForDispatch: undefined,
    });
  });

  it("preserves explicit options when the selected model is absent from the catalog", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("opencode"),
      model: "opencode/kimi-k3",
      models: [
        {
          slug: "opencode/big-pickle",
          name: "Big Pickle",
          isCustom: false,
          capabilities: {},
        },
      ],
      modelOptions: selections(["variant", "max"], ["agent", "build"]),
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toEqual(
      selections(["variant", "max"], ["agent", "build"]),
    );
  });

  it.each(["codex", "claudeAgent", "cursor", "grok"])(
    "does not preserve unknown options for a missing %s model",
    (provider) => {
      const state = getComposerProviderState({
        provider: ProviderDriverKind.make(provider),
        model: "missing-model",
        models: modelWith([]),
        modelOptions: selections(["unknown", "value"]),
        planModeEnabled: true,
      });

      expect(state.modelOptionsForDispatch).toBeUndefined();
    },
  );

  it("preserves explicit options while the catalog is empty", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("opencode"),
      model: "opencode/kimi-k3",
      models: [],
      modelOptions: selections(["variant", "max"], ["agent", "build"]),
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toEqual(
      selections(["variant", "max"], ["agent", "build"]),
    );
  });

  it("validates options for a known model selected through a legacy alias", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("claudeAgent"),
      model: "legacy-test-model",
      models: [
        {
          slug: "test-model",
          name: "Test Model",
          aliases: ["legacy-test-model"],
          isCustom: false,
          capabilities: {
            optionDescriptors: [
              selectDescriptor("effort", [
                { id: "low", label: "Low" },
                { id: "high", label: "High", isDefault: true },
              ]),
            ],
          },
        },
      ],
      modelOptions: selections(["effort", "low"], ["unknown", "value"]),
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["effort", "low"]));
  });

  it("still drops the plan agent when an absent model has a saved plan selection", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("opencode"),
      model: "opencode/kimi-k3",
      models: [],
      modelOptions: selections(["variant", "max"], ["agent", "plan"]),
      planModeEnabled: false,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["variant", "max"]));
  });

  it("adds ultrathink class names when the prompt triggers a promptInjectedValues descriptor", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor(
          "effort",
          [
            { id: "medium", label: "Medium" },
            { id: "high", label: "High", isDefault: true },
            { id: "ultrathink", label: "Ultrathink" },
          ],
          ["ultrathink"],
        ),
      ]),
      promptInjectionState: getComposerPromptInjectionState(
        "Ultrathink:\nInvestigate this failure",
      ),
      modelOptions: selections(["effort", "medium"]),
      planModeEnabled: true,
    });

    expect(state).toEqual({
      provider: PROVIDER,
      promptEffort: "medium",
      modelOptionsForDispatch: selections(["effort", "medium"]),
      effortLabel: "Ultrathink",
      ...ULTRATHINK_FRAME_CLASSES,
    });
  });

  it("names a saved effort the model does not offer as that model's own default", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium", isDefault: true },
          { id: "xhigh", label: "Extra High" },
        ]),
      ]),
      modelOptions: selections(["effort", "max"]),
      planModeEnabled: true,
    });

    expect(state.effortLabel).toBe("Medium");
  });

  it("shows no effort label for a select that is not an effort level", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("agent", [
          { id: "build", label: "Build", isDefault: true },
          { id: "plan", label: "Plan" },
        ]),
      ]),
      modelOptions: undefined,
      planModeEnabled: true,
    });

    expect(state.effortLabel).toBeUndefined();
  });

  it("does not add ultrathink class names when the descriptor has no promptInjectedValues", () => {
    const state = getComposerProviderState({
      provider: PROVIDER,
      model: MODEL,
      models: modelWith([
        selectDescriptor("effort", [{ id: "high", label: "High", isDefault: true }]),
      ]),
      promptInjectionState: getComposerPromptInjectionState(
        "Ultrathink:\nInvestigate this failure",
      ),
      modelOptions: undefined,
      planModeEnabled: true,
    });

    expect(state).not.toHaveProperty("composerFrameClassName");
    expect(state).not.toHaveProperty("composerSurfaceClassName");
    expect(state).not.toHaveProperty("modelPickerIconClassName");
  });

  it("defaults fastMode to false when the provider reports true but the user has not selected it", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("cursor"),
      model: MODEL,
      models: modelWith([booleanDescriptor("fastMode", true)]),
      modelOptions: undefined,
      planModeEnabled: true,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["fastMode", false]));
  });

  it("keeps explicit fastMode true when the user selected Fast", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("cursor"),
      model: MODEL,
      models: modelWith([booleanDescriptor("fastMode", true)]),
      modelOptions: selections(["fastMode", true]),
      planModeEnabled: true,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["fastMode", true]));
  });

  it("keeps explicit fastMode false when the user selected Normal", () => {
    const state = getComposerProviderState({
      provider: ProviderDriverKind.make("cursor"),
      model: MODEL,
      models: modelWith([booleanDescriptor("fastMode", true)]),
      modelOptions: selections(["fastMode", false]),
      planModeEnabled: true,
    });

    expect(state.modelOptionsForDispatch).toEqual(selections(["fastMode", false]));
  });
});

describe("withImplicitFastModeDefault", () => {
  it("injects fastMode false only when the model exposes fastMode and no selection exists", () => {
    expect(
      withImplicitFastModeDefault(
        {
          optionDescriptors: [booleanDescriptor("fastMode", true)],
        },
        undefined,
      ),
    ).toEqual(selections(["fastMode", false]));

    expect(
      withImplicitFastModeDefault(
        {
          optionDescriptors: [booleanDescriptor("fastMode", true)],
        },
        selections(["fastMode", true]),
      ),
    ).toEqual(selections(["fastMode", true]));
  });

  it("does not add fastMode when the model does not expose it", () => {
    expect(
      withImplicitFastModeDefault(
        {
          optionDescriptors: [booleanDescriptor("thinking", true)],
        },
        undefined,
      ),
    ).toBeUndefined();
  });
});

describe("trait controls fastMode display", () => {
  it("resolves traits fastMode to Normal when the provider defaults to true without a user selection", () => {
    const models = modelWith([booleanDescriptor("fastMode", true)]);
    const provider = ProviderDriverKind.make("cursor");
    const caps = getProviderModelCapabilities(models, MODEL, provider);
    const resolved = withImplicitFastModeDefault(caps, undefined);
    const descriptors = getProviderOptionDescriptors({ caps, selections: resolved });
    const fastMode = descriptors.find((descriptor) => descriptor.id === "fastMode");

    expect(fastMode?.type).toBe("boolean");
    if (fastMode?.type === "boolean") {
      expect(fastMode.currentValue).toBe(false);
    }
  });
});

describe("provider traits render guards", () => {
  it("returns null when no thread target is provided", () => {
    const models = modelWith([
      selectDescriptor("effort", [{ id: "high", label: "High", isDefault: true }]),
    ]);
    const args = {
      provider: PROVIDER,
      model: MODEL,
      models,
      modelOptions: undefined,
      prompt: "",
      onPromptChange: () => {},
      planModeEnabled: true,
    };

    expect(renderProviderReasoningColumn(args)).toBeNull();
  });

  it("does not list Ultrathink as a level in the picker column", () => {
    const models = modelWith([
      selectDescriptor(
        "effort",
        [
          { id: "low", label: "Low" },
          { id: "high", label: "High", isDefault: true },
          { id: "ultrathink", label: "Ultrathink" },
        ],
        ["ultrathink"],
      ),
    ]);
    const markup = renderToStaticMarkup(
      renderProviderReasoningColumn({
        provider: PROVIDER,
        model: MODEL,
        models,
        modelOptions: undefined,
        prompt: "",
        onPromptChange: () => {},
        planModeEnabled: true,
        draftId: DraftId.make("reasoning-ultrathink"),
      }),
    );
    expect(markup).toContain("High");
    expect(markup).not.toContain("Ultrathink");
  });

  it("lists the effort levels of the model in the picker column", () => {
    const models = modelWith([
      selectDescriptor("effort", [
        { id: "low", label: "Low" },
        { id: "high", label: "High", isDefault: true },
      ]),
    ]);
    const markup = renderToStaticMarkup(
      renderProviderReasoningColumn({
        provider: PROVIDER,
        model: MODEL,
        models,
        modelOptions: undefined,
        prompt: "",
        onPromptChange: () => {},
        planModeEnabled: true,
        draftId: DraftId.make("reasoning-column"),
      }),
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("Low");
    expect(markup).toContain('aria-checked="true"');
    expect(
      renderProviderReasoningColumn({
        provider: PROVIDER,
        model: MODEL,
        models,
        modelOptions: undefined,
        prompt: "",
        onPromptChange: () => {},
        planModeEnabled: true,
      }),
    ).toBeNull();
  });
});

describe("ProviderDownshiftNotice", () => {
  const extras = {
    chatKey: "downshift-chat",
    attachmentCount: 0,
    contextTokens: 3_000,
    onSwitchModel: () => {},
  };
  const effortModel = modelWith([
    selectDescriptor("effort", [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High", isDefault: true },
      { id: "xhigh", label: "Extra High" },
    ]),
  ]);
  const haiku: ServerProviderModel = {
    slug: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    isCustom: false,
    capabilities: { optionDescriptors: [] },
  };
  const render = (
    prompt: string,
    effort: string,
    models: ReadonlyArray<ServerProviderModel> = effortModel,
  ) =>
    renderToStaticMarkup(
      <ProviderDownshiftNotice
        input={{
          provider: PROVIDER,
          model: MODEL,
          models,
          modelOptions: selections(["effort", effort]),
          prompt,
          onPromptChange: () => {},
          planModeEnabled: true,
          draftId: DraftId.make("downshift-draft"),
        }}
        extras={extras}
      />,
    );

  it("offers a lower effort on the same model for a small task", () => {
    const markup = render("Fix the typo in the README heading", "xhigh");
    expect(markup).toContain("Small task? Low effort costs less and may be enough.");
    expect(markup).toContain("Use Low");
    expect(markup).toContain("Dismiss");
  });

  it("offers a cheaper model when the effort is already light", () => {
    const markup = render("Fix the typo in the README heading", "medium", [...effortModel, haiku]);
    expect(markup).toContain("Small task? Claude Haiku 5.5 costs less and may be enough.");
    expect(markup).toContain("Switch to Claude Haiku 5.5");
  });

  it("says nothing for a large task, an empty prompt, or a light setting with nothing cheaper", () => {
    expect(render("Refactor the whole auth module", "xhigh")).toBe("");
    expect(render("", "xhigh")).toBe("");
    expect(render("Fix the typo in the README heading", "low")).toBe("");
  });

  it("renders nothing without a draft or a chat to keep the setting in", () => {
    expect(
      renderToStaticMarkup(
        <ProviderDownshiftNotice
          input={{
            provider: PROVIDER,
            model: MODEL,
            models: effortModel,
            modelOptions: undefined,
            prompt: "Fix the typo in the README heading",
            onPromptChange: () => {},
            planModeEnabled: true,
          }}
          extras={extras}
        />,
      ),
    ).toBe("");
  });
});
