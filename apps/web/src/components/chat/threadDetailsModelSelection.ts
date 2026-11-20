import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

export function resolveThreadDetailsModelSelection(input: {
  isServerThread: boolean;
  instanceId: ProviderInstanceId | null;
  threadSelection: ModelSelection | undefined;
  draftModel: string;
  draftOptions: ModelSelection["options"] | undefined;
}) {
  return input.isServerThread || input.instanceId === null
    ? input.threadSelection
    : createModelSelection(input.instanceId, input.draftModel, input.draftOptions);
}
