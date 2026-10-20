import { describe, expect, it } from "vite-plus/test";

import { PRIMER_CARDS } from "./primer.logic";

describe("PRIMER_CARDS", () => {
  it("covers model, switching, effort and skills, in that order", () => {
    expect(PRIMER_CARDS.map((card) => card.id)).toEqual(["model", "switch", "effort", "skills"]);
  });

  it("keeps each card short: at most 3 sentences of 20 words or fewer (ASD-STE100)", () => {
    for (const card of PRIMER_CARDS) {
      const sentences = card.body.split(/(?<=\.)\s+/);
      expect(sentences.length, card.id).toBeLessThanOrEqual(3);
      for (const sentence of sentences) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20);
      }
      expect(card.body, card.id).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    }
  });
});
