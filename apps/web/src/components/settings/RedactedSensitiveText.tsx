import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const REDACTED_TEXT_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function redactedPlaceholder(value: string): string {
  let state = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }

  const nextChar = () => {
    state = Math.imul(state ^ (state >>> 13), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 16), 0xc2b2ae35);
    return REDACTED_TEXT_ALPHABET[Math.abs(state) % REDACTED_TEXT_ALPHABET.length] ?? "x";
  };

  return Array.from(value, (char) => {
    if (char === "@" || char === "." || char === "-" || char === "_") return char;
    return nextChar();
  }).join("");
}

/**
 * `j••••••@gmail.com`: a crisp mask that keeps the first character and the domain behind a
 * fixed bullet run, so the hidden part never leaks its length.
 */
export function maskedSensitiveText(value: string): string {
  const at = value.indexOf("@");
  const head = at > 0 ? value.slice(0, at) : value;
  const tail = at > 0 ? value.slice(at) : "";
  return `${head.slice(0, 1)}${"•".repeat(6)}${tail}`;
}

export function RedactedSensitiveText(props: {
  readonly value: string | null | undefined;
  readonly ariaLabel: string;
  readonly revealTooltip: string;
  readonly hideTooltip: string;
  readonly className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const value = props.value?.trim();
  const masked = value ? maskedSensitiveText(value) : "";

  if (!value) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-2xs leading-normal text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              props.className,
            )}
            onClick={() => setRevealed((current) => !current)}
            aria-label={props.ariaLabel}
            aria-pressed={revealed}
          >
            <span className="min-w-0 truncate">{revealed ? value : masked}</span>
            {revealed ? (
              <EyeOffIcon aria-hidden className="size-3 shrink-0 opacity-70" />
            ) : (
              <EyeIcon aria-hidden className="size-3 shrink-0 opacity-70" />
            )}
          </button>
        }
      />
      <TooltipPopup side="top">{revealed ? props.hideTooltip : props.revealTooltip}</TooltipPopup>
    </Tooltip>
  );
}
