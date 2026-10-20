import { expect, it } from "vite-plus/test";

import { PIN_TIP } from "./pinTip";

it("keeps each sentence of the pin tip at 20 words or fewer", () => {
  for (const sentence of PIN_TIP.split(/(?<=\.)\s+/)) {
    expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(20);
  }
});
