import { defineSlots } from "../twoState/slots";
import { HomeDashboard } from "./HomeDashboard";

/**
 * The Command Center cards, as one block right after the setup card (order 10) and before the
 * workspace cards. Each card shows one live number and opens its tab.
 */
export const slots = defineSlots({
  ccHome: [{ id: "cc-dashboard", order: 11, Component: HomeDashboard }],
});
