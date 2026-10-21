import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { SettingsScopeProvider } from "../settings/SettingsScopeContext";
import { Spinner } from "../ui/spinner";

const DiagnosticsPanel = lazy(() =>
  import("../settings/DiagnosticsSettings").then((module) => ({
    default: module.DiagnosticsSettingsPanel,
  })),
);

const ignoreScopeChange = () => {};

/**
 * Processes, resource history, traces and logs for this computer. The panel
 * starts its server reads only once the section nears the viewport.
 */
export function PcDiagnostics() {
  const environmentId = usePrimaryEnvironmentId();
  const search = useMemo(() => ({ machine: environmentId ?? undefined }), [environmentId]);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (visible || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="flex min-h-24 flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Diagnostics</h2>
      {visible ? (
        <SettingsScopeProvider search={search} onChange={ignoreScopeChange}>
          <Suspense fallback={<Spinner />}>
            <DiagnosticsPanel />
          </Suspense>
        </SettingsScopeProvider>
      ) : null}
    </div>
  );
}
