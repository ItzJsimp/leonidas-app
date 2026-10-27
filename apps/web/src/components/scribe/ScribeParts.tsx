import { CopyIcon } from "lucide-react";
import { Fragment, useRef } from "react";

import { cn } from "~/lib/utils";
import { showAnchoredCopyErrorToast, showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
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
            <Kbd className="h-6 min-w-6 border border-border bg-background px-1.5 text-foreground shadow-xs/5">
              {key}
            </Kbd>
          </Fragment>
        ))}
      </KbdGroup>
    </span>
  );
}

/** An icon button that copies text and says "Copied" next to itself. */
export function CopyButton(props: { readonly text: string; readonly label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={ref}
      size="icon-sm"
      variant="ghost"
      aria-label={props.label}
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
    </Button>
  );
}
