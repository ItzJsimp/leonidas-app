export interface AiosLimit {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly default: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
}

export function readLimits(text: string): AiosLimit[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The AIOS limits file is invalid.");
  }
  return Object.entries(parsed).map(([id, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("An AIOS limit is invalid.");
    }
    const { label, value, default: defaultValue, unit, min, max } = entry;
    if (
      typeof label !== "string" ||
      typeof unit !== "string" ||
      ![value, defaultValue, min, max].every(Number.isSafeInteger) ||
      min > max ||
      value < min ||
      value > max ||
      defaultValue < min ||
      defaultValue > max
    ) {
      throw new Error(`The AIOS limit ${id} is invalid.`);
    }
    return { id, label, value, default: defaultValue, unit, min, max };
  });
}

export function updateLimit(text: string, id: string, value: number): string {
  const limits = readLimits(text);
  const limit = limits.find((entry) => entry.id === id);
  if (!limit || !Number.isSafeInteger(value) || value < limit.min || value > limit.max) {
    throw new Error("Enter a whole number within the limit's range.");
  }
  const values = new Map(limits.map((entry) => [entry.id, entry.id === id ? value : entry.value]));
  const review = values.get("thread_review_turns");
  const handoff = values.get("thread_handoff_turns");
  const hard = values.get("thread_hard_turns");
  if (
    review !== undefined &&
    handoff !== undefined &&
    hard !== undefined &&
    (review > handoff || handoff > hard)
  ) {
    throw new Error("Thread limits must be in order: review, handoff, then hard limit.");
  }
  const parsed = JSON.parse(text);
  parsed[id].value = value;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}
