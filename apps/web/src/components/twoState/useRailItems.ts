import { useLocalStorage } from "~/hooks/useLocalStorage";
import {
  EMPTY_SETUP_STATE,
  SETUP_STATE_STORAGE_KEY,
  SetupStateSchema,
} from "~/onboarding/setupState.logic";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { usePrimaryEnvironment } from "~/state/environments";

import { pinnableItems, railItems } from "./railItems";
import { useChatPanelPins } from "./useChatPanelPins";
import { useRailShowAnyway } from "./useRailShowAnyway";

/**
 * The rail and the chat panel read the same tabs, so a pin moves a tab from one to the other.
 * `ignorePins` keeps every tab on the rail: the narrow-window drawer shows no chat panel.
 */
export function useRailItems({ ignorePins = false }: { readonly ignorePins?: boolean } = {}) {
  const { active } = useActiveAiosWorkspace();
  const [setup] = useLocalStorage(SETUP_STATE_STORAGE_KEY, EMPTY_SETUP_STATE, SetupStateSchema);
  const { shown: showAnyway } = useRailShowAnyway(active?.id);
  const { pins, toggle } = useChatPanelPins();
  const scribe = usePrimaryEnvironment()?.serverConfig?.environment.platform.os === "windows";
  const input = {
    business: active?.type === "business",
    trading: active?.type === "trading",
    builder: setup.coder === true,
    showAnyway,
    scribe,
    pinned: ignorePins ? [] : pins,
  };
  return { ...railItems(input), pinnable: pinnableItems(input), togglePin: toggle };
}
