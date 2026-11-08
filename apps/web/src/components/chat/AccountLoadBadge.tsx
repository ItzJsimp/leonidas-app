import { memo } from "react";

import { cn } from "~/lib/utils";

interface AccountLoadProps {
  readonly chats: number;
  readonly running: number;
}

/** "5 open chats, 2 running". Empty when the account has no chats. */
export function accountLoadLabel({ chats, running }: AccountLoadProps): string {
  if (chats <= 0) return "";
  const open = `${chats} open ${chats === 1 ? "chat" : "chats"}`;
  return running > 0 ? `${open}, ${running} running` : open;
}

/**
 * Corner badge for a provider rail icon: how many chats are open on the account.
 * Green while an agent runs, grey when all are quiet. Renders nothing at zero.
 * Place inside a `relative` wrapper. Screen readers get the text from the button label.
 */
export const AccountLoadBadge = memo(function AccountLoadBadge(props: AccountLoadProps) {
  if (props.chats <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-40 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background px-1 text-3xs font-bold tabular-nums shadow-sm",
        props.running > 0
          ? "bg-success text-white"
          : "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      {props.chats > 9 ? "9+" : props.chats}
    </span>
  );
});
