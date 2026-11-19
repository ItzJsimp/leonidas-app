import type { DesktopUpdateState } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => 0 }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useLocation: () => "Chat",
}));
vi.mock("../../env", () => ({ isElectron: true }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentIdentificationMode: () => "none" }));
vi.mock("../../state/desktopUpdate", () => ({
  useDesktopUpdateState: (): DesktopUpdateState => ({
    enabled: true,
    status: "downloaded",
    channel: "latest",
    currentVersion: "0.98.0",
    hostArch: "x64",
    appArch: "x64",
    runningUnderArm64Translation: false,
    availableVersion: "0.99.0",
    downloadedVersion: "0.99.0",
    releaseNotes: [],
    omittedReleaseCount: 0,
    downloadPercent: 100,
    checkedAt: "2026-11-19T00:00:00.000Z",
    message: null,
    errorContext: null,
    canRetry: false,
  }),
  useUpdatePreferencesStore: (
    selector: (s: { updateNotice: "all"; autoUpdateWhenSafe: true }) => unknown,
  ) => selector({ updateNotice: "all", autoUpdateWhenSafe: true }),
}));
vi.mock("../../state/threads", () => ({ runningThreadCountAtom: {} }));
vi.mock("../SidebarStageBackdrop", () => ({
  resolveEnvironmentIdentificationPillLabel: () => null,
  resolveSidebarStageBackdropVariant: () => null,
  SidebarStageBackdrop: () => null,
  useEnvironmentStageLabel: () => null,
}));
vi.mock("../desktop/ReleaseHistoryDialog", () => ({ openReleaseHistoryDialog: vi.fn() }));
vi.mock("~/lib/observeResize", () => ({ observeResize: vi.fn() }));
vi.mock("./SidebarNoAiBanner", () => ({ SidebarNoAiBanner: () => null }));
vi.mock("./SidebarProviderUpdatePill", () => ({ SidebarProviderUpdatePill: () => null }));
vi.mock("./SidebarThreadUndoNotice", () => ({ SidebarThreadUndoNotice: () => null }));

import { SidebarChromeFooter } from "./SidebarChrome";

describe("SidebarChromeFooter", () => {
  it("omits the duplicate Game Mode and Update ready pills", () => {
    const html = renderToStaticMarkup(<SidebarChromeFooter />);
    expect(html).not.toContain("Game Mode");
    expect(html).not.toContain("Update ready");
  });
});
