import { ProviderInstanceId, RunId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  resolveHandoffEndpoints,
  resolveModelSwitchChange,
  type HandoffTimelineRun,
} from "./handoff.ts";

const from = ProviderInstanceId.make("codex_personal");
const to = ProviderInstanceId.make("claudeAgent");
const item = {
  runId: RunId.make("target"),
  fromProviderInstanceIds: [from],
  toProviderInstanceId: to,
};
const run = (
  id: string,
  ordinal: number,
  instanceId: ProviderInstanceId,
  model: string,
): HandoffTimelineRun => ({
  id: RunId.make(id),
  ordinal,
  providerInstanceId: instanceId,
  modelSelection: { instanceId, model },
});

describe("handoff endpoints shared by web and mobile", () => {
  it("preserves stamped models including several models from the same provider", () => {
    const fromModelSelections = [
      { instanceId: from, model: "source-a" },
      { instanceId: from, model: "source-b" },
    ];
    expect(
      resolveHandoffEndpoints({ ...item, fromModelSelections, toModel: "destination" }, [
        run("target", 2, to, "later-model"),
      ]),
    ).toEqual({
      from: fromModelSelections,
      to: { instanceId: to, model: "destination" },
    });
  });

  it("recovers legacy models from the handoff run and latest earlier source run", () => {
    const runs = [
      run("later", 4, from, "wrong-later-model"),
      run("old", 1, from, "old-model"),
      run("target", 3, to, "destination"),
      run("source", 2, from, "source-model"),
    ];
    expect(resolveHandoffEndpoints(item, runs)).toEqual({
      from: [{ instanceId: from, model: "source-model" }],
      to: { instanceId: to, model: "destination" },
    });
  });

  it("retains provider identities when historical runs are not loaded", () => {
    expect(resolveHandoffEndpoints(item, [])).toEqual({
      from: [{ instanceId: from, model: undefined }],
      to: { instanceId: to, model: undefined },
    });
  });

  it("does not borrow a target model from another provider", () => {
    expect(
      resolveHandoffEndpoints(item, [run("target", 2, from, "wrong-model")]).to.model,
    ).toBeUndefined();
  });
});

describe("model switch labels", () => {
  const instanceId = ProviderInstanceId.make("claudeAgent");
  const selection = (model: string, effort?: string) => ({
    instanceId,
    model,
    ...(effort === undefined ? {} : { options: [{ id: "effort", value: effort }] }),
  });
  const providers = [
    {
      instanceId,
      models: [
        {
          slug: "opus",
          capabilities: {
            optionDescriptors: [
              {
                id: "effort",
                label: "Reasoning",
                type: "select",
                options: [
                  { id: "high", label: "High" },
                  { id: "max", label: "Max" },
                ],
              },
            ],
          },
        },
      ],
    },
  ] as unknown as ReadonlyArray<ServerProvider>;

  it("reports a model change without an effort", () => {
    expect(
      resolveModelSwitchChange({ from: selection("opus"), to: selection("sonnet") }, providers),
    ).toEqual({ modelChanged: true, effort: null });
  });

  it("reports an effort change with catalog labels", () => {
    expect(
      resolveModelSwitchChange(
        { from: selection("opus", "high"), to: selection("opus", "max") },
        providers,
      ),
    ).toEqual({ modelChanged: false, effort: { from: "High", to: "Max" } });
  });

  it("reports nothing when only an unset effort differs", () => {
    expect(
      resolveModelSwitchChange(
        { from: selection("opus", "high"), to: selection("opus") },
        providers,
      ),
    ).toBeNull();
  });
});
