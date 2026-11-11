import { CheckIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { AnimatedHeight } from "../AnimatedHeight";
import { DialogPopup, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
import { ScrollArea } from "./scroll-area";

export function WizardPopup({
  children,
  size = "default",
  ...props
}: Omit<ComponentProps<typeof DialogPopup>, "className" | "style"> & {
  readonly size?: "default" | "wide";
}) {
  return (
    <DialogPopup {...props} className={size === "wide" ? "max-w-3xl" : "max-w-xl"}>
      <ScrollArea className="*:data-[slot=scroll-area-scrollbar]:data-[orientation=vertical]:my-4">
        <div className="flex min-h-0 flex-col">{children}</div>
      </ScrollArea>
    </DialogPopup>
  );
}

export function WizardHeader({
  title,
  description,
  identity,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly identity?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <DialogHeader>
      <DialogTitle className={identity ? "sr-only" : undefined}>{title}</DialogTitle>
      {identity}
      {description ? <DialogDescription>{description}</DialogDescription> : null}
      {children}
    </DialogHeader>
  );
}

export function WizardFooter({
  children,
  leading,
}: {
  readonly children: ReactNode;
  readonly leading?: ReactNode;
}) {
  return (
    <DialogFooter variant="bare" className={leading ? "sm:justify-between" : undefined}>
      {leading}
      {leading ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row">{children}</div>
      ) : (
        children
      )}
    </DialogFooter>
  );
}

export function WizardSteps({
  steps,
  currentStep,
  summaries,
  showSummaries = false,
  onStepChange,
  isStepDisabled,
}: {
  readonly steps: readonly string[];
  readonly currentStep: number;
  readonly summaries?: readonly (string | null)[];
  readonly showSummaries?: boolean;
  readonly isStepDisabled?: (step: number) => boolean;
  readonly onStepChange?: (step: number) => void;
}) {
  const Step = onStepChange ? "button" : "div";
  // Many steps cannot all show a label in the dialog width. Only the current
  // step shows its name; the others show a number and a hover title.
  const compact = steps.length > 5;
  return (
    <ol
      className={cn(
        "gap-1 rounded-xl bg-background p-1 ring-1 ring-black/5 dark:bg-white/4 dark:ring-white/5",
        compact ? "flex" : "grid auto-cols-fr grid-flow-col",
      )}
      data-compact={compact ? "" : undefined}
      role="list"
      aria-label="Setup progress"
    >
      {steps.map((step, index) => (
        <li
          key={step}
          className={cn("min-w-0", compact && (index === currentStep ? "flex-none" : "flex-1"))}
        >
          <Step
            {...(onStepChange
              ? { type: "button" as const, disabled: isStepDisabled?.(index) }
              : {})}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:justify-center max-sm:px-2",
              onStepChange &&
                "cursor-pointer hover:bg-card disabled:cursor-default disabled:hover:bg-transparent",
              index === currentStep &&
                "bg-card text-foreground shadow-xs ring-1 ring-inset ring-black/5 hover:bg-card dark:shadow-none dark:ring-white/5",
            )}
            aria-current={index === currentStep ? "step" : undefined}
            title={compact ? step : undefined}
            aria-label={`${step}, step ${index + 1}${index < currentStep && summaries?.[index] ? `, ${summaries?.[index]}` : ""}`}
            onClick={onStepChange ? () => onStepChange(index) : undefined}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-sm font-medium ring-1",
                index < currentStep
                  ? "bg-primary text-primary-foreground ring-primary"
                  : index === currentStep
                    ? "bg-primary/10 text-primary ring-primary/30"
                    : "bg-card text-muted-foreground ring-black/10 dark:bg-white/5 dark:ring-white/10",
              )}
              aria-hidden
            >
              {index < currentStep ? <CheckIcon className="size-4 shrink-0" /> : index + 1}
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-sm font-medium max-sm:hidden",
                compact && index !== currentStep && "hidden",
                index === currentStep ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step}
              {showSummaries && index < currentStep && summaries?.[index]
                ? `: ${summaries[index]}`
                : null}
            </span>
          </Step>
        </li>
      ))}
    </ol>
  );
}

const WIZARD_STABLE_CONTENT_CLASS =
  // Short laptop windows keep the buttons on screen: the floor never passes the window height.
  "flex min-h-[min(35rem,calc(100dvh-12rem))] flex-col [&>:last-child]:mt-auto [&>:last-child]:pt-6";

export function WizardPanel({
  children,
  holdHeight = false,
  stableHeight = false,
  className,
}: {
  readonly children: ReactNode;
  readonly holdHeight?: boolean;
  /**
   * Give every step the same minimum height and pin its last child (the button row) to the
   * bottom, so a centred dialog keeps one top edge and one button position across steps.
   */
  readonly stableHeight?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="dialog-panel"
      className={cn(
        "min-w-0 space-y-4 bg-background/80 px-6 py-5 ring-1 ring-black/5 dark:bg-white/2 dark:ring-white/5",
        className,
      )}
    >
      <AnimatedHeight holdHeight={holdHeight}>
        {stableHeight ? (
          <div data-slot="wizard-stable-content" className={WIZARD_STABLE_CONTENT_CLASS}>
            {children}
          </div>
        ) : (
          children
        )}
      </AnimatedHeight>
    </div>
  );
}
