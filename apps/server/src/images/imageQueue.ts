/**
 * Pure queue rules for the Images panel. No I/O here.
 *
 * - One image runs at a time. A 12 GB card cannot hold two big models.
 * - Order is first in, first out. Inside one press the order is model by model, then seed by seed.
 *   Fewer model changes means fewer slow model loads.
 * - When the model changes, the source frees graphics memory before the next image.
 */
import { IMAGES_MAX_VARIATIONS, type ImageItemStatus } from "@t3tools/contracts";

export interface PlannedImage {
  readonly modelId: string;
  readonly seed: number;
}

/** Highest seed the random pick returns. It stays far below every engine limit. */
export const MAX_RANDOM_SEED = 2 ** 32 - 1;

export function pickRandomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * MAX_RANDOM_SEED);
}

/** Turns one Generate press into a list of images. Seed i is `seed + i`. */
export function expandVariations(input: {
  readonly modelIds: ReadonlyArray<string>;
  readonly seed: number;
  readonly count: number;
}): ReadonlyArray<PlannedImage> {
  const count = Math.max(1, Math.min(Math.trunc(input.count), IMAGES_MAX_VARIATIONS));
  const modelIds = [...new Set(input.modelIds)];
  return modelIds.flatMap((modelId) =>
    Array.from({ length: count }, (_, index) => ({ modelId, seed: input.seed + index })),
  );
}

/** True when the source must free graphics memory before this image. The first image counts as a change. */
export function shouldFreeMemory(previousModelId: string | null, nextModelId: string): boolean {
  return previousModelId !== nextModelId;
}

export interface QueueEntry {
  status: ImageItemStatus;
}

/** Holds the entries in arrival order and hands out the next waiting one. */
export class ImageQueue<T extends QueueEntry> {
  private entries: T[] = [];

  get items(): ReadonlyArray<T> {
    return this.entries;
  }

  enqueue(items: ReadonlyArray<T>): void {
    this.entries.push(...items);
  }

  /** Takes the oldest waiting entry and marks it running. Returns undefined when nothing waits. */
  claimNext(): T | undefined {
    if (this.entries.some((entry) => entry.status === "running")) return undefined;
    const next = this.entries.find((entry) => entry.status === "waiting");
    if (next) next.status = "running";
    return next;
  }

  /** Marks every waiting entry cancelled. The running entry stays. Returns the changed entries. */
  cancelWaiting(matches: (entry: T) => boolean = () => true): T[] {
    const cancelled = this.entries.filter((entry) => entry.status === "waiting" && matches(entry));
    for (const entry of cancelled) entry.status = "cancelled";
    return cancelled;
  }

  remove(entry: T): void {
    this.entries = this.entries.filter((candidate) => candidate !== entry);
  }

  running(): T | undefined {
    return this.entries.find((entry) => entry.status === "running");
  }

  /** Drops the oldest finished entries so a long session stays small. Waiting and running stay. */
  trim(maxEntries: number): void {
    let excess = this.entries.length - maxEntries;
    if (excess <= 0) return;
    this.entries = this.entries.filter((entry) => {
      if (excess > 0 && entry.status !== "waiting" && entry.status !== "running") {
        excess -= 1;
        return false;
      }
      return true;
    });
  }
}
