import { cn } from "../../../lib/utils";

/** Setup progress: blue for the step in view, green for finished steps, gray for the rest. */
export function SetupProgress({
  steps,
  currentStep,
  done,
}: {
  readonly steps: readonly string[];
  readonly currentStep: number;
  readonly done: readonly boolean[];
}) {
  return (
    <div className="flex items-center gap-3">
      <ol className="flex gap-1.5" aria-label="Setup progress">
        {steps.map((step, index) => {
          const current = index === currentStep;
          const status = current ? "current step" : done[index] ? "done" : "to do";
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              aria-label={`${step}, ${status}`}
              className={cn(
                "h-1 w-8 rounded-full",
                current ? "bg-state" : done[index] ? "bg-success" : "bg-input",
              )}
            />
          );
        })}
      </ol>
      <span className="text-xs text-muted-foreground tabular-nums">
        {currentStep + 1} of {steps.length}
      </span>
    </div>
  );
}
