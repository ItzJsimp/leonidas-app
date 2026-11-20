import { cn } from "~/lib/utils";

import { AgentAvatar } from "./Avatar";
import { AVATAR_IDS, avatarId, avatarValue } from "./avatar.logic";

/**
 * The felt library as a grid of circles. One is picked at a time. The name of each shows as its
 * accessible label, and the picked one has a ring that sits inside its own box.
 */
export function AvatarPicker(props: {
  readonly value: string;
  readonly onChange: (avatar: string) => void;
  readonly label?: string;
}) {
  const picked = avatarId(props.value);
  return (
    <div
      role="radiogroup"
      aria-label={props.label ?? "Avatar"}
      className="grid grid-cols-8 gap-1.5"
    >
      {AVATAR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={picked === id}
          aria-label={id}
          onClick={() => props.onChange(avatarValue(id))}
          className={cn(
            "flex items-center justify-center rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            picked === id ? "bg-accent ring-2 ring-inset ring-primary" : "hover:bg-accent/60",
          )}
        >
          <AgentAvatar avatar={avatarValue(id)} name={id} size={36} />
        </button>
      ))}
    </div>
  );
}
