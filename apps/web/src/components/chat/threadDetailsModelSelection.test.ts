import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";
import { resolveThreadDetailsModelSelection } from "./threadDetailsModelSelection";
import { formatModelSelectionEffort } from "@t3tools/client-runtime/state/thread-execution";
import { formatModelSlugName } from "@t3tools/shared/model";

describe("draft chat details model", () => {
  const input = {
    isServerThread: false,
    instanceId: ProviderInstanceId.make("claudeAgent"),
    threadSelection: undefined,
    draftModel: "claude-sonnet-5",
    draftOptions: [{ id: "effort", value: "high" }],
  };

  it("shows the composer model and effort before the first send", () => {
    const selection = resolveThreadDetailsModelSelection(input)!;
    expect(formatModelSlugName(selection.model)).toBe("Claude Sonnet 5");
    expect(
      formatModelSelectionEffort(selection, [
        {
          slug: input.draftModel,
          name: "Claude Sonnet 5",
          isCustom: false,
          capabilities: {
            optionDescriptors: [
              {
                id: "effort",
                label: "Reasoning",
                type: "select",
                options: [{ id: "high", label: "High" }],
              },
            ],
          },
        },
      ]),
    ).toBe("High");
    expect(selection.instanceId).toBe(input.instanceId);
  });

  it("keeps the saved selection after the server owns the thread", () => {
    const threadSelection = { instanceId: input.instanceId, model: "claude-opus-5" };
    expect(
      resolveThreadDetailsModelSelection({ ...input, isServerThread: true, threadSelection }),
    ).toBe(threadSelection);
    expect(resolveThreadDetailsModelSelection({ ...input, instanceId: null })).toBeUndefined();
  });
});
