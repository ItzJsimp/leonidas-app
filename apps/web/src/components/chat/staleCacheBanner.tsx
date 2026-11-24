import { useState, useSyncExternalStore } from "react";
import { ClockIcon } from "lucide-react";
import { cacheStatus, type CacheObservation } from "@t3tools/client-runtime/cache-awareness";
import { cacheClock } from "../../lib/cacheAwarenessStore";
import { COMPACTION_SUGGESTION_MIN_TOKENS } from "@t3tools/shared/claudeCompaction";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import { formatTokenCount } from "./contextReceipt";

/** Tokens the next message would re-read at full price, or null when no banner is due. */
export function staleCacheTokens(input: {
  cacheState: string;
  usedTokens: number | null | undefined;
}): number | null {
  const tokens = input.usedTokens;
  if (input.cacheState !== "possibly-expired") return null;
  if (typeof tokens !== "number" || !Number.isFinite(tokens)) return null;
  return tokens >= COMPACTION_SUGGESTION_MIN_TOKENS ? tokens : null;
}

/** The hook snapshot: the token count, so an unchanged answer never re-renders the composer. */
export function staleTokensAt(
  input: {
    observation: CacheObservation | null;
    usedTokens: number | null | undefined;
    enabled: boolean;
  },
  now: number,
): number | null {
  if (!input.enabled) return null;
  return staleCacheTokens({
    cacheState: cacheStatus(input.observation, now).state,
    usedTokens: input.usedTokens,
  });
}

export function useStaleCacheTokens(input: {
  observation: CacheObservation | null;
  usedTokens: number | null | undefined;
  enabled: boolean;
}): number | null {
  // The 30 second clock tick re-renders the composer only when this value changes.
  return useSyncExternalStore(
    cacheClock.subscribe,
    () => staleTokensAt(input, cacheClock.read()),
    () => null,
  );
}

export function useStaleCacheBanner({
  chatKey,
  tokens,
  disabled,
  onCompact,
}: {
  chatKey: string;
  tokens: number | null;
  disabled: boolean;
  onCompact: () => void;
}): ComposerBannerStackItem | null {
  // Session-only: a new session asks again, because the cost is real each time.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (tokens === null || dismissedKey === chatKey) return null;
  return {
    id: "stale-cache",
    variant: "info",
    icon: <ClockIcon />,
    title: "Cache expired",
    description: `Next message re-reads ${formatTokenCount(tokens)} tokens.`,
    dismissLabel: "Dismiss cache notice",
    onDismiss: () => setDismissedKey(chatKey),
    actions: (
      <Button size="xs" variant="ghost" disabled={disabled} onClick={onCompact}>
        Compact first
      </Button>
    ),
  };
}
