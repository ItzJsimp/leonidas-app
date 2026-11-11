import { cn } from "~/lib/utils";

import { avatarId, avatarUrl, initials } from "./avatar.logic";

export type AvatarSize = 20 | 36 | 56;

/**
 * An agent's felt avatar as a circle. 125% size and a 3% top offset keep the whole head in view
 * (skill note). An unknown or missing avatar shows the initials of the name instead.
 * The name always shows beside it, so the circle is decoration.
 */
export function AgentAvatar(props: {
  readonly avatar: string | null | undefined;
  readonly name: string;
  readonly size?: AvatarSize;
  readonly className?: string;
}) {
  const size = props.size ?? 36;
  const id = avatarId(props.avatar);
  return (
    <span
      aria-hidden
      data-avatar={id ?? "initials"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground",
        props.className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        ...(id === null
          ? {}
          : {
              backgroundImage: `url(${avatarUrl(id)})`,
              backgroundSize: "125%",
              backgroundPosition: "50% 3%",
              backgroundRepeat: "no-repeat",
            }),
      }}
    >
      {id === null ? initials(props.name) : null}
    </span>
  );
}
