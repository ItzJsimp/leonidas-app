import { cn } from "~/lib/utils";

import { TOPSTEPX_EXPORT_STEPS } from "./journal.logic";

/** The 5 TopstepX export steps as an ordered list. */
export function ExportGuide({ className }: { readonly className?: string }) {
  return (
    <ol className={cn("list-decimal space-y-1 ps-5 text-sm text-muted-foreground", className)}>
      {TOPSTEPX_EXPORT_STEPS.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
