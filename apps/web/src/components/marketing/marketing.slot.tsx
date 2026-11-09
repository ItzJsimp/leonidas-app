import { defineSlots } from "../twoState/slots";
import { useNeedsApprovalCount } from "./state";

/**
 * Plugs Marketing into the header stats. The glob in SlotOutlet finds this file. Approval
 * requests reach the Command Center through the Needs you card, so there is no home card.
 */
export const slots = defineSlots({
  headerStat: [
    {
      id: "marketing-needs-approval",
      order: 50,
      label: "Needs approval",
      useValue: useNeedsApprovalCount,
    },
  ],
});
