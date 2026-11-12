import { cn } from "~/lib/utils";

import { avatarIdFor, avatarUrl } from "./avatar.logic";

export type AvatarSize = 20 | 36 | 56;

/**
 * An agent's felt avatar as a circle. 125% size and a 3% top offset keep the whole head in view
 * (skill note). A missing or unknown avatar falls back to the library id that the name holds,
 * and then to the default `helper` avatar, so every agent shows a felt character.
 * The name always shows beside it, so the circle is decoration.
 */
export function AgentAvatar(props: {
  readonly avatar: string | null | undefined;
  readonly name: string;
  readonly size?: AvatarSize;
  readonly className?: string;
}) {
  const size = props.size ?? 36;
  const id = avatarIdFor(props.avatar, props.name);
  return (
    <span
      aria-hidden
      data-avatar={id}
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full bg-muted", props.className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${avatarUrl(id)})`,
        backgroundSize: "125%",
        backgroundPosition: "50% 3%",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
