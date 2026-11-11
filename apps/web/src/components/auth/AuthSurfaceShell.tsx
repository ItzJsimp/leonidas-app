import type { ReactNode } from "react";

import { APP_TITLE, APP_STAGE_LABEL } from "../../branding";
import { resolveSidebarStageBackdropVariant, StageBackdropArt } from "../SidebarStageBackdrop";
import { StandalonePage } from "../ui/standalone-page";

export function AuthSurfaceShell({ children }: { readonly children: ReactNode }) {
  const stageVariant = resolveSidebarStageBackdropVariant(APP_STAGE_LABEL);

  return (
    <StandalonePage
      tone="brand"
      masthead={
        <header className="relative h-24 overflow-hidden border-b border-border bg-muted text-foreground">
          {stageVariant ? (
            <div className="absolute inset-0" aria-hidden>
              <StageBackdropArt variant={stageVariant} />
            </div>
          ) : null}
          <div className="relative h-full p-5 sm:p-6">
            <p className="text-3xs font-semibold tracking-widest text-muted-foreground uppercase">
              {APP_TITLE}
            </p>
          </div>
        </header>
      }
    >
      {children}
    </StandalonePage>
  );
}
