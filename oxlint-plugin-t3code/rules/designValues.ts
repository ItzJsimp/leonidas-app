/** Motion durations and text sizes typed as raw values, where a token exists (DESIGN.md M1, T1). */
const TYPED_DESIGN_VALUE =
  /(?<![\w-])(?:duration-(?:[1-9]\d*|\[\d[^\]\s]*\])|text-\[(?:length:)?\d*\.?\d+(?:px|rem|em|pt)\])(?![\w-])/gu;

export const typedDesignValues = (source: string): ReadonlyArray<string> =>
  source.match(TYPED_DESIGN_VALUE) ?? [];
