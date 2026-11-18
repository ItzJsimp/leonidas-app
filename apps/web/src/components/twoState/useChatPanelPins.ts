import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import { DEFAULT_PINS } from "./railItems";

const STORAGE_KEY = "leonidas:chat-panel-pins";
const PinsSchema = Schema.Array(Schema.String);

/** Rail tabs pinned into the chat panel under New chat, and a way to flip one. */
export function useChatPanelPins() {
  const [pins, setPins] = useLocalStorage(STORAGE_KEY, DEFAULT_PINS, PinsSchema);
  const toggle = (tabId: string, on: boolean) =>
    setPins(on ? [...pins.filter((id) => id !== tabId), tabId] : pins.filter((id) => id !== tabId));
  return { pins, toggle };
}
