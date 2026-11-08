import { CopyIcon } from "lucide-react";
import { Fragment, useRef, type ComponentProps, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { showAnchoredCopyErrorToast, showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { bindingKeys } from "./settings.logic";

/** A shortcut as key caps. Screen readers hear the plain text, for example "Ctrl + Shift + A". */
export function KeyCaps(props: { readonly binding: string; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center", props.className)}>
      <span className="sr-only">{props.binding}</span>
      <KbdGroup aria-hidden>
        {bindingKeys(props.binding).map((key, index) => (
          <Fragment key={`${index}-${key}`}>
            {index > 0 ? <span className="text-xs text-muted-foreground">+</span> : null}
            <Kbd className="h-6 min-w-6">{key}</Kbd>
          </Fragment>
        ))}
      </KbdGroup>
    </span>
  );
}

/** A ghost icon button. Its label is both the accessible name and the tooltip. */
export function IconButton(
  props: Omit<ComponentProps<typeof Button>, "aria-label" | "children"> & {
    readonly label: string;
    readonly children: ReactNode;
  },
) {
  const { label, children, ...rest } = props;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button size="icon-sm" variant="ghost" aria-label={label} {...rest} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

/** An icon button that copies text and says "Copied" next to itself. */
export function CopyButton(props: { readonly text: string; readonly label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <IconButton
      ref={ref}
      label={props.label}
      onClick={() =>
        void navigator.clipboard.writeText(props.text).then(
          () => showAnchoredCopySuccessToast(ref),
          (error: unknown) =>
            showAnchoredCopyErrorToast(
              ref,
              error instanceof Error ? error : new Error(String(error)),
            ),
        )
      }
    >
      <CopyIcon aria-hidden />
    </IconButton>
  );
}
